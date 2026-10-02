import { describe, expect, it } from 'vitest';
import { computeIvaCents, itemSubtotalCents, sumCents, totalCents } from '../domain/money';
import type { BudgetItem } from '../domain/validate';
import { formatLongDate } from '../date';
import {
	CONTENT_BOTTOM,
	DESC_W,
	buildPdfPlan,
	measureText,
	pdfFilenameFor,
	wrapText,
	type PdfBudgetModel,
	type PlanPage,
	type PlanText
} from './plan';

// --- helpers -------------------------------------------------------------

/** Compute totals through the SAME money functions the UI uses (single source of truth). */
function totalsFor(items: readonly BudgetItem[]) {
	const subtotal = sumCents(items.map((item) => itemSubtotalCents(item.quantity, item.unitPriceCents)));
	const iva = computeIvaCents(subtotal);
	return { subtotalCents: subtotal, ivaCents: iva, totalCents: totalCents(subtotal, iva) };
}

function item(description: string, quantity = 1, unitPriceCents = 100): BudgetItem {
	return { description, quantity, unitPriceCents };
}

function textsOf(page: PlanPage): string[] {
	return page.elements.filter((el): el is PlanText => el.kind === 'text').map((el) => el.text);
}

function findText(plan: ReturnType<typeof buildPdfPlan>, text: string, size?: number): PlanText[] {
	const found: PlanText[] = [];
	for (const page of plan.pages) {
		for (const el of page.elements) {
			if (el.kind === 'text' && el.text === text && (size === undefined || el.size === size)) {
				found.push(el);
			}
		}
	}
	return found;
}

const DEMO_MODEL: PdfBudgetModel = {
	presId: 'PRES-123456',
	issueDateText: '12 de septiembre de 2026',
	client: { name: 'Cliente Demo', email: '', address: '', rut: '' },
	items: [item('Diseño web', 2, 5000)],
	totals: { subtotalCents: 10000, ivaCents: 2200, totalCents: 12200 }
};

// --- filename ------------------------------------------------------------

describe('pdfFilenameFor', () => {
	it('maps the session id to PRES-XXXXXX.pdf', () => {
		expect(pdfFilenameFor('PRES-123456')).toBe('PRES-123456.pdf');
	});

	it('rejects ids that do not match PRES-six-digits', () => {
		expect(() => pdfFilenameFor('PRES-12ABCD')).toThrow();
		expect(() => pdfFilenameFor('XES-123456')).toThrow();
		expect(() => pdfFilenameFor('PRES-1234567')).toThrow();
		expect(() => pdfFilenameFor('')).toThrow();
	});
});

// --- required vertical order (SC-01, pdf_contract.required_order) ---------

describe('required vertical order on a single page', () => {
	const plan = buildPdfPlan(DEMO_MODEL);

	it('produces exactly one page for a small budget', () => {
		expect(plan.pageCount).toBe(1);
	});

	it('orders header → client → table → totals → footer by baseline y', () => {
		const page = plan.pages[0];
		const yOf = (predicate: (el: PlanText) => boolean): number => {
			const matches = page.elements.filter(
				(el): el is PlanText => el.kind === 'text' && predicate(el)
			);
			expect(matches.length).toBeGreaterThan(0);
			return matches[0].y;
		};
		const yPres = yOf((el) => el.text === 'PRES-123456' && el.size === 21);
		const yClient = yOf((el) => el.text === 'Cliente Demo' && el.size === 12);
		const yTableHeader = yOf((el) => el.text === 'Descripción');
		const yItem = yOf((el) => el.text === 'Diseño web' && el.size === 9.5);
		const yTotalsSubtotal = yOf((el) => el.text === 'Subtotal' && el.size === 9.5);
		const yTotal = yOf((el) => el.text === 'Total' && el.size === 11);
		const yFooter = yOf((el) => /^Página 1 de 1$/.test(el.text));

		expect(yPres).toBeLessThan(yClient);
		expect(yClient).toBeLessThan(yTableHeader);
		expect(yTableHeader).toBeLessThan(yItem);
		expect(yItem).toBeLessThan(yTotalsSubtotal);
		expect(yTotalsSubtotal).toBeLessThan(yTotal);
		expect(yTotal).toBeLessThan(yFooter);
	});

	it('header shows the PRES number and the shared date text', () => {
		expect(findText(plan, 'PRES-123456', 21)).toHaveLength(1);
		// Consistency between UI and PDF at module level: the plan receives the
		// exact string produced by the shared date module.
		const dateText = formatLongDate(new Date(2026, 8, 12));
		const model: PdfBudgetModel = { ...DEMO_MODEL, issueDateText: dateText };
		expect(textsOf(buildPdfPlan(model).pages[0])).toContain('12 de septiembre de 2026');
	});

	it('renders money strings from formatCents (SC-01 exact values)', () => {
		expect(textsOf(plan.pages[0])).toContain('$ 50,00'); // unit price
		expect(textsOf(plan.pages[0])).toContain('$ 100,00'); // item subtotal
		expect(textsOf(plan.pages[0])).toContain('IVA 22%');
		expect(textsOf(plan.pages[0])).toContain('$ 22,00');
		expect(textsOf(plan.pages[0])).toContain('$ 122,00');
	});

	it('totals trio keeps Subtotal / IVA 22% / Total labels', () => {
		expect(findText(plan, 'Subtotal', 9.5)).toHaveLength(1);
		expect(findText(plan, 'IVA 22%', 9.5)).toHaveLength(1);
		expect(findText(plan, 'Total', 11)).toHaveLength(1);
	});
});

