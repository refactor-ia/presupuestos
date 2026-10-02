/**
 * WinAnsi (cp1252) sanitizer — INV-11 requires pdftotext to extract every
 * contract string literally with no mojibake. jsPDF's standard fonts encode
 * text as WinAnsi, so any character outside cp1252 would corrupt the output.
 *
 * Strategy: map common Unicode punctuation to safe equivalents, preserve
 * Spanish accents (á é í ó ú ñ ü ¿ ¡ are all cp1252-safe), and replace
 * anything unmappable with '?'. Control characters and line breaks never
 * reach the PDF.
 *
 * Pure module: no jsPDF, DOM or framework imports.
 */

/** Characters with a defined cp1252 byte outside printable ASCII/Latin-1. */
const CP1252_SPECIALS =
	'\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152' +
	'\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';

/** Explicit mapping applied before the accept/reject decision. */
const REPLACEMENTS: ReadonlyMap<string, string> = new Map([
	// Line breaks / tabs would break the table layout in the PDF.
	['\n', ' '],
	['\r', ' '],
	['\t', ' '],
	['\f', ' '],
	['\v', ' '],
	// Spaces that render as boxes or get lost in extraction.
	['\u00A0', ' '], // no-break space
	['\u2000', ' '],
	['\u2001', ' '],
	['\u2002', ' '],
	['\u2003', ' '],
	['\u2004', ' '],
	['\u2005', ' '],
	['\u2006', ' '],
	['\u2007', ' '],
	['\u2008', ' '],
	['\u2009', ' '],
	['\u200A', ' '],
	['\u202F', ' '],
	['\u205F', ' '],
	['\u3000', ' '],
	['\u200B', ''], // zero-width space: drop
	['\u00AD', '-'], // soft hyphen
	// Quotes and dashes → their ASCII equivalents.
	['\u2018', "'"],
	['\u2019', "'"],
	['\u201A', "'"],
	['\u201B', "'"],
	['\u2032', "'"],
	['\u201C', '"'],
	['\u201D', '"'],
	['\u201E', '"'],
	['\u201F', '"'],
	['\u2033', '"'],
	['\u2013', '-'],
	['\u2014', '-'],
	['\u2015', '-'],
	['\u2212', '-'],
	['\u2026', '...'],
	['\u2022', '-'],
	// Math symbols used in the wild; '≈' is explicitly banned from the PDF.
	['\u2248', '~'],
	['\u2260', '!=']
]);

function isWinAnsiSafe(ch: string, code: number): boolean {
	if (code >= 0x20 && code <= 0x7e) return true; // printable ASCII
	if (code >= 0xa0 && code <= 0xff) return true; // Latin-1 supplement
	return CP1252_SPECIALS.includes(ch);
}

/**
 * Return a string whose every character is WinAnsi-encodable, so jsPDF's
 * standard fonts render it exactly as planned and pdftotext reads it back
 * cleanly. Unmappable characters become '?'.
 */
export function sanitizeWinAnsi(input: string): string {
	let out = '';
	for (const ch of input) {
		const mapped = REPLACEMENTS.get(ch);
		if (mapped !== undefined) {
			out += mapped;
			continue;
		}
		const code = ch.codePointAt(0)!;
		out += isWinAnsiSafe(ch, code) ? ch : '?';
	}
	return out;
}
