/**
 * Money contract (spec: money_contract).
 *
 * Integer cents are the single source of truth. No floating point participates
 * in monetary arithmetic: parsing converts a valid price string to cents once,
 * all math is integer math, and formatting converts cents to the display
 * string once. UI and (later) the PDF derive from these same results.
 *
 * This module is pure: no framework, DOM or storage imports.
 */

const CENTS_PER_UNIT = 100;
const IVA_PERCENT = 22;
const HALF_CENT = 50;

function assertSafeIntegerCents(value: number, label: string): void {
	if (!Number.isSafeInteger(value)) {
		throw new TypeError(`${label} must be a safe integer amount of cents, got ${value}`);
	}
}

/**
 * Convert a price string to integer cents, accepting '.' or ',' as the decimal
 * separator with up to two decimals. Returns null for anything else: apparent
 * thousands separators ('1.234'), signs, scientific notation, empty or
 * malformed input. Trimming is the validation layer's responsibility, so
 * leading/trailing spaces are rejected here as well.
 */
export function parsePriceToCents(input: string): number | null {
	if (!/^\d+(?:[.,]\d{1,2})?$/.test(input)) {
		return null;
	}
	const [whole, decimals] = input.split(/[.,]/);
	const fraction = (decimals ?? '').padEnd(2, '0');
	const cents = Number(whole) * CENTS_PER_UNIT + Number(fraction);
	return Number.isSafeInteger(cents) ? cents : null;
}

/** Line subtotal: integer quantity × unit price in cents. */
export function itemSubtotalCents(quantity: number, unitPriceCents: number): number {
	assertSafeIntegerCents(quantity, 'quantity');
	assertSafeIntegerCents(unitPriceCents, 'unitPriceCents');
	const result = quantity * unitPriceCents;
	assertSafeIntegerCents(result, 'item subtotal');
	return result;
}

/** Aggregate subtotal: sum of the item subtotals, in cents. */
export function sumCents(values: readonly number[]): number {
	let sum = 0;
	for (const value of values) {
		assertSafeIntegerCents(value, 'subtotal entry');
		sum += value;
	}
	assertSafeIntegerCents(sum, 'subtotal');
	return sum;
}

/**
 * IVA 22% over the AGGREGATE subtotal, half-up rounded exactly once
 * (never per line). Pure integer arithmetic: for non-negative cents,
 * floor((22 × cents + 50) / 100) implements "round half up at exactly 0.5".
 * The maximum valid aggregate (100 items × 9999 × 99999999 cents ≈ 1e14)
 * stays far below Number.MAX_SAFE_INTEGER, so this is exact.
 */
export function computeIvaCents(subtotalCents: number): number {
	assertSafeIntegerCents(subtotalCents, 'subtotalCents');
	return Math.floor((subtotalCents * IVA_PERCENT + HALF_CENT) / CENTS_PER_UNIT);
}

/** Total: subtotal in cents plus IVA in cents. */
export function totalCents(subtotalCents: number, ivaCents: number): number {
	assertSafeIntegerCents(subtotalCents, 'subtotalCents');
	assertSafeIntegerCents(ivaCents, 'ivaCents');
	return subtotalCents + ivaCents;
}

/**
 * Format integer cents as the exact contract display string:
 * '$ ' + dot-grouped thousands + ',' + exactly two decimals.
 * '$ 39,42' under 1000, '$ 1.234,50', '$ 6.100.000,00', zero → '$ 0,00'.
 */
export function formatCents(cents: number): string {
	assertSafeIntegerCents(cents, 'cents');
	const negative = cents < 0;
	const abs = Math.abs(cents);
	const whole = Math.floor(abs / CENTS_PER_UNIT);
	const fraction = String(abs % CENTS_PER_UNIT).padStart(2, '0');
	const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return `${negative ? '-' : ''}$ ${grouped},${fraction}`;
}
