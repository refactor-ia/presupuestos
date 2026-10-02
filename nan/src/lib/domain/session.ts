/**
 * PRES session identifier: 'PRES-' + six random digits.
 *
 * Callers must invoke this client-side only (after mount), never during
 * prerender — RQ-01: the user must never see an identifier that is later
 * replaced by another one.
 *
 * Uses crypto.getRandomValues, which is available in insecure contexts.
 * crypto.randomUUID is deliberately avoided (secure-context-only, per
 * constitution). Uniqueness across sessions is not guaranteed and is not
 * asserted anywhere.
 */
export function createPresId(): string {
	const randomBytes = new Uint8Array(6);
	crypto.getRandomValues(randomBytes);
	let digits = '';
	for (const byte of randomBytes) {
		digits += String(byte % 10);
	}
	return `PRES-${digits}`;
}
