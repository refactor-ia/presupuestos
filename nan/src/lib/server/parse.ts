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
	validateItemDescription,
	validateItemQuantity,
	validateItemUnitPrice
} from '$lib/domain/validate';
import type { BudgetItem, ErrorCode } from '$lib/domain/validate';

/** NaN API (OpenAI-compatible) chat completions endpoint. */
export const UPSTREAM_URL = 'https://api.nan.builders/v1/chat/completions';

/** Client text cap: at most 2000 characters after trim. */
export const MAX_PARSE_TEXT_LENGTH = 2000;

const GENERIC_ERROR_CODE: ErrorCode = 'EXPORT_CLIENT_INVALID';

/**
 * System prompt for the model: English instructions, Spanish item
 * descriptions. Output contract is newline-delimited JSON, one item per
 * line, nothing else.
 */
export const SYSTEM_PROMPT = [
	'You convert a natural-language budget request (Spanish) into budget items.',
	'Output ONLY newline-delimited JSON objects: one budget item per line, no prose, no code fences, no blank lines.',
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

/** Immutable-ish pump state threaded through the upstream-line reducer. */
export type PumpState = {
	/** Accumulated model NDJSON text not yet terminated by a newline. */
	ndjson: string;
	/** True once the upstream `[DONE]` sentinel has been seen. */
	finished: boolean;
};

/** Initial pump state: empty NDJSON buffer, stream not finished. */
export function initialPumpState(): PumpState {
	return { ndjson: '', finished: false };
}

/** Result of feeding a batch of raw upstream lines through the pump. */
export type PumpBatchResult = {
	/** Downstream SSE frames (item/invalid) emitted for completed NDJSON lines. */
	events: string[];
	/** The pump state after this batch. */
	state: PumpState;
};

/**
 * Pure reducer for the upstream pump: feed raw upstream SSE lines, get the
 * downstream item/invalid frames plus the next state.
 *
 * Each upstream chunk line is decoded via `extractDeltaContent` and its
 * content appended to the model NDJSON buffer; every completed NDJSON line
 * is then parsed and validated with `parseItemLine`. `[DONE]` and anything
 * after it stop the pump without emitting frames; non-text lines are
 * ignored silently.
 */
export function processUpstreamLines(lines: string[], state: PumpState): PumpBatchResult {
	if (state.finished) {
		return { events: [], state };
	}
	const events: string[] = [];
	let ndjson = state.ndjson;
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
			const parsed = parseItemLine(line);
			events.push(parsed.ok ? itemEvent(parsed.item) : invalidEvent(line, parsed.reason));
		}
	}
	return { events, state: { ndjson, finished } };
}

/**
 * Flush the pump at upstream end or `[DONE]`: emit any remaining buffered
 * NDJSON line (the model's final line may lack a trailing newline) and mark
 * the pump finished. An empty or blank buffer emits nothing.
 */
export function flushUpstreamBuffer(state: PumpState): PumpBatchResult {
	const trailing = state.ndjson.trim();
	if (trailing === '') {
		return { events: [], state: { ndjson: '', finished: true } };
	}
	const parsed = parseItemLine(state.ndjson);
	const event = parsed.ok ? itemEvent(parsed.item) : invalidEvent(state.ndjson, parsed.reason);
	return { events: [event], state: { ndjson: '', finished: true } };
}

export type ParsedItemLine = { ok: true; item: BudgetItem } | { ok: false; reason: ErrorCode };

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

/** Downstream SSE terminal frame: upstream finished. */
export function doneEvent(): string {
	return `${FRAME_PREFIX}${JSON.stringify({ type: 'done' })}\n\n`;
}
