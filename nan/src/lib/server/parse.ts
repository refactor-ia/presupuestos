/**
 * Pure logic for POST /api/parse: the NaN.Builders streaming budget parser.
 *
 * The model answers with newline-delimited JSON objects, one budget item per
 * line. This module owns every pure step of the pipeline — SSE chunk
 * buffering, line parsing + validation, downstream event frames, the input
 * text contract and the upstream request body — so the route handler stays a
 * thin pump with no testable logic of its own. No fetch happens here.
 *
 * Item validation reuses the shared domain validators exactly as
 * budgets.ts does (same quantity/price normalization, no duplicated rules):
 * `unitPriceCents` arrives as integer cents from the model and round-trips
 * through the display-price grammar so the 0,01 minimum and the 999999,99
 * maximum apply unchanged.
 */

import { parsePriceToCents } from '$lib/domain/money';
import {
	parseQuantity,
	validateClientName,
	validateClientEmail,
	validateClientAddress,
	validateItemDescription,
	validateItemQuantity,
	validateItemUnitPrice
} from '$lib/domain/validate';
import type { BudgetItem, ErrorCode } from '$lib/domain/validate';

/** NaN API (OpenAI-compatible) chat completions endpoint. */
export const UPSTREAM_URL = 'https://api.nan.builders/v1/chat/completions';

/** Client text cap: at most 2000 characters after trim. */
export const MAX_PARSE_TEXT_LENGTH = 2000;

/**
 * Downstream error-event text when the upstream fails mid-stream: it never
 * says the analysis finished, because the emitted items may be incomplete.
 */
export const STREAM_INTERRUPTED_MESSAGE =
	'El análisis se interrumpió. Los ítems mostrados pueden estar incompletos.';

const GENERIC_ERROR_CODE: ErrorCode = 'EXPORT_CLIENT_INVALID';

/**
 * System prompt for the model: English instructions, Spanish item
 * descriptions. Output contract is newline-delimited JSON, one item per
 * line, nothing else.
 */
export const SYSTEM_PROMPT = [
	'You convert a natural-language budget request (Spanish) into budget items.',
	'Output ONLY newline-delimited JSON objects: one budget item per line, no prose, no code fences, no blank lines.',
	'If the request mentions a client name (who the budget is for), ALSO output one extra line `{"client":"<name>"}` (single "client" string field, the person or company name only, no honorifics added) at most once; every other line stays a budget item.',
	'If the request mentions a client email (a plausible single email address), ALSO output one extra line `{"email":"<email>"}` (single "email" string field, the email address exactly as given) at most once; every other line stays a budget item.',
	'If the request mentions a client postal address, ALSO output one extra line `{"address":"<address>"}` (single "address" string field, the address text exactly as given, no invention) at most once; every other line stays a budget item.',
	'Each object has exactly three fields:',
	'- "description": string in Spanish, what is being bought, at most 240 characters.',
	'- "quantity": integer 1..9999.',
	'- "unitPriceCents": positive integer 1..99999999, the unit price in cents (1 = 0,01).',
	'Never output anything except the JSON lines.'
].join('\n');

/** OpenAI-compatible chat completions body for one parse request. */
export function buildUpstreamBody(text: string): string {
	return JSON.stringify({
		model: 'gemma4',
		stream: true,
		temperature: 0,
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: text }
		]
	});
}

/**
 * Client text contract for POST /api/parse: a string, non-empty after trim,
 * at most MAX_PARSE_TEXT_LENGTH characters after trim.
 */
export function normalizeParseText(value: unknown): { ok: true; text: string } | { ok: false } {
	if (typeof value !== 'string') {
		return { ok: false };
	}
	const trimmed = value.trim();
	if (trimmed === '' || trimmed.length > MAX_PARSE_TEXT_LENGTH) {
		return { ok: false };
	}
	return { ok: true, text: trimmed };
}

/**
 * Split accumulated upstream delta text into complete lines and the new
 * buffer. A line is complete once a `\n` terminates it; the final fragment
 * without a newline stays buffered until more text arrives.
 */
export function extractCompleteLines(buffer: string): { lines: string[]; rest: string } {
	const normalized = buffer.replace(/\r\n/g, '\n');
	const lastNewline = normalized.lastIndexOf('\n');
	if (lastNewline === -1) {
		return { lines: [], rest: buffer };
	}
	const lines = normalized.slice(0, lastNewline).split('\n');
	return { lines, rest: normalized.slice(lastNewline + 1) };
}

