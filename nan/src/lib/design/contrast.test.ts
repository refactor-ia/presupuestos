import { describe, expect, it } from 'vitest';

// INV-02 contrast audit — pure math (WCAG 2.x relative luminance + ratio).
// Catalog of every text/background pair the UI actually renders, in BOTH
// themes, using the design tokens defined in app.css. If a token changes
// there, mirror it here: a failing pair fails the suite. Focus indicators and icons are non-text UI and are
// held to the 3:1 threshold; the Total (3xl bold) qualifies as large text.

type Hex = string;

function srgbToLinear(channel: number): number {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: Hex): number {
	const n = hex.replace('#', '');
	const r = srgbToLinear(parseInt(n.slice(0, 2), 16));
	const g = srgbToLinear(parseInt(n.slice(2, 4), 16));
	const b = srgbToLinear(parseInt(n.slice(4, 6), 16));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two opaque colors. */
function contrastRatio(fg: Hex, bg: Hex): number {
	const a = luminance(fg);
	const b = luminance(bg);
	const hi = Math.max(a, b);
	const lo = Math.min(a, b);
	return (hi + 0.05) / (lo + 0.05);
}

// Opaque token values from app.css (refactoria.dev palette). Translucent
// borders/halos are decorative and not audited; muted text is stored as an
// opaque hex precisely so it can be audited here.
const light = {
	brand: '#7127ff',
	brandFg: '#ffffff',
	bg: '#f2effa',
	surface: '#ffffff',
	fg: '#0b0714',
	fg2: '#5e5b64',
	accent: '#5a12e0',
	danger: '#c4183c',
	toastBg: '#0b0714',
	toastFg: '#ffffff'
} as const;

const dark = {
	brand: '#7127ff',
	brandFg: '#ffffff',
	bg: '#0b0714',
	surface: '#17102a',
	fg: '#ffffff',
	fg2: '#aba9b2',
	accent: '#b99aff',
	danger: '#ff7a93',
	toastBg: '#ffffff',
	toastFg: '#0b0714'
} as const;

interface Pair {
	/** UI surface the pair is used on (audit-trail context). */
	where: string;
	fg: Hex;
	bg: Hex;
	/** 4.5 normal text; 3 large text or non-text UI (icons, focus indicators). */
	min: 4.5 | 3;
}

function pairsFor(t: typeof light | typeof dark): Pair[] {
	return [
		{ where: 'body text on page background', fg: t.fg, bg: t.bg, min: 4.5 },
		{ where: 'card text, table values and Total on card', fg: t.fg, bg: t.surface, min: 4.5 },
		{ where: 'muted text (eyebrows, hints, qty/price, placeholder) on card', fg: t.fg2, bg: t.surface, min: 4.5 },
		{ where: 'muted text and placeholder on page/input background', fg: t.fg2, bg: t.bg, min: 4.5 },
		{ where: 'success/hint text on card', fg: t.accent, bg: t.surface, min: 4.5 },
		{ where: 'field error text on card', fg: t.danger, bg: t.surface, min: 4.5 },
		{ where: 'field error text on add-item panel (page background)', fg: t.danger, bg: t.bg, min: 4.5 },
		{ where: 'primary button label on brand', fg: t.brandFg, bg: t.brand, min: 4.5 },
		{ where: 'toast text', fg: t.toastFg, bg: t.toastBg, min: 4.5 },
		{ where: 'focus outline (brand) on page background (non-text)', fg: t.brand, bg: t.bg, min: 3 },
		{ where: 'focus outline (brand) on card (non-text)', fg: t.brand, bg: t.surface, min: 3 },
		{ where: 'error border on input (non-text)', fg: t.danger, bg: t.bg, min: 3 },
		{ where: 'row delete icon on card (non-text)', fg: t.fg2, bg: t.surface, min: 3 }
	];
}

const lightPairs = pairsFor(light);
const darkPairs = pairsFor(dark);

describe.each([
	['light', lightPairs],
	['dark', darkPairs]
])('%s theme contrast audit (INV-02)', (_theme, pairs) => {
	it.each(pairs)('$where reaches the required ratio', ({ fg, bg, min }) => {
		expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
	});
});
