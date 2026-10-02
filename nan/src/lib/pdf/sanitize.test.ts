import { describe, expect, it } from 'vitest';
import { sanitizeWinAnsi } from './sanitize';

describe('sanitizeWinAnsi (INV-11: pdftotext clean extraction)', () => {
	it('preserves accented Spanish and opening marks (cp1252-safe)', () => {
		const input = 'áéíóú ÁÉÍÓÚ ñÑ üÜ ¿Qué? ¡Hola! «mención»';
		expect(sanitizeWinAnsi(input)).toBe(input);
	});

	it('maps ≈ (U+2248) out of the PDF — never reaches the document', () => {
		expect(sanitizeWinAnsi('≈')).toBe('~');
		expect(sanitizeWinAnsi('Café ≈ 2kg')).toBe('Café ~ 2kg');
	});

	it('maps typographic punctuation to WinAnsi-safe equivalents', () => {
		expect(sanitizeWinAnsi('\u2018x\u2019')).toBe("'x'");
		expect(sanitizeWinAnsi('\u201Cx\u201D')).toBe('"x"');
		expect(sanitizeWinAnsi('a\u2013b\u2014c')).toBe('a-b-c'); // en/em dash
		expect(sanitizeWinAnsi('a\u2026b')).toBe('a...b'); // ellipsis
		expect(sanitizeWinAnsi('\u2022 punto')).toBe('- punto'); // bullet
		expect(sanitizeWinAnsi('a\u00A0b')).toBe('a b'); // nbsp
		expect(sanitizeWinAnsi('\u22125')).toBe('-5'); // minus sign
	});

	it('keeps the euro sign (cp1252 0x80) and middle dot (0xB7)', () => {
		expect(sanitizeWinAnsi('100\u20AC')).toBe('100€');
		expect(sanitizeWinAnsi('a\u00B7b')).toBe('a·b');
	});

	it('replaces characters outside cp1252 with "?"', () => {
		expect(sanitizeWinAnsi('\u03A9')).toBe('?'); // Ω
		expect(sanitizeWinAnsi('日本語')).toBe('???');
		expect(sanitizeWinAnsi('\u{1F600}')).toBe('?'); // astral emoji → one '?'
	});

	it('neutralizes line breaks and tabs (they would break table layout)', () => {
		expect(sanitizeWinAnsi('a\nb\rc\td')).toBe('a b c d');
	});

	it('strips control characters', () => {
		expect(sanitizeWinAnsi('a\u0000b\u0007c')).toBe('a?b?c');
	});

	it('output invariant: every remaining char is WinAnsi-encodable', () => {
		const nasty = 'áé≈日本\u201D\u2013\u2026\u{1F4A9}\u0001\u0090';
		const output = sanitizeWinAnsi(nasty);
		for (const ch of output) {
			const code = ch.codePointAt(0)!;
			const printableAscii = code >= 0x20 && code <= 0x7e;
			const latin1 = code >= 0xa0 && code <= 0xff;
			const cp1252Special = '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178'.includes(ch);
			expect(printableAscii || latin1 || cp1252Special, `char ${JSON.stringify(ch)}`).toBe(true);
		}
	});

	it('keeps empty strings empty', () => {
		expect(sanitizeWinAnsi('')).toBe('');
	});
});