/**
 * Strip a leading SSE `data:` prefix (with or without the trailing space)
 * and return the trimmed remainder. Lines without the prefix are returned
 * as-is (trimmed), so bare JSON payloads still parse.
 */
function stripDataPrefix(line: string): string {
	const trimmed = line.trim();
	return trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
}

/**
 * True when an upstream SSE line is the OpenAI `[DONE]` stream sentinel.
 */
export function isUpstreamDone(upstreamLine: string): boolean {
	return stripDataPrefix(upstreamLine) === '[DONE]';
}

/**
 * Extract the model text carried by one raw upstream SSE line.
 *
 * Upstream lines are OpenAI chat-completions chunks
 * (`data: {"choices":[{"delta":{"content":"..."}}]}`), not the model's
 * NDJSON itself. Returns the accumulated content string for a chunk with a
 * non-empty `choices[0].delta.content`, the empty string for a valid chunk
 * with empty or absent content, and null for anything that carries no model
 * text and must be ignored silently: empty lines, `[DONE]`, SSE comment
 * keep-alives (`: ping`) and unparseable payloads.
 */
export function extractDeltaContent(upstreamLine: string): string | null {
	const trimmed = upstreamLine.trim();
	if (trimmed === '' || trimmed.startsWith(':')) {
		return null;
	}
	const payload = stripDataPrefix(trimmed);
	if (payload === '[DONE]') {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(payload);
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return null;
	}
	const chunk = parsed as { choices?: { delta?: { content?: unknown } }[] };
	const content = chunk.choices?.[0]?.delta?.content;
	return typeof content === 'string' ? content : '';
}

/**
 * Email validation for a parsed mention line: the domain validator treats
 * empty as "optional/absent", but the model emitted a line — an empty email
 * here is junk and surfaces as EMAIL_INVALID on the invalid path.
 */
function validateMentionEmail(email: string): ErrorCode | null {
	const trimmed = email.trim();
	if (trimmed === '') {
		return 'EMAIL_INVALID';
	}
	return validateClientEmail(trimmed);
}

/** Address counterpart of `validateMentionEmail` (empty is junk, not absent). */
function validateMentionAddress(address: string): ErrorCode | null {
	const trimmed = address.trim();
	if (trimmed === '') {
		return 'ADDRESS_TOO_LONG';
	}
	return validateClientAddress(trimmed);
}

/** Immutable-ish pump state threaded through the upstream-line reducer. */
export type PumpState = {
	/** Accumulated model NDJSON text not yet terminated by a newline. */
	ndjson: string;
	/** True once the upstream `[DONE]` sentinel has been seen. */
	finished: boolean;
	/** True once a valid client line has produced a client event (first wins). */
	clientSeen: boolean;
	/** True once a valid email line has produced an email event (first wins). */
	emailSeen: boolean;
	/** True once a valid address line has produced an address event (first wins). */
	addressSeen: boolean;
};

/** Initial pump state: empty NDJSON buffer, stream not finished, nothing seen yet. */
export function initialPumpState(): PumpState {
	return { ndjson: '', finished: false, clientSeen: false, emailSeen: false, addressSeen: false };
}

/** Result of feeding a batch of raw upstream lines through the pump. */
export type PumpBatchResult = {
	/** Downstream SSE frames (client/item/invalid) emitted for completed NDJSON lines. */
	events: string[];
	/** The pump state after this batch. */
	state: PumpState;
};

/**
 * Pure reducer for the upstream pump: feed raw upstream SSE lines, get the
 * downstream client/item/invalid frames plus the next state.
 *
 * Each upstream chunk line is decoded via `extractDeltaContent` and its
 * content appended to the model NDJSON buffer; every completed NDJSON line
 * is then classified (client/email/address mention vs budget item), parsed
 * and validated. `[DONE]` and anything after it stop the pump without
 * emitting frames; non-text lines are ignored silently.
 */
