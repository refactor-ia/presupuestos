/**
 * Pure PDF layout planner (pdf_contract + design.md "documento diseñado").
 *
 * This module plans the WHOLE document as positioned elements (text, line,
 * rect) in jsPDF points, A4. It contains no DOM, no jsPDF and no framework
 * code — the generator draws the plan verbatim, so the plan's geometry is
 * authoritative and every invariant is testable in node:
 *
 * - Required vertical order: header → client → table → totals → footer.
 * - Empty optional client fields produce NO label lines.
 * - Descriptions wrap inside their column (real Helvetica metrics).
 * - Pagination happens BEFORE any overlap; the table header row repeats on
 *   every page; a footer with the page number is planned on EVERY page.
 * - Totals never land orphaned: if the totals block would start a page alone,
 *   the last item rows are pulled next to it; if that is impossible, an
 *   explicit continuation summary is planned above the totals.
 *
 * Single source of truth: the caller passes the SAME budget state the UI
 * renders (totals precomputed by lib/domain/money.ts) and this module formats
 * every amount with formatCents — it never re-derives money.
 */

import { formatCents, itemSubtotalCents } from '../domain/money';
import type { BudgetItem } from '../domain/validate';
import { sanitizeWinAnsi } from './sanitize';

// --- public element model -------------------------------------------------

export type PlanColor = readonly [number, number, number];

export interface PlanText {
	kind: 'text';
	x: number;
	y: number; // baseline
	text: string;
	size: number;
	bold: boolean;
	align: 'left' | 'right';
	color: PlanColor;
}

export interface PlanLine {
	kind: 'line';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	width: number;
	color: PlanColor;
}

export interface PlanRect {
	kind: 'rect';
	x: number;
	y: number;
	w: number;
	h: number;
	fill: PlanColor;
}

export type PlanElement = PlanText | PlanLine | PlanRect;

export interface PlanBox {
	pageIndex: number;
	top: number;
	bottom: number;
}

export interface PlanPage {
	elements: PlanElement[];
}

export interface PdfPlan {
	pageCount: number;
	pages: PlanPage[];
	/** Occupied y-range of every item row (no-overlap invariants). */
	rowBoxes: PlanBox[];
	/** Occupied y-range of the repeated table header row per page. */
	headerRows: PlanBox[];
	totalsBox: PlanBox | null;
}

export interface PdfBudgetModel {
	presId: string;
	/** Output of the shared date module (lib/date.ts) for the session date. */
	issueDateText: string;
	client: { name: string; email: string; address: string; rut: string };
	items: readonly BudgetItem[];
	/** Precomputed by lib/domain/money.ts — never recomputed here. */
	totals: { subtotalCents: number; ivaCents: number; totalCents: number };
}

// --- geometry (pt, A4) ----------------------------------------------------

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
const MARGIN_X = 56;
export const DESC_X = MARGIN_X;
const CONTENT_RIGHT = PAGE_W - MARGIN_X;
const SUBTOTAL_RIGHT = CONTENT_RIGHT;
const PRICE_RIGHT = SUBTOTAL_RIGHT - 115;
const CANT_RIGHT = PRICE_RIGHT - 90;
/** Description column width: from DESC_X up to a 14pt gutter before Cant. */
export const DESC_W = CANT_RIGHT - 14 - DESC_X;
/** Nothing may extend below this line — the footer zone starts here. */
export const CONTENT_BOTTOM = 788;

const PAGE1_TOP = 122; // 'Cliente' label baseline on page 1
const STRIP_TEXT_Y = 44; // continuation strip baseline (pages ≥ 2)
const STRIP_RULE_Y = 58;
/** First row top on continuation pages (strip + repeated header row). */
const CONTINUATION_TOP = 106.5;
const HEADER_ROW_H = 20.5;
const LINE_H = 12.5;
const ROW_PAD = 9;
const ROW_BASELINE_OFFSET = 11.5;
const TOTALS_GAP = 14;
const TOTALS_BLOCK_H = 62;
const FOOTER_RULE_Y = 798;
const FOOTER_TEXT_Y = 812;

// --- palette (sober, consistent with the app: slate + emerald) ------------

