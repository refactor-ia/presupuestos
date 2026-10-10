/**
 * POST /api/speak: spoken budget confirmation via Kokoro TTS.
 *
 * The client posts `{ text }` with a short confirmation phrase; the server
 * proxies it to the NaN API speech endpoint (Kokoro, Spanish Santa voice)
 * and streams back the wav audio. The API key never reaches the client,
 * so this must stay server-side.
 */

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { UPSTREAM_URL, buildUpstreamBody, isAcceptableSpeakText } from '$lib/server/speak';
import {
	GENERIC_ERROR_CODE,
	badRequestResponse,
	errorResponse,
	invalidInputResponse,
	parseJsonBody
} from '$lib/server/http';

export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody(request);
	if (!body.ok) {
		return badRequestResponse();
	}
	const source = typeof body.body === 'object' && body.body !== null ? body.body : {};
	const text = (source as Record<string, unknown>).text;
	if (!isAcceptableSpeakText(text)) {
		return invalidInputResponse(GENERIC_ERROR_CODE);
	}

	const apiKey = env.NAN_API_KEY ?? process.env.NAN_API_KEY;
	if (!apiKey) {
		return errorResponse(GENERIC_ERROR_CODE, 503);
	}

	let upstream: Response;
	try {
		upstream = await fetch(UPSTREAM_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: buildUpstreamBody(text.trim())
		});
	} catch {
		return errorResponse(GENERIC_ERROR_CODE, 502);
	}
	if (!upstream.ok || upstream.body === null) {
		return errorResponse(GENERIC_ERROR_CODE, 502);
	}

	// Pass the synthesized audio straight through: Kokoro already produced a
	// complete wav document, there is nothing to transform downstream.
	return new Response(upstream.body, {
		headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }
	});
};