export function processUpstreamLines(lines: string[], state: PumpState): PumpBatchResult {
	if (state.finished) {
		return { events: [], state };
	}
	const events: string[] = [];
	let ndjson = state.ndjson;
	let { clientSeen, emailSeen, addressSeen } = state;
	let finished = false;
	for (const upstreamLine of lines) {
		if (isUpstreamDone(upstreamLine)) {
			finished = true;
			break;
		}
		const content = extractDeltaContent(upstreamLine);
		if (content === null) {
			continue;
		}
		ndjson += content;
		const completed = extractCompleteLines(ndjson);
		ndjson = completed.rest;
		for (const line of completed.lines) {
			if (line.trim() === '') {
				continue;
			}
			if (isClientLine(line)) {
				if (clientSeen) {
					// First valid client line wins: later client lines are
					// ignored silently, never emitted as invalid.
					continue;
				}
				const parsedClient = parseClientLine(line);
				if (parsedClient.ok) {
					events.push(clientEvent(parsedClient.name));
					clientSeen = true;
				} else {
					events.push(invalidEvent(line, parsedClient.reason));
				}
				continue;
			}
			if (isEmailLine(line)) {
				if (emailSeen) {
					// First valid email line wins: later email lines are
					// ignored silently, never emitted as invalid.
					continue;
				}
				const parsedEmail = parseEmailLine(line);
				if (parsedEmail.ok) {
					events.push(emailEvent(parsedEmail.email));
					emailSeen = true;
				} else {
					events.push(invalidEvent(line, parsedEmail.reason));
				}
				continue;
			}
			if (isAddressLine(line)) {
				if (addressSeen) {
					// First valid address line wins: later address lines are
					// ignored silently, never emitted as invalid.
					continue;
				}
				const parsedAddress = parseAddressLine(line);
				if (parsedAddress.ok) {
					events.push(addressEvent(parsedAddress.address));
					addressSeen = true;
				} else {
					events.push(invalidEvent(line, parsedAddress.reason));
				}
				continue;
			}
			const parsed = parseItemLine(line);
			events.push(parsed.ok ? itemEvent(parsed.item) : invalidEvent(line, parsed.reason));
		}
	}
	return { events, state: { ndjson, finished, clientSeen, emailSeen, addressSeen } };
}

/**
 * Flush the pump at upstream end or `[DONE]`: emit any remaining buffered
 * NDJSON line (the model's final line may lack a trailing newline) and mark
 * the pump finished. An empty or blank buffer emits nothing.
 */
export function flushUpstreamBuffer(state: PumpState): PumpBatchResult {
	const trailing = state.ndjson.trim();
	if (trailing === '') {
		return {
			events: [],
			state: { ndjson: '', finished: true, clientSeen: state.clientSeen, emailSeen: state.emailSeen, addressSeen: state.addressSeen }
		};
	}
	if (isClientLine(trailing)) {
		if (state.clientSeen) {
			return { events: [], state: { ndjson: '', finished: true, clientSeen: true, emailSeen: state.emailSeen, addressSeen: state.addressSeen } };
		}
		const parsedClient = parseClientLine(trailing);
		const event = parsedClient.ok
			? clientEvent(parsedClient.name)
			: invalidEvent(trailing, parsedClient.reason);
		return {
			events: [event],
			state: { ndjson: '', finished: true, clientSeen: parsedClient.ok, emailSeen: state.emailSeen, addressSeen: state.addressSeen }
		};
	}
	if (isEmailLine(trailing)) {
		if (state.emailSeen) {
			return { events: [], state: { ndjson: '', finished: true, clientSeen: state.clientSeen, emailSeen: true, addressSeen: state.addressSeen } };
		}
		const parsedEmail = parseEmailLine(trailing);
		const event = parsedEmail.ok
			? emailEvent(parsedEmail.email)
			: invalidEvent(trailing, parsedEmail.reason);
		return {
			events: [event],
			state: { ndjson: '', finished: true, clientSeen: state.clientSeen, emailSeen: parsedEmail.ok, addressSeen: state.addressSeen }
		};
	}
	if (isAddressLine(trailing)) {
		if (state.addressSeen) {
			return { events: [], state: { ndjson: '', finished: true, clientSeen: state.clientSeen, emailSeen: state.emailSeen, addressSeen: true } };
		}
		const parsedAddress = parseAddressLine(trailing);
		const event = parsedAddress.ok
			? addressEvent(parsedAddress.address)
			: invalidEvent(trailing, parsedAddress.reason);
		return {
			events: [event],
			state: { ndjson: '', finished: true, clientSeen: state.clientSeen, emailSeen: state.emailSeen, addressSeen: parsedAddress.ok }
		};
	}
	const parsed = parseItemLine(state.ndjson);
	const event = parsed.ok ? itemEvent(parsed.item) : invalidEvent(state.ndjson, parsed.reason);
	return {
		events: [event],
		state: { ndjson: '', finished: true, clientSeen: state.clientSeen, emailSeen: state.emailSeen, addressSeen: state.addressSeen }
	};
}

