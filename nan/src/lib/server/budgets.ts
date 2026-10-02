/**
 * Budget repository: CRUD over the SQLite budgets table.
 *
 * All input is validated server-side with the shared domain validators from
 * $lib/domain/validate before any database access; no validation logic is
 * duplicated here. Money stays in integer cents end to end: items are stored
 * and returned as domain `BudgetItem` values (JSON-encoded in the items
 * column).
 *
 * The `number` field is the session-generated PRES- identifier: it is stored
 * on create and preserved untouched on update (input.number is ignored).
 */

import { parsePriceToCents } from '$lib/domain/money';
import {
	parseQuantity,
	validateClientAddress,
	validateClientEmail,
	validateClientName,
	validateClientRut,
	validateItemDescription,
	validateItemLimit,
	validateItemQuantity,
	validateItemUnitPrice
} from '$lib/domain/validate';
import type { BudgetItem, ErrorCode } from '$lib/domain/validate';
import { getDatabase } from './db';

/** Expected API input shape (JSON body of POST/PUT). */
export interface BudgetInput {
	number: string;
	clientName: string;
	email: string;
	address: string;
	rut: string;
	items: BudgetItem[];
}

/** A stored budget, as returned by every repository read/write. */
export interface Budget extends BudgetInput {
	id: number;
	createdAt: string;
	updatedAt: string;
}

export type BudgetResult =
	| { ok: true; budget: Budget }
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'invalid'; code: ErrorCode };

/** createBudget never reports a missing resource, so its result has no not_found variant. */
export type CreateBudgetResult = { ok: true; budget: Budget } | { ok: false; code: ErrorCode };

type Parsed<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

/**
 * Session-generated identifier shape (see $lib/domain/session.ts). The
 * ErrorCode union has no dedicated code for a malformed or duplicated
 * identifier, so the generic client-data code is used (documented deviation).
 */
const PRES_NUMBER_PATTERN = /^PRES-\d{6}$/;
const NUMBER_ERROR_CODE: ErrorCode = 'EXPORT_CLIENT_INVALID';

interface BudgetRow {
	id: number;
	number: string;
	client_name: string;
	email: string;
	address: string;
	rut: string;
	items: string;
	created_at: string;
	updated_at: string;
}