const INK: PlanColor = [15, 23, 42]; // slate-900
const GRAY: PlanColor = [71, 85, 105]; // slate-600
const MUTED: PlanColor = [100, 116, 139]; // slate-500
const SOFT: PlanColor = [148, 163, 184]; // slate-400
const RULE: PlanColor = [203, 213, 225]; // slate-300
const RULE_SOFT: PlanColor = [226, 232, 240]; // slate-200
const BAND: PlanColor = [30, 41, 59]; // slate-800
const BAND_TEXT: PlanColor = [226, 232, 240]; // slate-200 on band
const ACCENT: PlanColor = [5, 150, 105]; // emerald-600
const BRAND: PlanColor = [4, 120, 87]; // emerald-700 (the app's Total color)
const WHITE: PlanColor = [255, 255, 255];
const ZEBRA: PlanColor = [248, 250, 252]; // slate-50

// --- Helvetica metrics (AFM widths per 1000 units) ------------------------
// The planner must wrap text without a document instance, so it carries real
// font metrics; the generator never re-wraps, it draws planned lines only.

const HELV: ReadonlyMap<string, number> = new Map(
	Object.entries({
		' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
		'(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
		0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
		':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
		A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
		J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
		S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
		'[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
		a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556,
		i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556,
		q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500,
		y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584,
		'¡': 278, '¿': 556, '«': 556, '»': 556, '·': 278, '°': 400, '€': 556,
		// Accented Latin-1 folds to its base letter width.
		'á': 556, 'é': 556, 'í': 222, 'ó': 556, 'ú': 556, 'ñ': 556, 'ü': 556,
		'Á': 667, 'É': 667, 'Í': 278, 'Ó': 778, 'Ú': 722, 'Ñ': 722, 'Ü': 722,
		'à': 556, 'è': 556, 'ì': 222, 'ò': 556, 'ù': 556, 'ç': 500, 'â': 556,
		'ê': 556, 'î': 222, 'ô': 556, 'û': 556, 'ë': 556, 'ï': 222, 'ö': 556
	})
);

const HELV_BOLD: ReadonlyMap<string, number> = new Map(
	Object.entries({
		' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238,
		'(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
		0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
		':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975,
		A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
		J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
		S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
		'[': 333, '\\': 278, ']': 333, '^': 584, _: 556, '`': 333,
		a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611,
		i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611,
		q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556,
		y: 556, z: 500, '{': 389, '|': 280, '}': 389, '~': 584,
		'¡': 333, '¿': 611, '«': 556, '»': 556, '·': 278, '°': 400, '€': 556,
		'á': 556, 'é': 556, 'í': 278, 'ó': 611, 'ú': 611, 'ñ': 611, 'ü': 611,
		'Á': 722, 'É': 667, 'Í': 278, 'Ó': 778, 'Ú': 722, 'Ñ': 722, 'Ü': 722
	})
);

/** Fallback for any sanitized-but-unlisted char: wider than any real glyph. */
const FALLBACK_WIDTH = 1020;

/** Estimated rendered width in points (real Helvetica AFM metrics). */
export function measureText(text: string, size: number, bold = false): number {
	const table = bold ? HELV_BOLD : HELV;
	let units = 0;
	for (const ch of text) {
		units += table.get(ch) ?? FALLBACK_WIDTH;
	}
	return (units / 1000) * size;
}

/**
 * Greedy word wrap inside maxWidth. An overlong unbroken word is hard-broken
 * by characters. Never loses characters; never returns an overlong line.
 */
export function wrapText(text: string, maxWidth: number, size: number, bold = false): string[] {
	const fits = (candidate: string): boolean => measureText(candidate, size, bold) <= maxWidth;
	const lines: string[] = [];
	let current = '';
	const flush = (): void => {
		if (current !== '') {
			lines.push(current);
			current = '';
		}
	};
	for (const word of text.split(' ')) {
		if (word === '') continue;
		const candidate = current === '' ? word : `${current} ${word}`;
		if (fits(candidate)) {
			current = candidate;
			continue;
		}
		flush();
		if (fits(word)) {
			current = word;
			continue;
		}
		let chunk = '';
		for (const ch of word) {
			if (chunk !== '' && !fits(chunk + ch)) {
				lines.push(chunk);
				chunk = ch;
			} else {
				chunk += ch;
			}
		}
		current = chunk;
	}
	flush();
	return lines.length > 0 ? lines : [''];
}

// --- filename -------------------------------------------------------------

const PRES_ID_PATTERN = /^PRES-\d{6}$/;

/** 'PRES-123456' → 'PRES-123456.pdf' (pdf_contract.filename). */
export function pdfFilenameFor(presId: string): string {
	if (!PRES_ID_PATTERN.test(presId)) {
		throw new TypeError(`presId must match PRES-XXXXXX, got ${JSON.stringify(presId)}`);
	}
	return `${presId}.pdf`;
}

