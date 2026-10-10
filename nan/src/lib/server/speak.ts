/**
 * Pure helpers for the /api/speak proxy: the client asks for a short spoken
 * confirmation; this module builds the upstream request to the NaN API
 * (OpenAI-compatible, Kokoro TTS with the Spanish Santa voice) and validates
 * the input text. The API key never reaches the client, so the fetch itself
 * stays in the route.
 */

export const UPSTREAM_URL = 'https://api.nan.builders/v1/audio/speech';

/** Kokoro v1.1 Spanish male "Santa" voice. */
export const SANTA_VOICE = 'em_santa';

/** Cap the spoken text: confirmations are one sentence, never an essay. */
export const SPEAK_MAX_CHARS = 500;

/** Build the upstream JSON body: Kokoro, Santa voice, wav output. */
export function buildUpstreamBody(text: string): string {
	return JSON.stringify({
		model: 'kokoro',
		input: text.slice(0, SPEAK_MAX_CHARS),
		voice: SANTA_VOICE,
		response_format: 'wav'
	});
}

/** Whether the requested text is usable spoken input. */
export function isAcceptableSpeakText(text: unknown): text is string {
	return typeof text === 'string' && text.trim() !== '';
}
