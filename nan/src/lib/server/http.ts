/**
 * HTTP helpers for the budgets API routes: uniform `{ code, message }` error
 * bodies resolved through messages.ts (one code = one message) and JSON body
 * parsing.
 *
 * The domain ErrorCode union has no dedicated codes for malformed JSON or
 * missing resources, so those share the generic client-data fallback below
 * (documented deviation).
 */

import { json } from '@sveltejs/kit';
import { messageFor } from '$lib/domain/messages';
import type { ErrorCode } from '$lib/domain/validate';

export const GENERIC_ERROR_CODE: ErrorCode = 'EXPORT_CLIENT_INVALID';

export function errorResponse(code: ErrorCode, status: number): Response {
	return json({ code, message: messageFor(code) }, { status });
}

/** 422: the body parsed as JSON but failed domain validation. */
export function invalidInputResponse(code: ErrorCode): Response {
	return errorResponse(code, 422);
}

/** 404: no budget for the requested id. */
export function notFoundResponse(): Response {
	return errorResponse(GENERIC_ERROR_CODE, 404);
}

/** 400: the request body is not valid JSON. */
export function badRequestResponse(): Response {
	return errorResponse(GENERIC_ERROR_CODE, 400);
}

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false };

/** Parse the request body as JSON; reports failure instead of throwing so routes can answer 400. */
export async function parseJsonBody(request: Request): Promise<JsonBodyResult> {
	try {
		return { ok: true, body: await request.json() };
	} catch {
		return { ok: false };
	}
}
