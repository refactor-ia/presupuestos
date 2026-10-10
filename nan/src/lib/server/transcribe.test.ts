import { describe, expect, it } from 'vitest';
import {
	buildUpstreamForm,
	extractTranscriptionText,
	MAX_AUDIO_BYTES,
	isAcceptedAudioType,
	UPSTREAM_URL
} from './transcribe';

/**
 * Pure-logic tests for the /api/transcribe proxy: upstream request building,
 * response text extraction, upload limits and accepted audio types. No
 * network and no framework involved.
 */

describe('UPSTREAM_URL', () => {
	it('targets the NaN API OpenAI-compatible transcription endpoint', () => {
		expect(UPSTREAM_URL).toBe('https://api.nan.builders/v1/audio/transcriptions');
	});
});

describe('buildUpstreamForm', () => {
	it('attaches the file and the whisper model', () => {
		const file = new File(['abc'], 'clip.webm', { type: 'audio/webm' });
		const form = buildUpstreamForm(file);
		expect(form.get('model')).toBe('whisper');
		const sent = form.get('file');
		expect(sent).toBeInstanceOf(File);
		expect((sent as File).name).toBe('clip.webm');
	});

	it('keeps the original file bytes', () => {
		const file = new File([new Uint8Array([1, 2, 3])], 'a.wav', { type: 'audio/wav' });
		const sent = buildUpstreamForm(file).get('file') as File;
		expect(sent.size).toBe(3);
	});
});

describe('extractTranscriptionText', () => {
	it('returns the trimmed text of a valid response', () => {
		expect(extractTranscriptionText({ text: '  3 logos a $ 10,55  ' })).toBe('3 logos a $ 10,55');
	});

	it('returns null when text is missing, not a string, or blank', () => {
		expect(extractTranscriptionText({})).toBeNull();
		expect(extractTranscriptionText({ text: 42 })).toBeNull();
		expect(extractTranscriptionText({ text: '   ' })).toBeNull();
		expect(extractTranscriptionText(null)).toBeNull();
		expect(extractTranscriptionText('nope')).toBeNull();
	});
});

describe('isAcceptedAudioType', () => {
	it('accepts the browser recording formats', () => {
		expect(isAcceptedAudioType('audio/webm')).toBe(true);
		expect(isAcceptedAudioType('audio/webm;codecs=opus')).toBe(true);
		expect(isAcceptedAudioType('audio/ogg;codecs=opus')).toBe(true);
		expect(isAcceptedAudioType('audio/mp4')).toBe(true);
		expect(isAcceptedAudioType('audio/wav')).toBe(true);
	});

	it('rejects non-audio uploads', () => {
		expect(isAcceptedAudioType('text/plain')).toBe(false);
		expect(isAcceptedAudioType('')).toBe(false);
		expect(isAcceptedAudioType(undefined)).toBe(false);
	});
});

describe('MAX_AUDIO_BYTES', () => {
	it('matches the upstream 25 MB transcription limit', () => {
		expect(MAX_AUDIO_BYTES).toBe(25 * 1024 * 1024);
	});
});