const SELECT_COLUMNS =
	'id, number, client_name, email, address, rut, items, created_at, updated_at';

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Text fields must be strings; anything else is treated as empty and rejected by the validators. */
function toText(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** Quantity (and price) inputs accept the validator grammars: strings or numbers only. */
function isNumericInput(value: unknown): value is string | number {
	return typeof value === 'string' || typeof value === 'number';
}

/**
 * Normalize a unit price into integer cents.
 *
 * Numbers are integer cents: they are serialized to their canonical decimal
 * form (no grouping separator) so the shared grammar validator and its 0,01
 * minimum apply unchanged, then parsed straight back to cents. Strings go
 * through the validators as display input ('1500,50'). Anything else is
 * rejected.
 */
function priceToCents(value: unknown): Parsed<number> {
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value)) {
			return { ok: false, code: 'PRICE_INVALID' };
		}
		const sign = value < 0 ? '-' : '';
		const abs = Math.abs(value);
		const text = `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
		const error = validateItemUnitPrice(text);
		if (error !== null) {
			return { ok: false, code: error };
		}
		// The validator guarantees the grammar, so parsing cannot fail here and
		// round-trips to the original cents.
		return { ok: true, value: parsePriceToCents(text) as number };
	}
	if (typeof value === 'string') {
		const error = validateItemUnitPrice(value);
		if (error !== null) {
			return { ok: false, code: error };
		}
		return { ok: true, value: parsePriceToCents(value.trim()) as number };
	}
	return { ok: false, code: 'PRICE_INVALID' };
}

/** Validate and normalize the items array: at least one valid item, at most MAX_ITEMS. */
function parseItems(value: unknown): Parsed<BudgetItem[]> {
	if (!Array.isArray(value) || value.length === 0) {
		return { ok: false, code: 'NO_ITEMS' };
	}
	// validateItemLimit reports the limit when `currentCount` items are already
	// present and one more would be added; for a payload of N items the last
	// add happens with N - 1 present, so N > MAX_ITEMS is rejected and
	// N === MAX_ITEMS is accepted.
	const limitError = validateItemLimit(value.length - 1);
	if (limitError !== null) {
		return { ok: false, code: limitError };
	}
	const items: BudgetItem[] = [];
	for (const rawItem of value) {
		const source = isRecord(rawItem) ? rawItem : {};
		const description = toText(source.description);
		const descriptionError = validateItemDescription(description);
		if (descriptionError !== null) {
			return { ok: false, code: descriptionError };
		}
		if (!isNumericInput(source.quantity)) {
			return { ok: false, code: 'QUANTITY_INVALID' };
		}
		const quantityError = validateItemQuantity(source.quantity);
		if (quantityError !== null) {
			return { ok: false, code: quantityError };
		}
		// The grammar validation above guarantees a successful parse.
		const quantity = parseQuantity(source.quantity) as number;
		const price = priceToCents(source.unitPriceCents);
		if (!price.ok) {
			return price;
		}
		items.push({
			description: description.trim(),
			quantity,
			unitPriceCents: price.value
		});
	}
	return { ok: true, value: items };
}

/** Validate and normalize every client field of the input body (number handled separately). */
function parseBudgetFields(body: unknown): Parsed<Omit<BudgetInput, 'number'>> {
	const source = isRecord(body) ? body : {};
	const clientName = toText(source.clientName);
	const clientNameError = validateClientName(clientName);
	if (clientNameError !== null) {
		return { ok: false, code: clientNameError };
	}
	const email = toText(source.email);
	const emailError = validateClientEmail(email);
	if (emailError !== null) {
		return { ok: false, code: emailError };
	}
	const address = toText(source.address);
	const addressError = validateClientAddress(address);
	if (addressError !== null) {
		return { ok: false, code: addressError };
	}
	const rut = toText(source.rut);
	const rutError = validateClientRut(rut);
	if (rutError !== null) {
		return { ok: false, code: rutError };
	}
	const items = parseItems(source.items);
	if (!items.ok) {
		return items;
	}
	return {
		ok: true,
		value: {
			clientName: clientName.trim(),
			email: email.trim(),
			address: address.trim(),
			rut: rut.trim(),
			items: items.value
		}
	};
}

function rowToBudget(row: BudgetRow): Budget {
	// The items column is only ever written by this module from validated
	// BudgetItem[] values, so the JSON.parse cannot fail for stored rows.
	return {
		id: row.id,
		number: row.number,
		clientName: row.client_name,
		email: row.email,
		address: row.address,
		rut: row.rut,
		items: JSON.parse(row.items) as BudgetItem[],
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function getBudgetRow(id: number): BudgetRow | null {
	const row = getDatabase()
		.prepare(`SELECT ${SELECT_COLUMNS} FROM budgets WHERE id = ?`)
		.get(id);
	return row === undefined ? null : (row as unknown as BudgetRow);
}

/** All budgets, newest first (ids are monotonic via AUTOINCREMENT). */
export function listBudgets(): Budget[] {
	const rows = getDatabase()
		.prepare(`SELECT ${SELECT_COLUMNS} FROM budgets ORDER BY id DESC`)
		.all() as unknown as BudgetRow[];
	return rows.map(rowToBudget);
}

/** A single budget by id, or null when it does not exist. */
export function getBudget(id: number): Budget | null {
	const row = getBudgetRow(id);
	return row === null ? null : rowToBudget(row);
}

/** Create a budget from a JSON body; validates everything before touching the database. */
export function createBudget(body: unknown): CreateBudgetResult {
	const number = toText(isRecord(body) ? body.number : undefined);
	if (!PRES_NUMBER_PATTERN.test(number)) {
		return { ok: false, code: NUMBER_ERROR_CODE };
	}
	const fields = parseBudgetFields(body);
	if (!fields.ok) {
		return { ok: false, code: fields.code };
	}
	const db = getDatabase();
	const duplicate = db.prepare('SELECT id FROM budgets WHERE number = ?').get(number);
	if (duplicate !== undefined) {
		return { ok: false, code: NUMBER_ERROR_CODE };
	}
	const now = new Date().toISOString();
	const result = db
		.prepare(
			`INSERT INTO budgets (number, client_name, email, address, rut, items, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			number,
			fields.value.clientName,
			fields.value.email,
			fields.value.address,
			fields.value.rut,
			JSON.stringify(fields.value.items),
			now,
			now
		);
	return {
		ok: true,
		budget: {
			id: Number(result.lastInsertRowid),
			number,
			...fields.value,
			createdAt: now,
			updatedAt: now
		}
	};
}

/**
 * Update a budget's client fields and items. The stored PRES- number is
 * preserved by design: input.number is ignored. Returns not_found when the id
 * does not exist.
 */
export function updateBudget(id: number, body: unknown): BudgetResult {
	if (getBudgetRow(id) === null) {
		return { ok: false, reason: 'not_found' };
	}
	const fields = parseBudgetFields(body);
	if (!fields.ok) {
		return { ok: false, reason: 'invalid', code: fields.code };
	}
	getDatabase()
		.prepare(
			`UPDATE budgets
			 SET client_name = ?, email = ?, address = ?, rut = ?, items = ?, updated_at = ?
			 WHERE id = ?`
		)
		.run(
			fields.value.clientName,
			fields.value.email,
			fields.value.address,
			fields.value.rut,
			JSON.stringify(fields.value.items),
			new Date().toISOString(),
			id
		);
	return { ok: true, budget: getBudget(id) as Budget };
}

/** Delete a budget; true when a row was removed, false when the id was missing. */
export function deleteBudget(id: number): boolean {
	const result = getDatabase().prepare('DELETE FROM budgets WHERE id = ?').run(id);
	return Number(result.changes) > 0;
}
