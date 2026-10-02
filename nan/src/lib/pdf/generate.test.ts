import { describe, expect, it } from 'vitest';
import { computeIvaCents, itemSubtotalCents, sumCents, totalCents } from '../domain/money';
import type { BudgetItem } from '../domain/validate';
import { formatLongDate } from '../date';
import { buildPdfPlan, pdfFilenameFor, type PdfBudgetModel } from './plan';
import { renderPlanToBytes } from './generate';
import { extractTextFromPdf, pdftotextAvailable } from './pdftotext.node';

// pdftotext is the honest INV-11 verifier. When the binary is missing the
// byte-level assertions still run; nothing is faked.
const hasPdftotext = pdftotextAvailable();

function totalsFor(items: readonly BudgetItem[]) {
	const subtotal = sumCents(items.map((i) => itemSubtotalCents(i.quantity, i.unitPriceCents)));
	const iva = computeIvaCents(subtotal);
	return { subtotalCents: subtotal, ivaCents: iva, totalCents: totalCents(subtotal, iva) };
}

function sc01Model(): PdfBudgetModel {
	return {
		presId: 'PRES-123456',
		issueDateText: formatLongDate(new Date(2026, 8, 12)),
		client: { name: 'Cliente Demo', email: '', address: '', rut: '' },
		items: [{ description: 'Diseño web', quantity: 2, unitPriceCents: 5000 }],
		totals: { subtotalCents: 10000, ivaCents: 2200, totalCents: 12200 }
	};
}

function extractText(bytes: Uint8Array): string {
	return extractTextFromPdf(bytes);
}

describe('renderPlanToBytes produces a real PDF', () => {
	it('starts with the %PDF magic and ends with %%EOF', () => {
		const bytes = renderPlanToBytes(buildPdfPlan(sc01Model()));
		expect(bytes.byteLength).toBeGreaterThan(500);
		const head = String.fromCharCode(...bytes.slice(0, 5));
		const tail = String.fromCharCode(...bytes.slice(-6)).trim();
		expect(head).toBe('%PDF-');
		expect(tail.endsWith('%%EOF')).toBe(true);
	});
});

