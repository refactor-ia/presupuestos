import { describe, expect, it } from 'vitest';

// INV-02 contrast audit — pure math (WCAG 2.x relative luminance + ratio).
// Catalog of every text/background pair the UI actually renders, in BOTH
// themes, using the Tailwind v4 palette values referenced by app.css and the
// components. If a color token changes in app.css, mirror it here: a failing
// pair fails the suite. Focus indicators and icons are non-text UI and are
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

// Tailwind v4 palette values actually referenced in app.css / components.
const palette = {
	white: '#ffffff',
	'slate-100': '#f1f5f9',
	'slate-500': '#64748b',
	'slate-600': '#475569',
	'slate-700': '#334155',
	'slate-800': '#1e293b',
	'slate-900': '#0f172a',
	'zinc-50': '#fafafa',
	'zinc-100': '#f4f4f5',
	'zinc-200': '#e4e4e7',
	'zinc-300': '#d4d4d8',
	'zinc-400': '#a1a1aa',
	'zinc-500': '#71717a',
	'zinc-900': '#18181b',
	'zinc-950': '#09090b',
	'red-400': '#f87171',
	'red-500': '#ef4444',
	'red-600': '#dc2626',
	'emerald-400': '#34d399',
	'emerald-500': '#10b981',
	'emerald-600': '#059669',
	'emerald-700': '#047857'
} as const;

interface Pair {
	/** UI surface the pair is used on (audit-trail context). */
	where: string;
	fg: Hex;
	bg: Hex;
	/** 4.5 normal text; 3 large text or non-text UI (icons, focus indicators). */
	min: 4.5 | 3;
}

// Light theme: page bg slate-100, cards/inputs white.
const lightPairs: Pair[] = [
	{ where: 'body text on page background', fg: palette['slate-900'], bg: palette['slate-100'], min: 4.5 },
	{ where: 'card/table-header text on white card', fg: palette['slate-900'], bg: palette.white, min: 4.5 },
	{ where: 'table description + subtotal on white card', fg: palette['slate-800'], bg: palette.white, min: 4.5 },
	{ where: 'table quantity/price on white card', fg: palette['slate-600'], bg: palette.white, min: 4.5 },
	{ where: 'field labels + secondary button on white', fg: palette['slate-700'], bg: palette.white, min: 4.5 },
	{ where: 'card titles, hints, (opcional) note and placeholder on white', fg: palette['slate-500'], bg: palette.white, min: 4.5 },
	{ where: 'header eyebrow + issue date on page background', fg: palette['slate-600'], bg: palette['slate-100'], min: 4.5 },
	{ where: 'field error text on white card', fg: palette['red-600'], bg: palette.white, min: 4.5 },
	{ where: 'export success text on white card', fg: palette['emerald-700'], bg: palette.white, min: 4.5 },
	{ where: 'Total value (3xl bold, large text) on white card', fg: palette['emerald-700'], bg: palette.white, min: 3 },
	{ where: 'primary button label on emerald-600', fg: palette['zinc-950'], bg: palette['emerald-600'], min: 4.5 },
	{ where: 'row delete icon on white card (non-text)', fg: palette['slate-500'], bg: palette.white, min: 3 },
	{ where: 'input focus border on white input (non-text)', fg: palette['emerald-600'], bg: palette.white, min: 3 },
	{ where: 'error focus border on white input (non-text)', fg: palette['red-500'], bg: palette.white, min: 3 },
	{ where: 'button focus ring on page background (non-text)', fg: palette['emerald-600'], bg: palette['slate-100'], min: 3 },
	{ where: 'required marker (decorative, aria-hidden) on white', fg: palette['red-500'], bg: palette.white, min: 3 }
];

// Dark theme: page bg zinc-950, cards zinc-900, inputs zinc-950.
const darkPairs: Pair[] = [
	{ where: 'body text on page background', fg: palette['zinc-100'], bg: palette['zinc-950'], min: 4.5 },
	{ where: 'card/table-header text on dark card', fg: palette['zinc-100'], bg: palette['zinc-900'], min: 4.5 },
	{ where: 'table description, subtotal and secondary button on dark card', fg: palette['zinc-200'], bg: palette['zinc-900'], min: 4.5 },
	{ where: 'table quantity/price on dark card', fg: palette['zinc-400'], bg: palette['zinc-900'], min: 4.5 },
	{ where: 'field labels on dark card', fg: palette['zinc-300'], bg: palette['zinc-900'], min: 4.5 },
	{ where: 'card titles, hints and (opcional) note on dark card', fg: palette['zinc-400'], bg: palette['zinc-900'], min: 4.5 },
	{ where: 'Total label on dark card', fg: palette['zinc-50'], bg: palette['zinc-900'], min: 4.5 },
	{ where: 'header eyebrow + issue date on page background', fg: palette['zinc-400'], bg: palette['zinc-950'], min: 4.5 },
	{ where: 'input placeholder on dark input', fg: palette['zinc-400'], bg: palette['zinc-950'], min: 4.5 },
	{ where: 'field error text on dark card', fg: palette['red-400'], bg: palette['zinc-900'], min: 4.5 },
	{ where: 'export success text on dark card', fg: palette['emerald-400'], bg: palette['zinc-900'], min: 4.5 },
	{ where: 'Total value (3xl bold, large text) on dark card', fg: palette['emerald-400'], bg: palette['zinc-900'], min: 3 },
	{ where: 'primary button label on emerald-500', fg: palette['zinc-950'], bg: palette['emerald-500'], min: 4.5 },
	{ where: 'row delete icon on dark card (non-text)', fg: palette['zinc-500'], bg: palette['zinc-900'], min: 3 },
	{ where: 'input focus border on dark input (non-text)', fg: palette['emerald-400'], bg: palette['zinc-950'], min: 3 },
	{ where: 'error focus border on dark input (non-text)', fg: palette['red-400'], bg: palette['zinc-950'], min: 3 },
	{ where: 'button focus ring on page background (non-text)', fg: palette['emerald-400'], bg: palette['zinc-950'], min: 3 },
	{ where: 'required marker (decorative, aria-hidden) on dark card', fg: palette['red-400'], bg: palette['zinc-900'], min: 3 }
];

describe.each([
	['light', lightPairs],
	['dark', darkPairs]
])('%s theme contrast audit (INV-02)', (_theme, pairs) => {
	it.each(pairs)('$where reaches the required ratio', ({ fg, bg, min }) => {
		expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
	});
});
