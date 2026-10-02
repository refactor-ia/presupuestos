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