describe.skipIf(!hasPdftotext)('INV-11: pdftotext extracts every contract string literally', () => {
	it('extracts the SC-01 document cleanly', () => {
		const model = sc01Model();
		const text = extractText(renderPlanToBytes(buildPdfPlan(model)));

		expect(text).toContain('PRES-123456');
		expect(text).toContain('12 de septiembre de 2026');
		expect(text).toContain('Cliente Demo');
		expect(text).toContain('Descripción');
		expect(text).toContain('Diseño web');
		expect(text).toContain('2'); // quantity
		expect(text).toContain('$ 50,00'); // unit price
		expect(text).toContain('$ 100,00'); // item + aggregate subtotal
		expect(text).toContain('Subtotal');
		expect(text).toContain('IVA 22%');
		expect(text).toContain('$ 22,00');
		expect(text).toContain('Total');
		expect(text).toContain('$ 122,00');
		expect(text).toContain('Página 1 de 1');
		// No mojibake: accents survive the WinAnsi round-trip.
		expect(text).toContain('Descripción');
		expect(text).not.toContain('\uFFFD');
	});

	it('extracts required content in the required vertical order', () => {
		const text = extractText(renderPlanToBytes(buildPdfPlan(sc01Model())));
		const indexOf = (needle: string): number => {
			const at = text.indexOf(needle);
			expect(at, needle).toBeGreaterThanOrEqual(0);
			return at;
		};
		const order = [
			indexOf('PRES-123456'),
			indexOf('12 de septiembre de 2026'),
			indexOf('Cliente Demo'),
			indexOf('Descripción'),
			indexOf('Diseño web'),
			text.lastIndexOf('Subtotal'), // totals label (the table header comes earlier)
			indexOf('IVA 22%'),
			indexOf('Total'),
			indexOf('Página 1 de 1')
		];
		for (let i = 1; i < order.length; i++) {
			expect(order[i], `element ${i} must come after ${i - 1}`).toBeGreaterThan(order[i - 1]);
		}
	});

	it('omits empty optional labels and shows present ones (SC-12)', () => {
		const empty = extractText(renderPlanToBytes(buildPdfPlan(sc01Model())));
		expect(empty).not.toContain('Email:');
		expect(empty).not.toContain('Dirección:');
		expect(empty).not.toContain('RUT:');

		const full: PdfBudgetModel = {
			...sc01Model(),
			presId: 'PRES-654321',
			client: {
				name: 'Acme SA',
				email: 'info@acme.com',
				address: 'Av. Siempre Viva 742',
				rut: '210000000019'
			}
		};
		const text = extractText(renderPlanToBytes(buildPdfPlan(full)));
		expect(text).toContain('PRES-654321');
		expect(text).toContain('Email: info@acme.com');
		expect(text).toContain('Dirección: Av. Siempre Viva 742');
		expect(text).toContain('RUT: 210000000019');
	});

	it('never emits ≈ and keeps Spanish accents in the real bytes', () => {
		const model = sc01Model();
		model.items = [{ description: 'Café ≈ especial ñandú', quantity: 1, unitPriceCents: 250 }];
		model.totals = totalsFor(model.items);
		const text = extractText(renderPlanToBytes(buildPdfPlan(model)));
		expect(text).toContain('Café ~ especial ñandú');
		expect(text).not.toContain('≈');
		expect(text).toContain('ñ');
	});

	it('paginates 30 items with repeated header and correct footers', () => {
		const items: BudgetItem[] = Array.from({ length: 30 }, (_, i) => ({
			description: `Ítem de prueba número ${i + 1}`,
			quantity: 1,
			unitPriceCents: 100
		}));
		const model: PdfBudgetModel = {
			presId: 'PRES-999999',
			issueDateText: '12 de septiembre de 2026',
			client: { name: 'Cliente Demo', email: '', address: '', rut: '' },
			items,
			totals: totalsFor(items)
		};
		const text = extractText(renderPlanToBytes(buildPdfPlan(model)));
		expect(text).toContain('Página 1 de 2');
		expect(text).toContain('Página 2 de 2');
		expect(text).toContain('Ítem de prueba número 1');
		expect(text).toContain('Ítem de prueba número 30');
		// Table header repeats on the continuation page (drop the trailing form feed).
		const pages = text.split('\f').filter((chunk) => chunk.trim() !== '');
		expect(pages.length).toBe(2);
		expect(pages[1]).toContain('Descripción');
		expect(pages[1]).toContain('Cant.');
	});

	it('keeps a 120-character description readable across wrapped lines', () => {
		const long = 'A'.repeat(120);
		const items: BudgetItem[] = [
			{ description: long, quantity: 1, unitPriceCents: 1 },
			{ description: 'Otro ítem', quantity: 1, unitPriceCents: 1 }
		];
		const model: PdfBudgetModel = {
			presId: 'PRES-111111',
			issueDateText: '12 de septiembre de 2026',
			client: { name: 'Cliente Demo', email: '', address: '', rut: '' },
			items,
			totals: totalsFor(items)
		};
		const text = extractText(renderPlanToBytes(buildPdfPlan(model)));
		// Wrapped lines of the description: pure A-lines, no characters lost.
		const aLines = text.match(/^A+$/gm) ?? [];
		expect(aLines.length).toBeGreaterThan(1);
		expect(aLines.join('').length).toBe(120);
		expect(text).toMatch(/A{40,}/); // wrapped lines are long, not one char each
		expect(text).toContain('Otro ítem');
	});
});

describe('filename contract', () => {
	it('PRES-XXXXXX → PRES-XXXXXX.pdf', () => {
		expect(pdfFilenameFor('PRES-123456')).toBe('PRES-123456.pdf');
	});
});