export type ParsedItemLine = { ok: true; item: BudgetItem } | { ok: false; reason: ErrorCode };

export type ParsedClientLine = { ok: true; name: string } | { ok: false; reason: ErrorCode };

export type ParsedEmailLine = { ok: true; email: string } | { ok: false; reason: ErrorCode };

export type ParsedAddressLine = { ok: true; address: string } | { ok: false; reason: ErrorCode };

/**
 * True when a parsed NDJSON line is a mention object carrying exactly one
 * mention string field and none of the item fields. An object mixing a
 * mention field with item fields is a budget item line, not a mention.
 */
function isMentionObject(parsed: unknown, field: 'client' | 'email' | 'address'): boolean {
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return false;
	}
	const source = parsed as Record<string, unknown>;
	return (
		typeof source[field] === 'string' &&
		!('description' in source) &&
		!('quantity' in source) &&
		!('unitPriceCents' in source)
	);
}

/** True when one complete NDJSON line is a client mention line. */
export function isClientLine(line: string): boolean {
	return isMentionObject(parseJsonLine(line), 'client');
}

/** True when one complete NDJSON line is an email mention line. */
export function isEmailLine(line: string): boolean {
	return isMentionObject(parseJsonLine(line), 'email');
}

/** True when one complete NDJSON line is an address mention line. */
export function isAddressLine(line: string): boolean {
	return isMentionObject(parseJsonLine(line), 'address');
}

/** JSON-parse a line, returning null for anything unparseable. */
function parseJsonLine(line: string): unknown {
	try {
		return JSON.parse(line);
	} catch {
		return null;
	}
}

/**
 * Parse one complete client mention line, reusing the shared
 * `validateClientName` exactly as budgets.ts does. Callers must classify the
 * line with `isClientLine` first; a non-client line shares the generic
 * client-data code (same documented deviation as http.ts).
 */
export function parseClientLine(line: string): ParsedClientLine {
	const parsed = parseJsonLine(line);
	if (!isMentionObject(parsed, 'client')) {
		return { ok: false, reason: GENERIC_ERROR_CODE };
	}
	const name = ((parsed as Record<string, unknown>).client as string).trim();
	const error = validateClientName(name);
	if (error !== null) {
		return { ok: false, reason: error };
	}
	return { ok: true, name };
}

/**
 * Parse one complete email mention line, reusing the shared
 * `validateClientEmail` exactly as budgets.ts does (empty means the model
 * emitted junk, so it surfaces as EMAIL_INVALID — see `validateMentionEmail`).
 * Callers must classify the line with `isEmailLine` first; a non-email line
 * shares the generic client-data code (same documented deviation as http.ts).
 */
export function parseEmailLine(line: string): ParsedEmailLine {
	const parsed = parseJsonLine(line);
	if (!isMentionObject(parsed, 'email')) {
		return { ok: false, reason: GENERIC_ERROR_CODE };
	}
	const error = validateMentionEmail((parsed as Record<string, unknown>).email as string);
	if (error !== null) {
		return { ok: false, reason: error };
	}
	return { ok: true, email: ((parsed as Record<string, unknown>).email as string).trim() };
}

/**
 * Parse one complete address mention line, reusing the shared
 * `validateClientAddress` exactly as budgets.ts does (empty means the model
 * emitted junk, so it surfaces as ADDRESS_TOO_LONG — see
 * `validateMentionAddress`). Callers must classify the line with
 * `isAddressLine` first; a non-address line shares the generic client-data
 * code (same documented deviation as http.ts).
 */
