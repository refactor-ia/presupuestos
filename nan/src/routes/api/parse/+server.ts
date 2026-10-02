/**
 * POST /api/parse: natural-language budget parsing with live streaming.
 *
 * The client sends `{ text }`; the server proxies the NaN API (OpenAI-compatible,
 * `gemma4`, `stream: true`) and pumps the upstream SSE chunks through the pure
 * helpers in `./parse`, re-emitting each completed NDJSON line downstream as an
 * SSE event: `item` for validated budget items, `invalid` for rejected lines
 * (never fatal) and `done` when upstream finishes. The API key never reaches
 * the client, so this must stay server-side.
 */

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import {
	UPSTREAM_URL,
	buildUpstreamBody,
	flushUpstreamBuffer,
	doneEvent,
	extractCompleteLines,
	initialPumpState,
	normalizeParseText,
	processUpstreamLines
} from '$lib/server/parse';
import {
	GENERIC_ERROR_CODE,
	badRequestResponse,
	errorResponse,
	invalidInputResponse,
	parseJsonBody
} from '$lib/server/http';

export const prerender = false;

const SSE_HEADERS = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache',
	Connection: 'keep-alive'
} as const;

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody(request);
	if (!body.ok) {
		return badRequestResponse();
	}
	const source = typeof body.body === 'object' && body.body !== null ? body.body : {};
	const text = normalizeParseText((source as Record<string, unknown>).text);
	if (!text.ok) {
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
			body: buildUpstreamBody(text.text)
		});
	} catch {
		return errorResponse(GENERIC_ERROR_CODE, 502);
	}
	if (!upstream.ok || upstream.body === null) {
		return errorResponse(GENERIC_ERROR_CODE, 502);
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			// Raw upstream SSE text not yet terminated by a newline.
			let sseBuffer = '';
			// Pump state: accumulated model NDJSON text + [DONE] flag.
			let pump = initialPumpState();
			try {
				const reader = upstream.body!.getReader();
				const decoder = new TextDecoder();
				for (;;) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					sseBuffer += decoder.decode(value, { stream: true });
					const { lines, rest } = extractCompleteLines(sseBuffer);
					sseBuffer = rest;
					const batch = processUpstreamLines(lines, pump);
					pump = batch.state;
					for (const frame of batch.events) {
						controller.enqueue(encoder.encode(frame));
					}
					if (pump.finished) {
						break;
					}
				}
			} finally {
				// Upstream end or [DONE]: emit the model's final NDJSON line
				// (it may lack a trailing newline), then the terminal event.
				const flush = flushUpstreamBuffer(pump);
				for (const frame of flush.events) {
					controller.enqueue(encoder.encode(frame));
				}
				controller.enqueue(encoder.encode(doneEvent()));
				controller.close();
			}
		}
	});

	return new Response(stream, { headers: SSE_HEADERS });
};
