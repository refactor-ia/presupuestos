/**
 * Client fetch helpers for the budgets API and the pure SSE chunk parser for
 * POST /api/parse. English comments per project convention; every
 * user-visible string lives in the components, not here.
 *
 * Error contract: every non-OK API response carries a `{ code, message }`
 * body (see $lib/server/http); these helpers surface it as an `ApiError`
 * exception carrying the server's Spanish message, so callers can render it
 * directly. No framework imports here — this module is safe to unit-test.
 */

import type { BudgetItem } from '$lib/domain/validate';

/** Payload shape expected by POST /api/budgets (see $lib/server/budgets.ts). */
export interface BudgetPayload {
	number: string;
	clientName: string;
	email: string;
	address: string;
	rut: string;
	items: BudgetItem[];
}

/** A stored budget, as returned by every budgets endpoint. */
export interface Budget extends BudgetPayload {
	id: number;
	createdAt: string;
	updatedAt: string;
}

/** Error thrown by every helper when the response is not OK. */
export class ApiError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, message: string, status: number) {
		super(message);
		this.name = 'ApiError';
		this.code = code;
		this.status = status;
	}
}

/**
 * Extract the `{ code, message }` body from a failed response. A body that
 * cannot be parsed falls back to the status text so the failure is never
 * silent.
 */
async function apiErrorFrom(response: Response): Promise<ApiError> {
	let code = 'UNKNOWN';
	let message = `Error ${response.status}`;
	try {
		const body: unknown = await response.json();
		if (
			typeof body === 'object' &&
			body !== null &&
			typeof (body as Record<string, unknown>).code === 'string' &&
			typeof (body as Record<string, unknown>).message === 'string'
		) {
			const typed = body as Record<string, unknown>;
			code = typed.code as string;
			message = typed.message as string;
		}
	} catch {
		// keep the fallback code/message
	}
	return new ApiError(code, message, response.status);
}

/** POST /api/budgets — create a budget; resolves with the stored budget (201). */
export async function saveBudget(payload: BudgetPayload): Promise<Budget> {
	const response = await fetch('/api/budgets', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!response.ok) {
		throw await apiErrorFrom(response);
	}
	return (await response.json()) as Budget;
}

/** PUT /api/budgets/[id] — update a saved budget; rejects with ApiError when missing or invalid. */
export async function updateBudget(id: number, payload: BudgetPayload): Promise<Budget> {
	const response = await fetch(`/api/budgets/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!response.ok) {
		throw await apiErrorFrom(response);
	}
	return (await response.json()) as Budget;
}

/** GET /api/budgets — all saved budgets, newest first. */
export async function listBudgets(): Promise<Budget[]> {
	const response = await fetch('/api/budgets');
	if (!response.ok) {
		throw await apiErrorFrom(response);
	}
	return (await response.json()) as Budget[];
}

/** GET /api/budgets/[id] — a single saved budget; rejects with ApiError when missing. */
export async function loadBudget(id: number): Promise<Budget> {
	const response = await fetch(`/api/budgets/${id}`);
	if (!response.ok) {
		throw await apiErrorFrom(response);
	}
	return (await response.json()) as Budget;
}

/** DELETE /api/budgets/[id] — removes a saved budget; rejects with ApiError when missing. */
export async function deleteBudget(id: number): Promise<void> {
	const response = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
	if (!response.ok) {
		throw await apiErrorFrom(response);
	}
}

/**
 * One downstream parse event, as emitted by /api/parse (SSE `data:` frames).
 * Unknown event types and malformed frames are dropped by the parser below.
 */
export type ParseEvent =
	| { type: 'item'; item: BudgetItem }
	| { type: 'client'; client: { name: string } }
	| { type: 'invalid'; line: string; reason: string }
	| { type: 'error'; message: string }
	| { type: 'done' };

/**
 * Parse the accumulated SSE buffer into complete events plus the trailing
 * incomplete frame. Pure: the caller keeps the buffer (typically
 * `buffer += chunk; const { complete, rest } = parseSseChunk(buffer); buffer = rest;`),
 * so frames split across network chunks are completed once their remainder
 * arrives. Malformed JSON and unknown event types are ignored, never fatal.
 */
export function parseSseChunk(chunk: string): { complete: ParseEvent[]; rest: string } {
	const normalized = chunk.replace(/\r\n/g, '\n');
	const frames = normalized.split('\n\n');
	const rest = frames.pop() ?? '';
	const complete: ParseEvent[] = [];
	for (const frame of frames) {
		const event = parseSseFrame(frame);
		if (event !== null) {
			complete.push(event);
		}
	}
	return { complete, rest };
}

/** Parse one complete SSE frame: all its `data:` lines joined, then JSON-parsed. */
function parseSseFrame(frame: string): ParseEvent | null {
	const dataLines = frame
		.split('\n')
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice(5).trimStart());
	if (dataLines.length === 0) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(dataLines.join('\n'));
	} catch {
		return null; // malformed JSON: ignored
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return null;
	}
	const event = parsed as Record<string, unknown>;
	if (event.type === 'done') {
		return { type: 'done' };
	}
	if (event.type === 'error' && typeof event.message === 'string') {
		return { type: 'error', message: event.message };
	}
	if (event.type === 'invalid' && typeof event.line === 'string') {
		return {
			type: 'invalid',
			line: event.line,
			reason: typeof event.reason === 'string' ? event.reason : ''
		};
	}
	if (event.type === 'client' && isClientNamePayload(event.client)) {
		return { type: 'client', client: { name: (event.client as { name: string }).name } };
	}
	if (event.type === 'item' && isBudgetItem(event.item)) {
		return { type: 'item', item: event.item };
	}
	return null; // unknown or malformed event type: ignored
}

/** Light shape check for streamed items; the server already validated the domain rules. */
function isBudgetItem(value: unknown): value is BudgetItem {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const item = value as Record<string, unknown>;
	return (
		typeof item.description === 'string' &&
		typeof item.quantity === 'number' &&
		Number.isFinite(item.quantity) &&
		typeof item.unitPriceCents === 'number' &&
		Number.isFinite(item.unitPriceCents)
	);
}

/** Light shape check for streamed client mentions (string name, nothing else required). */
function isClientNamePayload(value: unknown): value is { name: string } {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		typeof (value as Record<string, unknown>).name === 'string'
	);
}