// --- logical planning -----------------------------------------------------

interface PlannedRow {
	item: BudgetItem;
	descriptionLines: string[];
	height: number;
}

interface PlannedPage {
	rows: PlannedRow[];
	hasTotals: boolean;
	continuationNote: boolean;
}

interface ClientBlockLayout {
	nameLines: string[];
	optionalLines: string[];
	/** First row top on page 1 (after client block + 'Detalle' + header row). */
	rowsStart: number;
}

const CONTENT_W = CONTENT_RIGHT - DESC_X;

function planClientBlock(client: PdfBudgetModel['client']): ClientBlockLayout {
	const nameLines = wrapText(client.name, CONTENT_W, 12, true);
	const optionalLines: string[] = [];
	if (client.email !== '') optionalLines.push(`Email: ${client.email}`);
	if (client.address !== '') optionalLines.push(`Dirección: ${client.address}`);
	if (client.rut !== '') optionalLines.push(`RUT: ${client.rut}`);

	// Cursor arithmetic mirrors the geometry phase exactly.
	let cursor = PAGE1_TOP + 18; // name first baseline
	cursor += (nameLines.length - 1) * LINE_H;
	cursor += 16; // first optional baseline
	let optionalCount = 0;
	for (const line of optionalLines) {
		optionalCount += wrapText(line, CONTENT_W, 9.5).length;
	}
	cursor += optionalCount * 13;
	const blockBottom = cursor - 13 + 12; // last baseline + gap
	const detailLabelY = blockBottom + 16;
	const headerTopY = detailLabelY + 9;
	return {
		nameLines,
		optionalLines,
		rowsStart: headerTopY + HEADER_ROW_H + 2.5
	};
}

/** Totals values exactly as they must appear (formatCents is the UI's formatter too). */
function totalsStrings(model: PdfBudgetModel): { subtotal: string; iva: string; total: string } {
	return {
		subtotal: formatCents(model.totals.subtotalCents),
		iva: formatCents(model.totals.ivaCents),
		total: formatCents(model.totals.totalCents)
	};
}

// --- plan builder ---------------------------------------------------------

