/**
 * POST /api/budgets/[id]/send: email a stored budget via Postmark.
 *
 * The client only supplies `{ email }`; the budget content always comes from
 * the SQLite repository (already validated data — nothing is trusted from
 * the request body). The server validates the recipient, throttles repeated
 * sends to the same address (one per minute, in-memory) and proxies the mail
 * to the Postmark API. POSTMARK_TOKEN and POSTMARK_FROM never reach the
 * client, so this must stay server-side.
 */

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { buildPostmarkBody, isAcceptedRecipient, SenderLimit } from '$lib/server/mail';
import { getBudget } from '$lib/server/budgets';
import {
	badRequestResponse,
	errorResponse,
	invalidInputResponse,
	notFoundResponse,
	parseJsonBody
} from '$lib/server/http';

export const prerender = false;

const POSTMARK_URL = 'https://api.postmarkapp.com/email';

/** Shared per-process throttle: the module lives for the server's lifetime,
 *  which is exactly the scope the anti-spam window needs. */
const sendLimit = new SenderLimit();

export const POST: RequestHandler = async ({ request, params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return notFoundResponse();
	}
	const body = await parseJsonBody(request);
	if (!body.ok) {
		return badRequestResponse();
	}
	const source = typeof body.body === 'object' && body.body !== null ? body.body : {};
	const recipient = (source as Record<string, unknown>).email;
	if (!isAcceptedRecipient(recipient)) {
		return invalidInputResponse('MAIL_RECIPIENT_INVALID');
	}

	const budget = getBudget(id);
	if (budget === null) {
		return errorResponse('MAIL_NOT_FOUND', 404);
	}

	const token = env.POSTMARK_TOKEN ?? process.env.POSTMARK_TOKEN;
	const from = env.POSTMARK_FROM ?? process.env.POSTMARK_FROM;
	if (!token || !from) {
		return errorResponse('MAIL_NOT_CONFIGURED', 503);
	}
	if (!sendLimit.tryAcquire(recipient, Date.now())) {
		return errorResponse('MAIL_THROTTLED', 429);
	}

	let upstream: Response;
	try {
		upstream = await fetch(POSTMARK_URL, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'X-Postmark-Server-Token': token
			},
			body: buildPostmarkBody(from, { ...budget, email: recipient })
		});
	} catch {
		// The send never left the building: free the throttle window so a
		// legitimate retry is not punished for a mail that never went out.
		sendLimit.release(recipient);
		return errorResponse('MAIL_UNAVAILABLE', 502);
	}
	if (!upstream.ok) {
		sendLimit.release(recipient);
		return errorResponse('MAIL_UNAVAILABLE', 502);
	}
	return Response.json({ ok: true });
};
