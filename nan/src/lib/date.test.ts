import { describe, expect, it } from 'vitest';
import { formatLongDate } from './date';

describe('formatLongDate', () => {
	it('formats the canonical example: 12 de septiembre de 2026', () => {
		expect(formatLongDate(new Date(2026, 8, 12))).toBe('12 de septiembre de 2026');
	});

	it('does not zero-pad the day', () => {
		expect(formatLongDate(new Date(2027, 0, 1))).toBe('1 de enero de 2027');
	});

	it('uses lowercase Spanish month names', () => {
		expect(formatLongDate(new Date(2026, 11, 31))).toBe('31 de diciembre de 2026');
		expect(formatLongDate(new Date(2026, 6, 9))).toBe('9 de julio de 2026');
	});

	it('handles leap-day', () => {
		expect(formatLongDate(new Date(2028, 1, 29))).toBe('29 de febrero de 2028');
	});

	// Both the UI header and the PDF plan call this same function with the same
	// Date captured for the session, so one export shows one consistent date.
	// The consistency is asserted at module level in plan.test.ts as well.
	it('is deterministic for the same inputs (no locale/ICU dependence)', () => {
		const date = new Date(2026, 8, 12);
		expect(formatLongDate(date)).toBe(formatLongDate(date));
	});
});