export function buildPdfPlan(model: PdfBudgetModel): PdfPlan {
	if (!PRES_ID_PATTERN.test(model.presId)) {
		throw new TypeError(`presId must match PRES-XXXXXX, got ${JSON.stringify(model.presId)}`);
	}
	const presId = sanitizeWinAnsi(model.presId);
	const dateText = sanitizeWinAnsi(model.issueDateText);
	const client = {
		name: sanitizeWinAnsi(model.client.name.trim()),
		email: sanitizeWinAnsi(model.client.email.trim()),
		address: sanitizeWinAnsi(model.client.address.trim()),
		rut: sanitizeWinAnsi(model.client.rut.trim())
	};
	const money = totalsStrings(model);

	// 1) Logical pass: wrap and paginate.
	const clientLayout = planClientBlock(client);
	const rows: PlannedRow[] = model.items.map((item) => {
		const descriptionLines = wrapText(sanitizeWinAnsi(item.description), DESC_W, 9.5);
		return { item, descriptionLines, height: descriptionLines.length * LINE_H + ROW_PAD };
	});

	const pages: PlannedPage[] = [{ rows: [], hasTotals: false, continuationNote: false }];
	let y = clientLayout.rowsStart;
	for (const row of rows) {
		if (y + row.height > CONTENT_BOTTOM) {
			pages.push({ rows: [], hasTotals: false, continuationNote: false });
			y = CONTINUATION_TOP;
		}
		pages[pages.length - 1].rows.push(row);
		y += row.height;
	}

	// Totals: atomic block; overflow to a fresh page (header row repeats there).
	if (y + TOTALS_GAP + TOTALS_BLOCK_H > CONTENT_BOTTOM) {
		pages.push({ rows: [], hasTotals: true, continuationNote: false });
		y = CONTINUATION_TOP;
	}
	const totalsPageIndex = pages.length - 1;
	const totalsPage = pages[totalsPageIndex];
	totalsPage.hasTotals = true;

	// Totals-with-context rule: a page holding ONLY the totals is orphaned.
	if (totalsPage.rows.length === 0 && pages.length > 1) {
		const previous = pages[totalsPageIndex - 1];
		let used = 0;
		// Pull trailing rows while the previous page keeps at least one row and
		// everything still fits above the totals on the continuation page.
		while (previous.rows.length > 1) {
			const candidate = previous.rows[previous.rows.length - 1];
			if (CONTINUATION_TOP + used + candidate.height + TOTALS_GAP + TOTALS_BLOCK_H > CONTENT_BOTTOM) {
				break;
			}
			previous.rows.pop();
			totalsPage.rows.unshift(candidate);
			used += candidate.height;
		}
		if (totalsPage.rows.length === 0) {
			// Context cannot be pulled: an explicit continuation summary
			// accompanies the totals instead.
			totalsPage.continuationNote = true;
		}
	}

	// 2) Geometry pass: emit elements.
	const plan: PdfPlan = { pageCount: pages.length, pages: [], rowBoxes: [], headerRows: [], totalsBox: null };
	const text = (
		x: number,
		yPos: number,
		value: string,
		size: number,
		bold: boolean,
		align: 'left' | 'right',
		color: PlanColor
	): PlanText => ({ kind: 'text', x, y: yPos, text: value, size, bold, align, color });
	const line = (x1: number, y1: number, x2: number, y2: number, width: number, color: PlanColor): PlanLine => ({
		kind: 'line', x1, y1, x2, y2, width, color
	});
	const rect = (x: number, yPos: number, w: number, h: number, fill: PlanColor): PlanRect => ({
		kind: 'rect', x, y: yPos, w, h, fill
	});

	let globalRowIndex = 0;
	for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
		const page = pages[pageIndex];
		const elements: PlanElement[] = [];
		// Per-page vertical cursor, re-seeded at every page start so a page with
		// no rows (totals-only) is laid out from its own content top.
		let pageY = pageIndex === 0 ? clientLayout.rowsStart : CONTINUATION_TOP;

		// Page header: designed band on page 1, slim continuation strip after.
		if (pageIndex === 0) {
			elements.push(rect(0, 0, PAGE_W, 88, BAND));
			elements.push(rect(0, 88, PAGE_W, 3, ACCENT));
			elements.push(text(MARGIN_X, 34, 'Presupuesto', 8, true, 'left', BAND_TEXT));
			elements.push(text(MARGIN_X, 60, presId, 21, true, 'left', WHITE));
			elements.push(text(CONTENT_RIGHT, 60, dateText, 10, false, 'right', BAND_TEXT));
		} else {
			elements.push(text(MARGIN_X, STRIP_TEXT_Y, `${presId} · continuación`, 8, true, 'left', SOFT));
			elements.push(line(MARGIN_X, STRIP_RULE_Y, CONTENT_RIGHT, STRIP_RULE_Y, 0.75, RULE_SOFT));
		}

		// Client data block (page 1 only), optional fields without labels when empty.
		if (pageIndex === 0) {
			let cursor = PAGE1_TOP;
			elements.push(text(DESC_X, cursor, 'Cliente', 8, true, 'left', MUTED));
			cursor += 18;
			for (const nameLine of clientLayout.nameLines) {
				elements.push(text(DESC_X, cursor, nameLine, 12, true, 'left', INK));
				cursor += LINE_H;
			}
			cursor += 16 - LINE_H;
			for (const optionalLine of clientLayout.optionalLines) {
				for (const wrapped of wrapText(optionalLine, CONTENT_W, 9.5)) {
					elements.push(text(DESC_X, cursor, wrapped, 9.5, false, 'left', GRAY));
					cursor += 13;
				}
			}
			cursor = cursor - 13 + 12 + 16;
			elements.push(text(DESC_X, cursor, 'Detalle', 8, true, 'left', MUTED));
			const headerTop = cursor + 9;
			elements.push(line(DESC_X, headerTop, CONTENT_RIGHT, headerTop, 1, SOFT));
			elements.push(text(DESC_X, headerTop + 14, 'Descripción', 8, true, 'left', MUTED));
			elements.push(text(CANT_RIGHT, headerTop + 14, 'Cant.', 8, true, 'right', MUTED));
			elements.push(text(PRICE_RIGHT, headerTop + 14, 'Precio', 8, true, 'right', MUTED));
			elements.push(text(SUBTOTAL_RIGHT, headerTop + 14, 'Subtotal', 8, true, 'right', MUTED));
			const headerBottom = headerTop + HEADER_ROW_H;
			elements.push(line(DESC_X, headerBottom, CONTENT_RIGHT, headerBottom, 0.75, RULE));
			plan.headerRows.push({ pageIndex, top: headerTop, bottom: headerBottom });
		} else {
			const headerTop = STRIP_RULE_Y + 25.5;
			elements.push(line(DESC_X, headerTop, CONTENT_RIGHT, headerTop, 1, SOFT));
			elements.push(text(DESC_X, headerTop + 14, 'Descripción', 8, true, 'left', MUTED));
			elements.push(text(CANT_RIGHT, headerTop + 14, 'Cant.', 8, true, 'right', MUTED));
			elements.push(text(PRICE_RIGHT, headerTop + 14, 'Precio', 8, true, 'right', MUTED));
			elements.push(text(SUBTOTAL_RIGHT, headerTop + 14, 'Subtotal', 8, true, 'right', MUTED));
			const headerBottom = headerTop + HEADER_ROW_H;
			elements.push(line(DESC_X, headerBottom, CONTENT_RIGHT, headerBottom, 0.75, RULE));
			plan.headerRows.push({ pageIndex, top: headerTop, bottom: headerBottom });
		}

		// Item rows.
		const rowsOnPage = page.rows;
		for (let i = 0; i < rowsOnPage.length; i++) {
			const row = rowsOnPage[i];
			const rowTop = pageY;
			const baseline = rowTop + ROW_BASELINE_OFFSET;
			if (globalRowIndex % 2 === 1) {
				elements.push(rect(DESC_X, rowTop, CONTENT_RIGHT - DESC_X, row.height, ZEBRA));
			}
			for (let li = 0; li < row.descriptionLines.length; li++) {
				elements.push(
					text(DESC_X, baseline + li * LINE_H, row.descriptionLines[li], 9.5, false, 'left', INK)
				);
			}
			elements.push(text(CANT_RIGHT, baseline, String(row.item.quantity), 9.5, false, 'right', INK));
			elements.push(
				text(PRICE_RIGHT, baseline, formatCents(row.item.unitPriceCents), 9.5, false, 'right', INK)
			);
			elements.push(
				text(
					SUBTOTAL_RIGHT,
					baseline,
					formatCents(itemSubtotalCents(row.item.quantity, row.item.unitPriceCents)),
					9.5,
					false,
					'right',
					INK
				)
			);
			plan.rowBoxes.push({ pageIndex, top: rowTop, bottom: rowTop + row.height });
			// Separator between rows only (the totals rule closes the table).
			const isLastRowOfPage = i === rowsOnPage.length - 1;
			if (!isLastRowOfPage) {
				const separatorY = rowTop + row.height;
				elements.push(line(DESC_X, separatorY, CONTENT_RIGHT, separatorY, 0.5, RULE_SOFT));
			}
			pageY += row.height;
			globalRowIndex++;
		}

		// Totals block (atomic, with context note when required).
		if (page.hasTotals) {
			let ruleY = pageY + TOTALS_GAP;
			if (page.continuationNote) {
				elements.push(
					text(DESC_X, pageY + 4, `${presId} · continuación del detalle`, 8, false, 'left', SOFT)
				);
				ruleY = pageY + 18;
			}
			elements.push(line(DESC_X, ruleY, CONTENT_RIGHT, ruleY, 1.2, GRAY));
			elements.push(text(PRICE_RIGHT, ruleY + 17, 'Subtotal', 9.5, false, 'right', MUTED));
			elements.push(text(SUBTOTAL_RIGHT, ruleY + 17, money.subtotal, 9.5, false, 'right', INK));
			elements.push(text(PRICE_RIGHT, ruleY + 34, 'IVA 22%', 9.5, false, 'right', MUTED));
			elements.push(text(SUBTOTAL_RIGHT, ruleY + 34, money.iva, 9.5, false, 'right', INK));
			elements.push(text(PRICE_RIGHT, ruleY + 53, 'Total', 11, true, 'right', INK));
			elements.push(text(SUBTOTAL_RIGHT, ruleY + 53, money.total, 13, true, 'right', BRAND));
			plan.totalsBox = { pageIndex, top: ruleY, bottom: ruleY + TOTALS_BLOCK_H };
		}

		// Footer with page number on EVERY page.
		elements.push(line(MARGIN_X, FOOTER_RULE_Y, CONTENT_RIGHT, FOOTER_RULE_Y, 0.75, RULE_SOFT));
		elements.push(text(MARGIN_X, FOOTER_TEXT_Y, presId, 8, false, 'left', SOFT));
		elements.push(
			text(CONTENT_RIGHT, FOOTER_TEXT_Y, `Página ${pageIndex + 1} de ${pages.length}`, 8, false, 'right', SOFT)
		);

		plan.pages.push({ elements });
	}

	return plan;
}
