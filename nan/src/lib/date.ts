/**
 * Shared date formatting for UI and PDF (pdf_contract: one export shows one
 * consistent readable local date).
 *
 * Pure and deterministic: Spanish month names are hard-coded instead of
 * relying on Intl/ICU, so the UI (browser) and any pure consumer produce the
 * same string. Both call sites format the SAME Date instance captured for the
 * session, guaranteeing consistency for a given export.
 */

const MONTHS_ES = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre'
] as const;

/** '12 de septiembre de 2026' style: day (unpadded) + lowercase month + year. */
export function formatLongDate(date: Date): string {
	return `${date.getDate()} de ${MONTHS_ES[date.getMonth()]} de ${date.getFullYear()}`;
}
