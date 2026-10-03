import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseForTests } from './db';
import {
	createBudget,
	deleteBudget,
	getBudget,
	listBudgets,
	updateBudget,
	type Budget,
	type BudgetResult,
	type CreateBudgetResult
} from './budgets';

/**
 * Repository-layer tests against a disposable SQLite file. Each test gets a
 * fresh database file via DB_PATH + resetDatabaseForTests(), so tests never
 * observe each other's rows.
 */

const tempDir = mkdtempSync(join(tmpdir(), 'nan-budgets-'));
let fileCounter = 0;

beforeEach(() => {
	process.env.DB_PATH = join(tempDir, `budgets-${++fileCounter}.db`);
	resetDatabaseForTests();
});

afterAll(() => {
	resetDatabaseForTests();
	rmSync(tempDir, { recursive: true, force: true });
});

let presCounter = 0;

function validInput() {
	presCounter += 1;
	return {
		number: `PRES-${String(presCounter).padStart(6, '0')}`,
		clientName: '  Ada Lovelace  ',
		email: 'ada@example.com',
		address: 'Calle Falsa 123',
		rut: '12345678-9',
		items: [{ description: '  Consultoría  ', quantity: 2, unitPriceCents: 1500 }]
	};
}

type RepoResult = BudgetResult | CreateBudgetResult;

function created(result: RepoResult): Budget {
	expect(result.ok, JSON.stringify(result)).toBe(true);
	if (!result.ok) {
		throw new Error('expected a successful result');
	}
	return result.budget;
}

function rejected(result: RepoResult): { code: string } {
	expect(result.ok, JSON.stringify(result)).toBe(false);
	if (result.ok || !('code' in result)) {
		throw new Error('expected a validation rejection');
	}
	return { code: result.code };
}

describe('budgets repository', () => {
	it('creates and lists budgets newest first, preserving cents end to end', () => {
		const first = created(createBudget(validInput()));
		const second = created(createBudget(validInput()));

		expect(first.id).toBeGreaterThan(0);
		expect(first.clientName).toBe('Ada Lovelace');
		expect(first.items[0]?.description).toBe('Consultoría');

		const list = listBudgets();
		expect(list).toHaveLength(2);
		// Newest first: the second insert must come before the first one.
		expect(list[0]?.id).toBe(second.id);
		expect(list[1]?.id).toBe(first.id);
		// Money stays in integer cents through the roundtrip.
		expect(list[1]?.items[0]?.unitPriceCents).toBe(1500);
		expect(list[1]?.items[0]?.quantity).toBe(2);
	});

	it('gets a budget by id and returns null for a missing id', () => {
		const budget = created(createBudget(validInput()));

		expect(getBudget(budget.id)).toEqual(budget);
		expect(getBudget(999_999)).toBeNull();
	});

	it('updates a budget while preserving the stored number', () => {
		const original = created(createBudget(validInput()));
		const changedInput = {
			...validInput(),
			number: 'PRES-999999', // must be ignored: the stored number is preserved
			clientName: 'Grace Hopper',
			email: 'grace@example.com',
			items: [{ description: 'Desarrollo', quantity: 3, unitPriceCents: 250 }]
		};

		const result = updateBudget(original.id, changedInput);
		expect(result.ok, JSON.stringify(result)).toBe(true);

		const updated = created(result);
		expect(updated.id).toBe(original.id);
		expect(updated.number).toBe(original.number);
		expect(updated.clientName).toBe('Grace Hopper');
		expect(updated.email).toBe('grace@example.com');
		expect(updated.items[0]?.unitPriceCents).toBe(250);
		expect(updated.updatedAt >= original.updatedAt).toBe(true);
	});

	it('reports not_found when updating a missing budget', () => {
		const result = updateBudget(424_242, validInput());
		expect(result).toEqual({ ok: false, reason: 'not_found' });
	});

	it('deletes a budget and reports repeated deletes as false', () => {
		const budget = created(createBudget(validInput()));

		expect(deleteBudget(budget.id)).toBe(true);
		expect(getBudget(budget.id)).toBeNull();
		expect(deleteBudget(budget.id)).toBe(false);
	});

	it('rejects a duplicate PRES- number with the dedicated duplicate code', () => {
		const input = validInput();
		created(createBudget(input));
		expect(rejected(createBudget(input))).toEqual({ code: 'PRES_NUMBER_DUPLICATE' });
	});

	it('rejects an invalid client name', () => {
		const input = validInput();
		input.clientName = '   ';
		expect(rejected(createBudget(input))).toEqual({ code: 'CLIENT_NAME_REQUIRED' });
	});

	it('rejects a unit price below the minimum (0 cents)', () => {
		const input = validInput();
		input.items[0]!.unitPriceCents = 0;
		expect(rejected(createBudget(input))).toEqual({ code: 'PRICE_BELOW_MINIMUM' });
	});

	it('rejects an invalid quantity', () => {
		const input = validInput();
		input.items[0]!.quantity = 0;
		expect(rejected(createBudget(input))).toEqual({ code: 'QUANTITY_INVALID' });
	});

	it('rejects an invalid email', () => {
		const input = validInput();
		input.email = 'not-an-email';
		expect(rejected(createBudget(input))).toEqual({ code: 'EMAIL_INVALID' });
	});

	it('rejects a budget without items', () => {
		const input = validInput();
		input.items = [];
		expect(rejected(createBudget(input))).toEqual({ code: 'NO_ITEMS' });
	});
});
