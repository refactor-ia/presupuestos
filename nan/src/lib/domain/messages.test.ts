import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES, messageFor } from './messages';
import type { ErrorCode } from './validate';

const ALL_CODES: ErrorCode[] = [
	'NO_ITEMS',
	'EXPORT_CLIENT_INVALID',
	'PRES_NUMBER_DUPLICATE',
	'CLIENT_NAME_REQUIRED',
	'CLIENT_NAME_TOO_LONG',
	'EMAIL_INVALID',
	'EMAIL_TOO_LONG',
	'ADDRESS_TOO_LONG',
	'RUT_TOO_LONG',
	'ITEM_DESCRIPTION_REQUIRED',
	'ITEM_DESCRIPTION_TOO_LONG',
	'QUANTITY_INVALID',
	'PRICE_INVALID',
	'PRICE_BELOW_MINIMUM',
	'ITEM_LIMIT_REACHED'
];

describe('error message map', () => {
	it('maps one code to exactly one message', () => {
		expect(new Set(ALL_CODES).size).toBe(ALL_CODES.length);
		expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ALL_CODES].sort());
		for (const code of ALL_CODES) {
			expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
		}
	});

	it('preserves the exact SC-09 explanation', () => {
		expect(ERROR_MESSAGES.NO_ITEMS).toBe('Agregá al menos un ítem');
	});

	it('gives duplicate PRES- numbers their own actionable message', () => {
		expect(ERROR_MESSAGES.PRES_NUMBER_DUPLICATE).toBe(
			'Ya existe un presupuesto guardado con el número PRES-XXXXXX. Recargá la página para empezar uno nuevo.'
		);
	});

	it('resolves codes for the UI and passes null through', () => {
		expect(messageFor(null)).toBeNull();
		expect(messageFor('NO_ITEMS')).toBe('Agregá al menos un ítem');
		expect(messageFor('CLIENT_NAME_REQUIRED')).toBe('El nombre es obligatorio.');
	});
});
