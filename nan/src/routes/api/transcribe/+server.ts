/**
 * POST /api/transcribe: speech-to-text for budget dictation.
 *
 * The client posts one recorded audio clip as multipart/form-data
 * (`audio` field). The server validates the upload, proxies it to the NaN
 * API (OpenAI-compatible `whisper` transcription endpoint) and answers
 * `{ text }` with the plain transcription. The client then feeds that text
 * into the existing /api/parse flow. The API key never reaches the client,
 * so this must stay server-side.
 */

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import {
	UPSTREAM_URL,
	buildUpstreamForm,
	extractTranscriptionText,
	isAcceptedAudioType,
	MAX_AUDIO_BYTES
} from '$lib/server/transcribe';
import {
	GENERIC_ERROR_CODE,
	badRequestResponse,
	errorResponse,
	invalidInputResponse
} from '$lib/server/http';

export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return badRequestResponse();
	}
	const upload = form.get('audio');
	if (!(upload instanceof File) || upload.size === 0) {
		return badRequestResponse();
	}
	if (upload.size > MAX_AUDIO_BYTES || !isAcceptedAudioType(upload.type)) {
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
			headers: { Authorization: `Bearer ${apiKey}` },
			body: buildUpstreamForm(upload)
		});
	} catch {
		return errorResponse(GENERIC_ERROR_CODE, 502);
	}
	if (!upstream.ok) {
		return errorResponse(GENERIC_ERROR_CODE, 502);
	}

	let payload: unknown;
	try {
		payload = await upstream.json();
	} catch {
		return errorResponse(GENERIC_ERROR_CODE, 502);
	}
	const text = extractTranscriptionText(payload);
	if (text === null) {
		// The upstream answered but produced no usable text (silence or an
		// unexpected response shape): a domain-level invalid input, not a
		// transport failure.
		return invalidInputResponse(GENERIC_ERROR_CODE);
	}
	return Response.json({ text: text.slice(0, 2000) });
};