// --- client data block ----------------------------------------------------

describe('client data block (no empty labels for optional fields)', () => {
	it('omits Email/Dirección/RUT labels when empty', () => {
		const texts = textsOf(buildPdfPlan(DEMO_MODEL).pages[0]);
		expect(texts.some((t) => t.startsWith('Email:'))).toBe(false);
		expect(texts.some((t) => t.startsWith('Dirección:'))).toBe(false);
		expect(texts.some((t) => t.startsWith('RUT:'))).toBe(false);
	});

	it('renders present optional fields with their labels (SC-12)', () => {
		const model: PdfBudgetModel = {
			...DEMO_MODEL,
			client: {
				name: 'Acme SA',
				email: 'info@acme.com',
				address: 'Av. Siempre Viva 742',
				rut: '210000000019'
			}
		};
		const texts = textsOf(buildPdfPlan(model).pages[0]);
		expect(texts).toContain('Email: info@acme.com');
		expect(texts).toContain('Dirección: Av. Siempre Viva 742');
		expect(texts).toContain('RUT: 210000000019');
	});
});

// --- insertion order ------------------------------------------------------

describe('items render in insertion order', () => {
	const items = [item('Primero'), item('Segundo'), item('Tercero')];
	const plan = buildPdfPlan({ ...DEMO_MODEL, items, totals: totalsFor(items) });

	it('keeps description baselines increasing in item order', () => {
		const yFirst = findText(plan, 'Primero', 9.5)[0].y;
		const ySecond = findText(plan, 'Segundo', 9.5)[0].y;
		const yThird = findText(plan, 'Tercero', 9.5)[0].y;
		expect(yFirst).toBeLessThan(ySecond);
		expect(ySecond).toBeLessThan(yThird);
	});
});

// --- wrapping (long content) ---------------------------------------------

describe('description wrapping', () => {
	it('wraps a 120-character description into several lines that fit the column', () => {
		const lines = wrapText('A'.repeat(120), DESC_W, 9.5);
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) {
			expect(measureText(line, 9.5)).toBeLessThanOrEqual(DESC_W);
		}
	});

	it('hard-breaks an unbroken overlong word', () => {
		const lines = wrapText('B'.repeat(200), DESC_W, 9.5);
		expect(lines.length).toBeGreaterThan(2);
		for (const line of lines) {
			expect(measureText(line, 9.5)).toBeLessThanOrEqual(DESC_W);
			expect(line.length).toBeGreaterThan(0);
		}
		expect(lines.join('')).toBe('B'.repeat(200)); // no characters lost
	});

	it('wraps on spaces without losing words', () => {
		const text = 'palabra '.repeat(20).trim();
		const lines = wrapText(text, 120, 9.5);
		expect(lines.join(' ')).toBe(text);
	});

	it('a wrapped description occupies more than one text element in the plan', () => {
		const items = [item('A'.repeat(120))];
		const plan = buildPdfPlan({ ...DEMO_MODEL, items, totals: totalsFor(items) });
		const allA = plan.pages
			.flatMap((p) => textsOf(p))
			.filter((t) => /^A+$/.test(t));
		expect(allA.length).toBeGreaterThan(1);
		expect(allA.join('').length).toBe(120);
	});
});

// --- pagination (25+ items) ----------------------------------------------

