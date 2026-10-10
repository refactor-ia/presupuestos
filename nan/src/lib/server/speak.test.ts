import { describe, expect, it } from 'vitest';
import { buildUpstreamBody, isAcceptableSpeakText, SANTA_VOICE, UPSTREAM_URL } from './speak';

/**
 * Pure-logic tests for the /api/speak proxy: upstream request building
 * (Kokoro TTS with the Spanish Santa voice) and input text contract.
 * No network and no framework involved.
 */

describe('UPSTREAM_URL', () => {
	it('targets the NaN API OpenAI-compatible speech endpoint', () => {
		expect(UPSTREAM_URL).toBe('https://api.nan.builders/v1/audio/speech');
	});
});

describe('SANTA_VOICE', () => {
	it('is the Kokoro Spanish male Santa voice', () => {
		expect(SANTA_VOICE).toBe('em_santa');
	});
});

describe('buildUpstreamBody', () => {
	it('requests wav audio with the Santa voice and the given text', () => {
		const body = buildUpstreamBody('¡Bien, papá!');
		const parsed = JSON.parse(body) as Record<string, unknown>;
		expect(parsed).toEqual({
			model: 'kokoro',
			input: '¡Bien, papá!',
			voice: 'em_santa',
			response_format: 'wav'
		});
	});

	it('truncates overly long input instead of failing', () => {
		const body = buildUpstreamBody('a'.repeat(600));
		const parsed = JSON.parse(body) as Record<string, unknown>;
		expect((parsed.input as string).length).toBe(500);
	});
});

describe('isAcceptableSpeakText', () => {
	it('accepts non-empty trimmed text', () => {
		expect(isAcceptableSpeakText('¡Bien, papá!')).toBe(true);
		expect(isAcceptableSpeakText('  hola  ')).toBe(true);
	});

	it('rejects empty, blank or non-string input', () => {
		expect(isAcceptableSpeakText('')).toBe(false);
		expect(isAcceptableSpeakText('   ')).toBe(false);
		expect(isAcceptableSpeakText(42 as unknown as string)).toBe(false);
		expect(isAcceptableSpeakText(undefined as unknown as string)).toBe(false);
	});
});
