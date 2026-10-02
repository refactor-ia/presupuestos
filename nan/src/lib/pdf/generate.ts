/**
 * jsPDF generator: draws a PdfPlan verbatim with jsPDF primitives only
 * (text, line, rect, addPage). The planner is authoritative — this module
 * never re-wraps, re-measures or recomputes anything, so the tested plan
 * geometry is exactly what reaches the page.
 *
 * Document treatment (design.md "documento diseñado"): slate header band with
 * emerald accent, aligned numeric columns, ruled table with subtle zebra,
 * strong totals block in the app's brand color, and a meta footer. The
 * standard Helvetica core fonts keep the output WinAnsi-safe (INV-11).
 */

import { jsPDF } from 'jspdf';
import { buildPdfPlan, pdfFilenameFor, type PdfBudgetModel, type PdfPlan, type PlanElement } from './plan';

const A4 = { width: 595.28, height: 841.89 };

function drawElement(doc: jsPDF, el: PlanElement): void {
	if (el.kind === 'rect') {
		doc.setFillColor(el.fill[0], el.fill[1], el.fill[2]);
		doc.setDrawColor(el.fill[0], el.fill[1], el.fill[2]);
		doc.rect(el.x, el.y, el.w, el.h, 'F');
		return;
	}
	if (el.kind === 'line') {
		doc.setDrawColor(el.color[0], el.color[1], el.color[2]);
		doc.setLineWidth(el.width);
		doc.line(el.x1, el.y1, el.x2, el.y2);
		return;
	}
	doc.setFont('helvetica', el.bold ? 'bold' : 'normal');
	doc.setFontSize(el.size);
	doc.setTextColor(el.color[0], el.color[1], el.color[2]);
	if (el.align === 'right') {
		doc.text(el.text, el.x, el.y, { align: 'right' });
	} else {
		doc.text(el.text, el.x, el.y);
	}
}

/** Draw the plan into a fresh A4 jsPDF document. */
export function renderPlanToDocument(plan: PdfPlan): jsPDF {
	const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
	for (let i = 0; i < plan.pages.length; i++) {
		if (i > 0) {
			doc.addPage([A4.width, A4.height]);
		}
		for (const el of plan.pages[i].elements) {
			drawElement(doc, el);
		}
	}
	return doc;
}

/** Real PDF bytes (node/test path). The browser export path uses save(). */
export function renderPlanToBytes(plan: PdfPlan): Uint8Array {
	const buffer = renderPlanToDocument(plan).output('arraybuffer');
	return new Uint8Array(buffer);
}

/**
 * Full export: plan → render → trigger the browser download with the
 * contract filename PRES-XXXXXX.pdf. jsPDF save() starts the download; the
 * UI copy confirms that it STARTED, never that the OS wrote the file.
 */
export function exportBudgetPdf(model: PdfBudgetModel): void {
	const plan = buildPdfPlan(model);
	const doc = renderPlanToDocument(plan);
	doc.setProperties({
		title: `Presupuesto ${model.presId}`,
		subject: model.issueDateText,
		author: model.client.name,
		creator: 'Presupuestos'
	});
	doc.save(pdfFilenameFor(model.presId));
}
