import { describe, expect, it } from 'vitest';
import {
	computeIvaCents,
	formatCents,
	itemSubtotalCents,
	parsePriceToCents,
	sumCents,
	totalCents
} from './money';

describe('parsePriceToCents', () => {
	it('accepts dot as decimal separator', () => {
		expect(parsePriceToCents('10.55')).toBe(1055);
		expect(parsePriceToCents('7.77')).toBe(777);
		expect(parsePriceToCents('50.00')).toBe(5000);
	});

	it('accepts comma as decimal separator', () => {
		expect(parsePriceToCents('10,55')).toBe(1055);
		expect(parsePriceToCents('7,77')).toBe(777);
		expect(parsePriceToCents('12,5')).toBe(1250);
	});

	it('pads one decimal digit to two places', () => {
		expect(parsePriceToCents('0,5')).toBe(50);
		expect(parsePriceToCents('0.05')).toBe(5);
	});

	it('parses zero', () => {
		expect(parsePriceToCents('0')).toBe(0);
		expect(parsePriceToCents('0,00')).toBe(0);
	});

	it('parses the upper grammar bound', () => {
		expect(parsePriceToCents('999999.99')).toBe(99999999);
		expect(parsePriceToCents('999999,99')).toBe(99999999);
	});

	it('rejects apparent thousands separators (three decimals)', () => {
		expect(parsePriceToCents('1.234')).toBeNull();
		expect(parsePriceToCents('1,234')).toBeNull();
	});

	it('rejects signs, scientific notation and garbage', () => {
		expect(parsePriceToCents('-10')).toBeNull();
		expect(parsePriceToCents('+5')).toBeNull();
		expect(parsePriceToCents('1e3')).toBeNull();
		expect(parsePriceToCents('12,5a')).toBeNull();
		expect(parsePriceToCents('')).toBeNull();
		expect(parsePriceToCents('1.2.3')).toBeNull();
		expect(parsePriceToCents('.5')).toBeNull();
		expect(parsePriceToCents('5,')).toBeNull();
	});

	it('rejects a trailing comma on a whole part and a lone comma', () => {
		expect(parsePriceToCents('12,')).toBeNull();
		expect(parsePriceToCents(',')).toBeNull();
	});

	it('does not trim: normalization is the validation layer job', () => {
		expect(parsePriceToCents(' 10,55')).toBeNull();
	});
});

describe('formatCents', () => {
	it('formats zero exactly', () => {
		expect(formatCents(0)).toBe('$ 0,00');
	});

	it('formats sub-1000 amounts without thousands separator', () => {
		expect(formatCents(1)).toBe('$ 0,01');
		expect(formatCents(50)).toBe('$ 0,50');
		expect(formatCents(777)).toBe('$ 7,77');
		expect(formatCents(3942)).toBe('$ 39,42');
		expect(formatCents(99900)).toBe('$ 999,00');
	});

	it('formats 1234.50 exactly', () => {
		expect(formatCents(123450)).toBe('$ 1.234,50');
	});

	it('groups thousands with dots', () => {
		expect(formatCents(100000)).toBe('$ 1.000,00');
		expect(formatCents(99999999)).toBe('$ 999.999,99');
		expect(formatCents(500000000)).toBe('$ 5.000.000,00');
		expect(formatCents(110000000)).toBe('$ 1.100.000,00');
		expect(formatCents(610000000)).toBe('$ 6.100.000,00');
	});

	it('formats the maximum reachable line subtotal', () => {
		expect(formatCents(999899990001)).toBe('$ 9.998.999.900,01');
	});
});

describe('itemSubtotalCents', () => {
	it('multiplies integer quantity by unit price in cents', () => {
		expect(itemSubtotalCents(2, 5000)).toBe(10000); // 2 × $ 50,00 → $ 100,00
		expect(itemSubtotalCents(3, 1055)).toBe(3165); // 3 × $ 10,55 → $ 31,65
		expect(itemSubtotalCents(1, 777)).toBe(777); // 1 × $ 7,77 → $ 7,77
		expect(itemSubtotalCents(1000, 500000)).toBe(500000000); // 1000 × $ 5.000,00
	});

	it('stays within safe integers at the maximum line', () => {
		expect(itemSubtotalCents(9999, 99999999)).toBe(999899990001);
	});
});

describe('sumCents', () => {
	it('sums an empty list to zero', () => {
		expect(sumCents([])).toBe(0);
	});

	it('sums item subtotals in cents', () => {
		expect(sumCents([3165, 777])).toBe(3942);
	});
});

