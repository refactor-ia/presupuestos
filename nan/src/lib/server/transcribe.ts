/**
 * Pure helpers for the /api/transcribe proxy: the client uploads one recorded
 * audio clip as multipart/form-data; this module builds the upstream request
 * to the NaN API (OpenAI-compatible, `whisper`) and extracts the plain
 * transcription text from its JSON response. The API key never reaches the
 * client, so the fetch itself stays in the route.
 */

export const UPSTREAM_URL = 'https://api.nan.builders/v1/audio/transcriptions';

/** Upstream transcription upload limit (25 MB, OpenAI-compatible). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Same cap the server applies to the parse text (see $lib/server/parse). */
export const TRANSCRIBE_MAX_TEXT = 2000;

/** Build the upstream multipart body: the recorded clip plus the model name. */
export function buildUpstreamForm(file: File): FormData {
	const form = new FormData();
	form.set('model', 'whisper');
	form.set('file', file, file.name);
	return form;
}

/** Extract the trimmed transcription text from an upstream JSON response;
 *  returns null for any unexpected shape or a blank text. */
export function extractTranscriptionText(payload: unknown): string | null {
	if (typeof payload !== 'object' || payload === null) return null;
	const text = (payload as Record<string, unknown>).text;
	if (typeof text !== 'string') return null;
	const trimmed = text.trim();
	return trimmed === '' ? null : trimmed;
}

/** Whether the uploaded blob's MIME type looks like a browser recording.
 *  Browsers report MediaRecorder output as audio/webm, audio/ogg or audio/mp4
 *  (often with codecs parameters); wav covers explicitly converted uploads. */
export function isAcceptedAudioType(type: string | undefined): boolean {
	if (type === undefined) return false;
	return /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|wave)(;|$)/.test(type);
}
