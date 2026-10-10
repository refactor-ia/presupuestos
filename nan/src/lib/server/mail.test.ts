import { describe, expect, it } from 'vitest';
import {
	buildPostmarkBody,
	formatBudgetEmail,
	isAcceptedRecipient,
	MIN_SEND_INTERVAL_MS,
	SenderLimit
} from './mail';

/**
 * Pure-logic tests for the /api/budgets/[id]/send flow: Postmark request
 * body, recipient validation, the plain-text rendering of a budget and the
 * per-recipient send throttle. No network and no framework involved.
 */

const budget = {
	id: 7,
	number: 'PRES-123456',
	clientName: 'Acme SRL',
	email: 'compras@acme.com',
	address: 'Av. Siempre Viva 742',
	rut: '21001122334',
	items: [
		{ description: 'Pintura látex interior 20L', quantity: 2, unitPriceCents: 105_500 },
		{ description: 'Mano de obra', quantity: 4, unitPriceCents: 50_00 }
	],
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('isAcceptedRecipient', () => {
	it('accepts a plain valid email', () => {
		expect(isAcceptedRecipient('compras@acme.com')).toBe(true);
	});

	it('rejects empty, blank or malformed values', () => {
		expect(isAcceptedRecipient('')).toBe(false);
		expect(isAcceptedRecipient('   ')).toBe(false);
		expect(isAcceptedRecipient('nope')).toBe(false);
		expect(isAcceptedRecipient('a@b')).toBe(false);
		expect(isAcceptedRecipient(undefined as unknown as string)).toBe(false);
		expect(isAcceptedRecipient(42 as unknown as string)).toBe(false);
	});

	it('rejects header injection attempts', () => {
		expect(isAcceptedRecipient('a@b.com\r\nBcc: victim@x.com')).toBe(false);
		expect(isAcceptedRecipient('a@b.com\n')).toBe(false);
	});
});

describe('formatBudgetEmail', () => {
	const email = formatBudgetEmail(budget);

	it('names the budget number and client in the subject', () => {
		expect(email.subject).toBe('Presupuesto PRES-123456 — Acme SRL');
	});

	it('lists every item with the locale money format', () => {
		expect(email.text).toContain('Pintura látex interior 20L');
		expect(email.text).toContain('2 x $ 1.055,00');
		expect(email.text).toContain('Mano de obra');
	});

	it('includes subtotal, IVA and total lines', () => {
		// subtotal 2*1055 + 4*50 = 2310; IVA 22% = 508.20; total 2818.20
		expect(email.text).toContain('Subtotal: $ 2.310,00');
		expect(email.text).toContain('IVA (22%): $ 508,20');
		expect(email.text).toContain('Total: $ 2.818,20');
	});

	it('renders the same content as simple HTML', () => {
		expect(email.html).toContain('<!DOCTYPE html>');
		expect(email.html).toContain('Pintura látex interior 20L');
		expect(email.html).toContain('$ 2.818,20');
	});
});

describe('buildPostmarkBody', () => {
	it('targets the sender, recipient and stream Postmark expects', () => {
		const body = buildPostmarkBody('ventas@miempresa.com', budget);
		const parsed = JSON.parse(body) as Record<string, unknown>;
		expect(parsed.From).toBe('ventas@miempresa.com');
		expect(parsed.To).toBe('compras@acme.com');
		expect(parsed.MessageStream).toBe('outbound');
		expect(typeof parsed.Subject).toBe('string');
		expect(typeof parsed.TextBody).toBe('string');
		expect(typeof parsed.HtmlBody).toBe('string');
	});
});

describe('SenderLimit', () => {
	it('allows the first send to a recipient', () => {
		const limit = new SenderLimit();
		expect(limit.tryAcquire('a@b.com', 1000)).toBe(true);
	});

	it('rejects a second send within the window and allows it after', () => {
		const limit = new SenderLimit();
		expect(limit.tryAcquire('a@b.com', 1000)).toBe(true);
		expect(limit.tryAcquire('a@b.com', 1000 + MIN_SEND_INTERVAL_MS - 1)).toBe(false);
		expect(limit.tryAcquire('a@b.com', 1000 + MIN_SEND_INTERVAL_MS)).toBe(true);
	});

	it('tracks recipients independently', () => {
		const limit = new SenderLimit();
		expect(limit.tryAcquire('a@b.com', 1000)).toBe(true);
		expect(limit.tryAcquire('other@c.com', 1000)).toBe(true);
	});

	it('normalizes the recipient key (case and surrounding spaces)', () => {
		const limit = new SenderLimit();
		expect(limit.tryAcquire('  A@B.com ', 1000)).toBe(true);
		expect(limit.tryAcquire('a@b.com', 1000 + MIN_SEND_INTERVAL_MS - 1)).toBe(false);
	});

	it('evicts stale recipients so the map cannot grow unbounded', () => {
		const limit = new SenderLimit();
		limit.tryAcquire('old@x.com', 0);
		// Far-future send sweeps the long-expired entry away.
		limit.tryAcquire('new@x.com', MIN_SEND_INTERVAL_MS * 1000);
		expect(limit.size()).toBe(1);
	});
});