describe('computeIvaCents (IVA 22%, half-up once on the aggregate)', () => {
	it('rounds down when the fractional cent is below one half', () => {
		expect(computeIvaCents(3942)).toBe(867); // 867.24 → 867
	});

	it('rounds up when the fractional cent is above one half', () => {
		expect(computeIvaCents(71)).toBe(16); // 15.62 → 16
	});

	it('rounds exact halves up', () => {
		expect(computeIvaCents(75)).toBe(17); // 16.5 → 17
		expect(computeIvaCents(3425)).toBe(754); // 753.5 → 754
	});

	it('is exact when the IVA lands on whole cents', () => {
		expect(computeIvaCents(0)).toBe(0);
		expect(computeIvaCents(10000)).toBe(2200);
		expect(computeIvaCents(500000000)).toBe(110000000); // SC-13 aggregate
	});

	it('stays exact at the maximum reachable aggregate (100 × 9999 × 99999999)', () => {
		const maxSubtotal = 100 * itemSubtotalCents(9999, 99999999); // 99989999000100 cents
		expect(Number.isSafeInteger(maxSubtotal)).toBe(true);
		expect(computeIvaCents(maxSubtotal)).toBe(21997799780022); // ...022.5 → half-up
	});

	it('never rounds per line: aggregate 150 → 33, not 17 + 17', () => {
		expect(computeIvaCents(sumCents([75, 75]))).toBe(33);
		expect(computeIvaCents(75) + computeIvaCents(75)).toBe(34); // per-line rounding would differ
	});

	it('rounds the P1 diverger aggregate 50 → 11 (once, on the sum)', () => {
		expect(computeIvaCents(sumCents([25, 25]))).toBe(11);
	});

	it('rounds a sub-half-cent aggregate down (1 → 0)', () => {
		expect(computeIvaCents(1)).toBe(0); // 0.22 → below half
	});

	it('rounds an exact half-cent aggregate up (25 → 6)', () => {
		expect(computeIvaCents(25)).toBe(6); // 5.5 → half up
	});
});

describe('totalCents', () => {
	it('adds subtotal and IVA in cents', () => {
		expect(totalCents(3942, 867)).toBe(4809);
		expect(totalCents(500000000, 110000000)).toBe(610000000);
	});
});

describe('canonical example (spec money_contract)', () => {
	it('3 × 10,55 + 1 × 7,77 → $ 31,65 / $ 7,77 / subtotal $ 39,42 / IVA $ 8,67 / total $ 48,09', () => {
		const a = itemSubtotalCents(3, parsePriceToCents('10,55')!);
		const b = itemSubtotalCents(1, parsePriceToCents('7,77')!);
		expect(formatCents(a)).toBe('$ 31,65');
		expect(formatCents(b)).toBe('$ 7,77');
		const subtotal = sumCents([a, b]);
		expect(formatCents(subtotal)).toBe('$ 39,42');
		const iva = computeIvaCents(subtotal);
		expect(formatCents(iva)).toBe('$ 8,67');
		expect(formatCents(totalCents(subtotal, iva))).toBe('$ 48,09');
	});

	it('SC-13: 1000 × 5.000,00 → $ 5.000.000,00 / $ 1.100.000,00 / $ 6.100.000,00', () => {
		const subtotal = itemSubtotalCents(1000, parsePriceToCents('5000,00')!);
		expect(formatCents(subtotal)).toBe('$ 5.000.000,00');
		const iva = computeIvaCents(subtotal);
		expect(formatCents(iva)).toBe('$ 1.100.000,00');
		expect(formatCents(totalCents(subtotal, iva))).toBe('$ 6.100.000,00');
	});
});

describe('empty budget (SC-08)', () => {
	it('an empty item list yields $ 0,00 for subtotal, IVA and total', () => {
		const subtotal = sumCents([]);
		const iva = computeIvaCents(subtotal);
		const total = totalCents(subtotal, iva);
		expect(formatCents(subtotal)).toBe('$ 0,00');
		expect(formatCents(iva)).toBe('$ 0,00');
		expect(formatCents(total)).toBe('$ 0,00');
	});
});

describe('input guards', () => {
	it('rejects non-integer cents in formatting and arithmetic', () => {
		expect(() => formatCents(39.42)).toThrow(TypeError);
		expect(() => computeIvaCents(1.5)).toThrow(TypeError);
		expect(() => itemSubtotalCents(1.5, 100)).toThrow(TypeError);
	});
});
