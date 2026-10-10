/**
 * Pure helpers for the POST /api/budgets/[id]/send flow: recipient
 * validation, the budget rendered as a plain-text/HTML mail, the Postmark
 * request body and the per-recipient send throttle. The API token and the
 * verified sender address never reach this module: they stay in the route.
 */

import { formatCents, itemSubtotalCents, sumCents, computeIvaCents, totalCents } from '$lib/domain/money';
import type { Budget } from './budgets';

/** Postmark transactional stream (the default for server-generated mail). */
const MESSAGE_STREAM = 'outbound';

/** Minimum delay between two sends to the same recipient: one budget mail
 *  per minute per address. The route answers 429 inside the window. */
export const MIN_SEND_INTERVAL_MS = 60_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Whether the value is a safe recipient: a plain email, with no control
 *  characters (header injection) and no surrounding junk. */
export function isAcceptedRecipient(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	// Control characters are rejected on the RAW value: a trailing "\n" is
	// valid whitespace for trim() but invalid as part of a recipient.
	// eslint-disable-next-line no-control-regex
	if (/[\r\n\u0000-\u001f]/.test(value)) return false;
	const email = value.trim();
	if (!EMAIL_RE.test(email)) return false;
	return true;
}

/** Render the stored budget as the mail content: subject plus text and HTML
 *  bodies. Data comes from the repository, so it is already validated. */
export function formatBudgetEmail(budget: Budget): { subject: string; text: string; html: string } {
	const subtotal = sumCents(budget.items.map((item) => itemSubtotalCents(item.quantity, item.unitPriceCents)));
	const iva = computeIvaCents(subtotal);
	const total = totalCents(subtotal, iva);

	const lines: string[] = [
		`Presupuesto ${budget.number} para ${budget.clientName}.`,
		'',
		...budget.items.map(
			(item) => `- ${item.description}: ${item.quantity} x ${formatCents(item.unitPriceCents)} = ${formatCents(itemSubtotalCents(item.quantity, item.unitPriceCents))}`
		),
		'',
		`Subtotal: ${formatCents(subtotal)}`,
		`IVA (22%): ${formatCents(iva)}`,
		`Total: ${formatCents(total)}`
	];
	const text = lines.join('\n');

	const rows = budget.items
		.map(
			(item) =>
				`<tr><td>${escapeHtml(item.description)}</td><td style="text-align:right">${item.quantity} × ${formatCents(item.unitPriceCents)}</td><td style="text-align:right">${formatCents(itemSubtotalCents(item.quantity, item.unitPriceCents))}</td></tr>`
		)
		.join('');
	const html = [
		'<!DOCTYPE html>',
		'<html lang="es"><body style="font-family:sans-serif;max-width:40rem">',
		`<h2>Presupuesto ${escapeHtml(budget.number)}</h2>`,
		`<p>Para ${escapeHtml(budget.clientName)}.</p>`,
		'<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><thead><tr><th>Ítem</th><th>Cantidad × precio</th><th>Subtotal</th></tr></thead><tbody>',
		rows,
		'</tbody></table>',
		`<p style="text-align:right">Subtotal: ${formatCents(subtotal)}<br>IVA (22%): ${formatCents(iva)}<br><strong>Total: ${formatCents(total)}</strong></p>`,
		'</body></html>'
	].join('');

	return { subject: `Presupuesto ${budget.number} — ${budget.clientName}`, text, html };
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/** Build the Postmark /email request body. */
export function buildPostmarkBody(from: string, budget: Budget): string {
	const mail = formatBudgetEmail(budget);
	return JSON.stringify({
		From: from,
		To: budget.email,
		Subject: mail.subject,
		TextBody: mail.text,
		HtmlBody: mail.html,
		MessageStream: MESSAGE_STREAM
	});
}

/** Per-recipient send throttle: one successful acquire per
 *  MIN_SEND_INTERVAL_MS window. The clock is injected so tests are
 *  deterministic; stale entries are swept on insert to stay bounded. */
export class SenderLimit {
	private readonly nextAllowed = new Map<string, number>();

	tryAcquire(recipient: string, now: number): boolean {
		const key = recipient.trim().toLowerCase();
		if (!Number.isFinite(now)) return false;
		// Sweep: drop entries whose window expired long ago. A single pass
		// keeps the map proportional to recently active recipients.
		for (const [key, allowedAt] of this.nextAllowed) {
			if (allowedAt <= now - MIN_SEND_INTERVAL_MS) this.nextAllowed.delete(key);
		}
		const allowedAt = this.nextAllowed.get(key);
		if (allowedAt !== undefined && now < allowedAt) return false;
		this.nextAllowed.set(key, now + MIN_SEND_INTERVAL_MS);
		return true;
	}

	/** Drops the pending window for a recipient: used when the send FAILED
	 *  upstream, so a legitimate retry is not throttled by a mail that never
	 *  went out. Unknown keys are a no-op. */
	release(recipient: string): void {
		this.nextAllowed.delete(recipient.trim().toLowerCase());
	}

	size(): number {
		return this.nextAllowed.size;
	}
}