describe('pagination with 30 items', () => {
	const items: BudgetItem[] = Array.from({ length: 30 }, (_, i) => item(`Ítem ${i + 1}`));
	const plan = buildPdfPlan({ ...DEMO_MODEL, items, totals: totalsFor(items) });

	it('spans multiple pages', () => {
		expect(plan.pageCount).toBeGreaterThan(1);
	});

	it('repeats the table header row on every page', () => {
		expect(plan.headerRows).toHaveLength(plan.pageCount);
		for (let i = 0; i < plan.pageCount; i++) {
			expect(plan.headerRows[i].pageIndex).toBe(i);
			const page = plan.pages[i];
			expect(textsOf(page)).toContain('Descripción');
			expect(textsOf(page)).toContain('Cant.');
			expect(textsOf(page)).toContain('Precio');
			expect(textsOf(page)).toContain('Subtotal');
		}
	});

	it('draws a footer with sequential page numbers on EVERY page', () => {
		for (let i = 0; i < plan.pageCount; i++) {
			const footer = textsOf(plan.pages[i]).find((t) => /^Página \d+ de \d+$/.test(t));
			expect(footer, `page ${i}`).toBe(`Página ${i + 1} de ${plan.pageCount}`);
		}
	});

	it('keeps row y-ranges disjoint (no-overlap invariant)', () => {
		const boxes = [...plan.rowBoxes].sort(
			(a, b) => a.pageIndex - b.pageIndex || a.top - b.top
		);
		for (let i = 1; i < boxes.length; i++) {
			const prev = boxes[i - 1];
			const next = boxes[i];
			if (prev.pageIndex === next.pageIndex) {
				expect(next.top, `row ${i} overlaps previous`).toBeGreaterThanOrEqual(prev.bottom);
			}
		}
	});

	it('keeps every row inside the content area (above the footer zone)', () => {
		for (const box of plan.rowBoxes) {
			expect(box.top).toBeGreaterThan(0);
			expect(box.bottom).toBeLessThanOrEqual(CONTENT_BOTTOM);
		}
	});

	it('keeps all items and lands totals on the last page', () => {
		expect(plan.rowBoxes).toHaveLength(30);
		expect(plan.totalsBox?.pageIndex).toBe(plan.pageCount - 1);
		const lastPage = plan.pages[plan.pageCount - 1];
		expect(textsOf(lastPage)).toContain('Total');
		expect(textsOf(lastPage)).toContain('IVA 22%');
	});
});

// --- totals-with-context rule --------------------------------------------

describe('totals are never orphaned alone on a page', () => {
	// The range crosses single-page, multi-page, and the totals-overflow case
	// where the last rows must be pulled onto the totals page (~56 items with
	// short rows); every plan must satisfy the totals-with-context rule.
	for (let count = 18; count <= 70; count++) {
		it(`holds for ${count} short items`, () => {
			const items: BudgetItem[] = Array.from({ length: count }, (_, i) => item(`Ítem ${i + 1}`));
			const plan = buildPdfPlan({ ...DEMO_MODEL, items, totals: totalsFor(items) });
			const last = plan.pageCount - 1;
			const totalsPage = plan.pages[last];

			const totalsOnLastPage =
				plan.totalsBox !== null && plan.totalsBox.pageIndex === last;
			expect(totalsOnLastPage).toBe(true);

			const hasRowsOnTotalsPage = plan.rowBoxes.some((box) => box.pageIndex === last);
			const hasContinuationNote = textsOf(totalsPage).some((t) => t.includes('continuación'));
			// The rule: totals land with context — last item rows pulled next to
			// them, or an explicit continuation summary above them.
			expect(hasRowsOnTotalsPage || hasContinuationNote).toBe(true);

			// If rows were pulled, the previous page must keep at least one row.
			if (hasRowsOnTotalsPage && plan.pageCount > 1) {
				const previous = plan.pages[last - 1];
				const previousRowCount = plan.rowBoxes.filter((b) => b.pageIndex === last - 1).length;
				expect(previousRowCount, 'previous page must not become an empty orphan').toBeGreaterThan(0);
				expect(textsOf(previous)).toContain('Descripción'); // header still repeated
			}

			// Totals block is atomic: trio on the same page.
			const lastTexts = textsOf(totalsPage);
			expect(lastTexts).toContain('Subtotal');
			expect(lastTexts).toContain('IVA 22%');
			expect(lastTexts).toContain('Total');
		});
	}
});

// --- text safety (INV-11) -------------------------------------------------

describe('plan-level sanitization', () => {
	it('maps ≈ out of every planned string and preserves accents', () => {
		const items = [item('Señal ≈ fuerte', 1, 250)];
		const plan = buildPdfPlan({ ...DEMO_MODEL, items, totals: totalsFor(items) });
		const all = plan.pages.flatMap((p) => textsOf(p)).join('\n');
		expect(all).toContain('Señal ~ fuerte');
		expect(all).not.toContain('≈');
	});

	it('never emits a char outside cp1252 in any planned text', () => {
		const items = [item('Diseño — “completo" ≈ 日本語', 2, 999)];
		const plan = buildPdfPlan({ ...DEMO_MODEL, items, totals: totalsFor(items) });
		const cp1252Specials = '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';
		for (const el of plan.pages.flatMap((p) => p.elements)) {
			if (el.kind !== 'text') continue;
			for (const ch of el.text) {
				const code = ch.codePointAt(0)!;
				const ok =
					(code >= 0x20 && code <= 0x7e) ||
					(code >= 0xa0 && code <= 0xff) ||
					cp1252Specials.includes(ch);
				expect(ok, `char ${JSON.stringify(ch)} in ${JSON.stringify(el.text)}`).toBe(true);
			}
		}
	});
});
