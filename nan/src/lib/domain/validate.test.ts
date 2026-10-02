import { describe, expect, it } from 'vitest';
import {
	LIMITS,
	MAX_ITEMS,
	parseQuantity,
	validateClientAddress,
	validateClientEmail,
	validateClientName,
	validateClientRut,
	validateItemDescription,
	validateItemLimit,
	validateItemQuantity,
	validateItemUnitPrice
} from './validate';

describe('text trimming and required fields', () => {
	it('rejects whitespace-only required fields', () => {
		expect(validateClientName('   ')).toBe('CLIENT_NAME_REQUIRED');
		expect(validateItemDescription('\t \n')).toBe('ITEM_DESCRIPTION_REQUIRED');
	});

	it('trims outer spaces before validating', () => {
		expect(validateClientName('  Ana López  ')).toBeNull();
		expect(validateItemDescription('  Diseño web ')).toBeNull();
	});

	it('keeps inner spaces significant', () => {
		expect(validateClientName('Ana  López')).toBeNull();
		expect(validateClientAddress('Av. Siempre Viva 742')).toBeNull();
	});
});

describe('length limits', () => {
	it('enforces the client name limit (120)', () => {
		expect(validateClientName('a'.repeat(LIMITS.clientName))).toBeNull();
		expect(validateClientName('a'.repeat(LIMITS.clientName + 1))).toBe('CLIENT_NAME_TOO_LONG');
	});

	it('enforces the email limit (254)', () => {
		const local = 'a'.repeat(LIMITS.email - '@b.c'.length);
		expect(validateClientEmail(`${local}@b.c`)).toBeNull();
		expect(validateClientEmail(`${local}a@b.c`)).toBe('EMAIL_TOO_LONG');
	});

	it('enforces address (240) and RUT (30) limits', () => {
		expect(validateClientAddress('a'.repeat(LIMITS.address))).toBeNull();
		expect(validateClientAddress('a'.repeat(LIMITS.address + 1))).toBe('ADDRESS_TOO_LONG');
		expect(validateClientRut('2'.repeat(LIMITS.rut))).toBeNull();
		expect(validateClientRut('2'.repeat(LIMITS.rut + 1))).toBe('RUT_TOO_LONG');
	});

	it('enforces the description limit (240)', () => {
		expect(validateItemDescription('a'.repeat(LIMITS.description))).toBeNull();
		expect(validateItemDescription('a'.repeat(LIMITS.description + 1))).toBe(
			'ITEM_DESCRIPTION_TOO_LONG'
		);
	});

	it('enforces the maximum item count', () => {
		expect(MAX_ITEMS).toBe(100);
		expect(validateItemLimit(0)).toBeNull();
		expect(validateItemLimit(99)).toBeNull();
		expect(validateItemLimit(100)).toBe('ITEM_LIMIT_REACHED');
	});
});

describe('quantity grammar ^[1-9][0-9]{0,3}$', () => {
	it('accepts integers 1..9999', () => {
		for (const valid of ['1', '9', '10', '123', '9999']) {
			expect(validateItemQuantity(valid)).toBeNull();
		}
		expect(parseQuantity('42')).toBe(42);
		expect(parseQuantity(' 7 ')).toBe(7); // numeric inputs trim too
	});

	it('rejects zero, decimals, signs, scientific notation and overflow', () => {
		for (const invalid of ['0', '1.5', '-3', '+2', '1e3', '007', '10000', '12,5a', '1 2', '', '2,5']) {
			expect(validateItemQuantity(invalid)).toBe('QUANTITY_INVALID');
		}
	});

	it('rejects non-finite or fractional numbers passed as values', () => {
		expect(validateItemQuantity(0)).toBe('QUANTITY_INVALID');
		expect(validateItemQuantity(1.5)).toBe('QUANTITY_INVALID');
		expect(validateItemQuantity(-3)).toBe('QUANTITY_INVALID');
		expect(validateItemQuantity(Number.POSITIVE_INFINITY)).toBe('QUANTITY_INVALID');
		expect(validateItemQuantity(Number.NaN)).toBe('QUANTITY_INVALID');
	});
});

describe('unit price grammar and bounds', () => {
	it('accepts dot or comma with up to two decimals', () => {
		for (const valid of ['12,50', '12.5', '0,01', '0.01', '5000,00', '999999.99', '999999,99', '123456.7']) {
			expect(validateItemUnitPrice(valid)).toBeNull();
		}
	});

	it('rejects apparent thousands separators and garbage', () => {
		for (const invalid of [
			'1.234',
			'1,234',
			'12,5a',
			'-10',
			'.5',
			'5,',
			'1e3',
			'',
			'1..2',
			'0.0.0',
			'1000000',
			'  '
		]) {
			expect(validateItemUnitPrice(invalid)).toBe('PRICE_INVALID');
		}
	});

	it("accepts '0' grammar but fails the 0,01 minimum", () => {
		expect(validateItemUnitPrice('0')).toBe('PRICE_BELOW_MINIMUM');
		expect(validateItemUnitPrice('0,00')).toBe('PRICE_BELOW_MINIMUM');
		expect(validateItemUnitPrice('0,01')).toBeNull();
	});

	it('rejects non-finite numbers passed as values', () => {
		expect(validateItemUnitPrice(Number.POSITIVE_INFINITY)).toBe('PRICE_INVALID');
		expect(validateItemUnitPrice(Number.NaN)).toBe('PRICE_INVALID');
		expect(validateItemUnitPrice(0)).toBe('PRICE_BELOW_MINIMUM');
	});
});

describe('email validation', () => {
	it('accepts an empty email (optional field)', () => {
		expect(validateClientEmail('')).toBeNull();
		expect(validateClientEmail('   ')).toBeNull();
	});

	it('accepts local@domain.tld without spaces', () => {
		for (const valid of ['a@b.c', 'user.name+tag@dominio.tld', 'x@sub.dominio.com.ar']) {
			expect(validateClientEmail(valid)).toBeNull();
		}
	});

	it('accepts a padded valid email after trimming', () => {
		expect(validateClientEmail(' local@dom.tld ')).toBeNull();
	});

	it('rejects malformed emails', () => {
		for (const invalid of ['no-es-email', 'a b@c.d', 'a@b', '@b.c', 'a@', 'a@b.', 'a@.c', 'a@b c.d']) {
			expect(validateClientEmail(invalid)).toBe('EMAIL_INVALID');
		}
	});

	it('enforces the 254 character limit', () => {
		expect(validateClientEmail('a'.repeat(300))).toBe('EMAIL_TOO_LONG');
	});
});
