/**
 * Input contract (spec: input_contract) and domain model.
 *
 * Pure module: no framework, DOM or storage imports. Validators return an
 * ErrorCode (resolved to human text by messages.ts, one code = one message).
 * Outer spaces are trimmed before validating; inner spaces are significant.
 * Numeric fields accept only the spec grammars — non-finite values, signs,
 * scientific notation and thousands separators are rejected.
 */

import { parsePriceToCents } from './money';

/** Domain error codes. One code = one message (see messages.ts). */
export type ErrorCode =
	| 'NO_ITEMS'
	| 'EXPORT_CLIENT_INVALID'
	| 'CLIENT_NAME_REQUIRED'
	| 'CLIENT_NAME_TOO_LONG'
	| 'EMAIL_INVALID'
	| 'EMAIL_TOO_LONG'
	| 'ADDRESS_TOO_LONG'
	| 'RUT_TOO_LONG'
	| 'ITEM_DESCRIPTION_REQUIRED'
	| 'ITEM_DESCRIPTION_TOO_LONG'
	| 'QUANTITY_INVALID'
	| 'PRICE_INVALID'
	| 'PRICE_BELOW_MINIMUM'
	| 'ITEM_LIMIT_REACHED';

/** Input limits from the spec input contract (limits_proposed_v2). */
export const LIMITS = {
	clientName: 120,
	email: 254,
	address: 240,
	rut: 30,
	description: 240,
	maxItems: 100
} as const;

export const MAX_ITEMS = LIMITS.maxItems;

/** Minimum unit price: $ 0,01 in cents. The grammar enforces the maximum (999999,99). */
export const MIN_UNIT_PRICE_CENTS = 1;

/** A validated budget item. Values are already normalized (trimmed) and valid. */
export interface BudgetItem {
	description: string;
	quantity: number; // 1..9999 integer
	unitPriceCents: number; // 1..99999999
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUANTITY_GRAMMAR = /^[1-9][0-9]{0,3}$/;
const UNIT_PRICE_GRAMMAR = /^(?:0|[1-9][0-9]{0,5})(?:[.,][0-9]{1,2})?$/;

/**
 * Normalize numeric input: trim strings, stringify numbers so non-finite
 * values ('Infinity', 'NaN') and scientific notation ('1e+21') fail the
 * grammars naturally.
 */
function normalizeNumeric(value: string | number): string {
	return typeof value === 'number' ? String(value) : value.trim();
}

function validateLength(
	value: string,
	max: number,
	tooLongCode: ErrorCode
): ErrorCode | null {
	return value.length > max ? tooLongCode : null;
}

/** Name is required; outer spaces trimmed first, inner spaces kept. */
export function validateClientName(value: string): ErrorCode | null {
	const trimmed = value.trim();
	if (trimmed === '') {
		return 'CLIENT_NAME_REQUIRED';
	}
	return validateLength(trimmed, LIMITS.clientName, 'CLIENT_NAME_TOO_LONG');
}

/** Email is optional: empty (or whitespace-only) is valid; present must be local@domain.tld. */
export function validateClientEmail(value: string): ErrorCode | null {
	const trimmed = value.trim();
	if (trimmed === '') {
		return null;
	}
	if (trimmed.length > LIMITS.email) {
		return 'EMAIL_TOO_LONG';
	}
	return EMAIL_PATTERN.test(trimmed) ? null : 'EMAIL_INVALID';
}

/** Address is optional; any non-empty content up to the limit is valid. */
export function validateClientAddress(value: string): ErrorCode | null {
	return validateLength(value.trim(), LIMITS.address, 'ADDRESS_TOO_LONG');
}

/** RUT is optional; any non-empty content up to the limit is valid. */
export function validateClientRut(value: string): ErrorCode | null {
	return validateLength(value.trim(), LIMITS.rut, 'RUT_TOO_LONG');
}

/** Item description is required; outer spaces trimmed first, inner spaces kept. */
export function validateItemDescription(value: string): ErrorCode | null {
	const trimmed = value.trim();
	if (trimmed === '') {
		return 'ITEM_DESCRIPTION_REQUIRED';
	}
	return validateLength(trimmed, LIMITS.description, 'ITEM_DESCRIPTION_TOO_LONG');
}

/** Parse a grammar-valid quantity string to an integer, 1..9999; null otherwise. */
export function parseQuantity(value: string | number): number | null {
	const normalized = normalizeNumeric(value);
	return QUANTITY_GRAMMAR.test(normalized) ? Number(normalized) : null;
}

/** Quantity must match ^[1-9][0-9]{0,3}$ (integer 1..9999, no signs/decimals). */
export function validateItemQuantity(value: string | number): ErrorCode | null {
	return parseQuantity(value) === null ? 'QUANTITY_INVALID' : null;
}

/**
 * Unit price must match the grammar (up to 6 integer digits, optional '.'
 * or ',' with 1-2 decimals — apparent thousands separators like '1.234' fail
 * the grammar) and respect the 0,01 minimum. '0' passes the grammar but fails
 * the minimum. The 999999,99 maximum is enforced by the grammar itself.
 */
export function validateItemUnitPrice(value: string | number): ErrorCode | null {
	const normalized = normalizeNumeric(value);
	if (!UNIT_PRICE_GRAMMAR.test(normalized)) {
		return 'PRICE_INVALID';
	}
	const cents = parsePriceToCents(normalized);
	if (cents === null || cents > 99999999) {
		return 'PRICE_INVALID';
	}
	return cents < MIN_UNIT_PRICE_CENTS ? 'PRICE_BELOW_MINIMUM' : null;
}

/** At 100 items the limit is reported and no further item is added. */
export function validateItemLimit(currentCount: number): ErrorCode | null {
	return currentCount >= MAX_ITEMS ? 'ITEM_LIMIT_REACHED' : null;
}