export function parseAddressLine(line: string): ParsedAddressLine {
	const parsed = parseJsonLine(line);
	if (!isMentionObject(parsed, 'address')) {
		return { ok: false, reason: GENERIC_ERROR_CODE };
	}
	const error = validateMentionAddress((parsed as Record<string, unknown>).address as string);
	if (error !== null) {
		return { ok: false, reason: error };
	}
	return { ok: true, address: ((parsed as Record<string, unknown>).address as string).trim() };
}

/**
 * Parse one complete NDJSON line as a budget item, reusing the shared domain
 * validators exactly as budgets.ts does. Unparseable JSON shares the generic
 * client-data code (same documented deviation as http.ts).
 */
export function parseItemLine(line: string): ParsedItemLine {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return { ok: false, reason: GENERIC_ERROR_CODE };
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { ok: false, reason: GENERIC_ERROR_CODE };
	}
	const source = parsed as Record<string, unknown>;

	const description = typeof source.description === 'string' ? source.description : '';
	const descriptionError = validateItemDescription(description);
	if (descriptionError !== null) {
		return { ok: false, reason: descriptionError };
	}

	if (typeof source.quantity !== 'string' && typeof source.quantity !== 'number') {
		return { ok: false, reason: 'QUANTITY_INVALID' };
	}
	const quantityError = validateItemQuantity(source.quantity);
	if (quantityError !== null) {
		return { ok: false, reason: quantityError };
	}
	// The grammar validation above guarantees a successful parse.
	const quantity = parseQuantity(source.quantity) as number;

	// Integer cents round-trip through the display-price grammar (same
	// normalization as budgets.ts priceToCents) so the 0,01 minimum and the
	// grammar-enforced 999999,99 maximum apply unchanged.
	let priceCents: number;
	if (typeof source.unitPriceCents === 'number') {
		if (!Number.isSafeInteger(source.unitPriceCents)) {
			return { ok: false, reason: 'PRICE_INVALID' };
		}
		const text = `${Math.floor(source.unitPriceCents / 100)}.${String(source.unitPriceCents % 100).padStart(2, '0')}`;
		const error = validateItemUnitPrice(text);
		if (error !== null) {
			return { ok: false, reason: error };
		}
		priceCents = parsePriceToCents(text) as number;
	} else if (typeof source.unitPriceCents === 'string') {
		const error = validateItemUnitPrice(source.unitPriceCents);
		if (error !== null) {
			return { ok: false, reason: error };
		}
		priceCents = parsePriceToCents(source.unitPriceCents.trim()) as number;
	} else {
		return { ok: false, reason: 'PRICE_INVALID' };
	}

	return {
		ok: true,
		item: { description: description.trim(), quantity, unitPriceCents: priceCents }
	};
}

const FRAME_PREFIX = 'data: ';

/** Downstream SSE frame for a validated item. */
export function itemEvent(item: BudgetItem): string {
	return `${FRAME_PREFIX}${JSON.stringify({ type: 'item', item })}\n\n`;
}

/** Downstream SSE frame for an unparseable or invalid line (never fatal). */
export function invalidEvent(line: string, reason: ErrorCode): string {
	return `${FRAME_PREFIX}${JSON.stringify({ type: 'invalid', line, reason })}\n\n`;
}

/** Downstream SSE frame for a validated client mention (at most once per stream). */
export function clientEvent(name: string): string {
	return `${FRAME_PREFIX}${JSON.stringify({ type: 'client', client: { name } })}\n\n`;
}

/** Downstream SSE frame for a validated email mention (at most once per stream). */
export function emailEvent(email: string): string {
	return `${FRAME_PREFIX}${JSON.stringify({ type: 'email', email })}\n\n`;
}

/** Downstream SSE frame for a validated address mention (at most once per stream). */
export function addressEvent(address: string): string {
	return `${FRAME_PREFIX}${JSON.stringify({ type: 'address', address })}\n\n`;
}

/** Downstream SSE terminal frame: upstream finished cleanly. */
export function doneEvent(): string {
	return `${FRAME_PREFIX}${JSON.stringify({ type: 'done' })}\n\n`;
}

/**
 * Downstream SSE frame for a mid-stream upstream failure. It replaces the
 * `done` frame (never emitted together with it) so the client knows the
 * item list may be truncated.
 */
export function errorEvent(message: string): string {
	return `${FRAME_PREFIX}${JSON.stringify({ type: 'error', message })}\n\n`;
}
