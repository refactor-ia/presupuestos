import { describe, expect, it } from 'vitest';
import type { BudgetItem } from '$lib/domain/validate';
import {
	buildUpstreamBody,
	extractCompleteLines,
	extractDeltaContent,
	flushUpstreamBuffer,
	initialPumpState,
	isUpstreamDone,
	itemEvent,
	invalidEvent,
	doneEvent,
	normalizeParseText,
	parseItemLine,
	processUpstreamLines,
	SYSTEM_PROMPT,
	UPSTREAM_URL
} from './parse';
import type { PumpState } from './parse';

/**
 * Pure-logic tests for the /api/parse pipeline: SSE chunk buffering, NDJSON
 * line parsing + validation, downstream event builders, input text contract
 * and the upstream request body. No network and no framework involved.
 */

function itemLine(item: BudgetItem): string {
	return JSON.stringify(item);
}

const validItem: BudgetItem = {
	description: 'Pintura látex interior 20L',
	quantity: 3,
	unitPriceCents: 459900
};

describe('extractCompleteLines', () => {
	it('returns completed lines and keeps the trailing fragment as the new buffer', () => {
		const result = extractCompleteLines('{"a":1}\n{"b":\n{"b":2}');
		expect(result.lines).toEqual(['{"a":1}', '{"b":']);
		expect(result.rest).toBe('{"b":2}');
	});

	it('splits a line delivered across two chunks', () => {
		const first = extractCompleteLines('{"description":"Pint');
		expect(first.lines).toEqual([]);
		expect(first.rest).toBe('{"description":"Pint');
		const second = extractCompleteLines(first.rest + 'ura","quantity":1,"unitPriceCents":100}\n');
		expect(second.lines).toEqual([
			'{"description":"Pintura","quantity":1,"unitPriceCents":100}'
		]);
		expect(second.rest).toBe('');
	});

	it('emits multiple complete lines from one chunk and strips carriage returns', () => {
		const result = extractCompleteLines('a\r\nb\n');
		expect(result.lines).toEqual(['a', 'b']);
		expect(result.rest).toBe('');
	});
});

describe('parseItemLine', () => {
	it('parses and validates a valid item line, normalizing integer cents', () => {
		const result = parseItemLine(itemLine(validItem));
		expect(result).toEqual({ ok: true, item: validItem });
	});

	it('accepts quantity and unit price as strings (validator grammars)', () => {
		const result = parseItemLine(
			JSON.stringify({ description: 'Clavos', quantity: '2', unitPriceCents: 1500 })
		);
		expect(result).toEqual({
			ok: true,
			item: { description: 'Clavos', quantity: 2, unitPriceCents: 1500 }
		});
	});

	it('rejects malformed JSON with the generic client-data code', () => {
		const result = parseItemLine('{not json');
		expect(result).toEqual({ ok: false, reason: 'EXPORT_CLIENT_INVALID' });
	});

	it('rejects non-object JSON lines', () => {
		expect(parseItemLine('[1,2]')).toEqual({ ok: false, reason: 'EXPORT_CLIENT_INVALID' });
		expect(parseItemLine('42')).toEqual({ ok: false, reason: 'EXPORT_CLIENT_INVALID' });
	});

	it('rejects quantity 0 with QUANTITY_INVALID', () => {
		const result = parseItemLine(
			itemLine({ description: 'Pintura', quantity: 0, unitPriceCents: 100 })
		);
		expect(result).toEqual({ ok: false, reason: 'QUANTITY_INVALID' });
	});

	it('rejects unitPriceCents 0 with PRICE_BELOW_MINIMUM', () => {
		const result = parseItemLine(
			itemLine({ description: 'Pintura', quantity: 1, unitPriceCents: 0 })
		);
		expect(result).toEqual({ ok: false, reason: 'PRICE_BELOW_MINIMUM' });
	});

	it('rejects an empty description with ITEM_DESCRIPTION_REQUIRED', () => {
		const result = parseItemLine(
			itemLine({ description: '   ', quantity: 1, unitPriceCents: 100 })
		);
		expect(result).toEqual({ ok: false, reason: 'ITEM_DESCRIPTION_REQUIRED' });
	});

	it('rejects a missing field with the field-specific code', () => {
		expect(parseItemLine('{"quantity":1,"unitPriceCents":100}')).toEqual({
			ok: false,
			reason: 'ITEM_DESCRIPTION_REQUIRED'
		});
	});
});

describe('event builders', () => {
	it('itemEvent emits one SSE data frame with the item payload', () => {
		const frame = itemEvent(validItem);
		expect(frame.endsWith('\n\n')).toBe(true);
		expect(frame.startsWith('data: ')).toBe(true);
		const payload = JSON.parse(frame.slice('data: '.length)) as {
			type: string;
			item: unknown;
		};
		expect(payload.type).toBe('item');
		expect(payload.item).toEqual(validItem);
	});

	it('invalidEvent emits the raw line and the error reason, never the item', () => {
		const frame = invalidEvent('{oops', 'QUANTITY_INVALID');
		const payload = JSON.parse(frame.slice('data: '.length)) as {
			type: string;
			line: string;
			reason: string;
		};
		expect(payload).toEqual({ type: 'invalid', line: '{oops', reason: 'QUANTITY_INVALID' });
	});

	it('doneEvent emits the terminal frame', () => {
		const payload = JSON.parse(doneEvent().slice('data: '.length)) as { type: string };
		expect(payload).toEqual({ type: 'done' });
	});
});

/** Parse the JSON payload out of a downstream SSE frame for assertions. */
function framePayload(frame: string): Record<string, unknown> {
	return JSON.parse(frame.slice('data: '.length)) as Record<string, unknown>;
}

/** Wrap one model NDJSON line into a realistic OpenAI chunk line. */
function chunkLine(content: string): string {
	return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;
}

describe('extractDeltaContent', () => {
	it('extracts the delta content from a standard chat-completions chunk', () => {
		const modelLine = '{"description":"Pintura"}';
		expect(
			extractDeltaContent(
				`data: ${JSON.stringify({ choices: [{ delta: { content: modelLine } }] })}`
			)
		).toBe(modelLine);
	});

	it('strips a `data:` prefix without the space', () => {
		expect(extractDeltaContent('data:{"choices":[{"delta":{"content":"x"}}]}')).toBe('x');
	});

	it('returns the empty string for valid chunks with empty or absent content', () => {
		expect(extractDeltaContent(chunkLine(''))).toBe('');
		expect(extractDeltaContent('data: {"choices":[{"delta":{}}]}')).toBe('');
		expect(extractDeltaContent('data: {"choices":[]}')).toBe('');
	});

	it('returns null for empty lines, [DONE], keep-alive comments and unparseable payloads', () => {
		expect(extractDeltaContent('')).toBeNull();
		expect(extractDeltaContent('   ')).toBeNull();
		expect(extractDeltaContent('data: [DONE]')).toBeNull();
		expect(extractDeltaContent(': ping')).toBeNull();
		expect(extractDeltaContent('data: {not json')).toBeNull();
		expect(extractDeltaContent('data: 42')).toBeNull();
	});
});

describe('isUpstreamDone', () => {
	it('recognizes the [DONE] sentinel with or without the data prefix', () => {
		expect(isUpstreamDone('data: [DONE]')).toBe(true);
		expect(isUpstreamDone('data:[DONE]')).toBe(true);
		expect(isUpstreamDone('[DONE]')).toBe(true);
		expect(isUpstreamDone('data: {"choices":[]}')).toBe(false);
		expect(isUpstreamDone(': ping')).toBe(false);
	});
});

describe('processUpstreamLines', () => {
	it('reassembles model content spanning two chunks into one item event', () => {
		let state: PumpState = initialPumpState();
		const first = processUpstreamLines(
			[chunkLine('{"description":"Pintura l'), chunkLine('átex","quantity":2,')],
			state
		);
		state = first.state;
		expect(first.events).toEqual([]);
		const second = processUpstreamLines(
			[chunkLine('"unitPriceCents":100}\n'), chunkLine('')],
			state
		);
		state = second.state;
		expect(second.events).toHaveLength(1);
		expect(framePayload(second.events[0])).toEqual({
			type: 'item',
			item: { description: 'Pintura látex', quantity: 2, unitPriceCents: 100 }
		});
		expect(state.finished).toBe(false);
		expect(state.ndjson).toBe('');
	});

	it('emits an invalid event with QUANTITY_INVALID for quantity-0 content', () => {
		const line = JSON.stringify({
			description: 'Pintura',
			quantity: 0,
			unitPriceCents: 100
		});
		const result = processUpstreamLines([chunkLine(`${line}\n`)], initialPumpState());
		expect(result.events).toHaveLength(1);
		expect(framePayload(result.events[0])).toEqual({ type: 'invalid', line, reason: 'QUANTITY_INVALID' });
	});

	it('handles a realistic mixed stream: keep-alive, garbage line, items, [DONE]', () => {
		const goodLine = JSON.stringify({ description: 'Clavos', quantity: 1, unitPriceCents: 500 });
		const result = processUpstreamLines(
			[
				': ping',
				chunkLine(`${goodLine}\n`),
				'data: {not json',
				'data: [DONE]'
			],
			initialPumpState()
		);
		expect(result.events).toHaveLength(1);
		expect(framePayload(result.events[0])).toEqual({
			type: 'item',
			item: { description: 'Clavos', quantity: 1, unitPriceCents: 500 }
		});
		expect(result.state.finished).toBe(true);
		// No spurious invalid event for the keep-alive, the garbage chunk or [DONE].
		expect(result.events.some((frame) => framePayload(frame).type === 'invalid')).toBe(false);
	});

	it('stops processing lines after [DONE]', () => {
		const line = JSON.stringify({ description: 'Tornillos', quantity: 4, unitPriceCents: 50 });
		const result = processUpstreamLines(
			['data: [DONE]', chunkLine(`${line}\n`)],
			initialPumpState()
		);
		expect(result.events).toEqual([]);
		expect(result.state.finished).toBe(true);
	});
});

describe('flushUpstreamBuffer', () => {
	it('flushes the trailing complete NDJSON line and resets the state', () => {
		let state: PumpState = initialPumpState();
		state = processUpstreamLines(
			[chunkLine('{"description":"Pintura","quantity":1,"unitPriceCents":100}')],
			state
		).state;
		const flush = flushUpstreamBuffer(state);
		expect(flush.events).toHaveLength(1);
		expect(framePayload(flush.events[0])).toEqual({
			type: 'item',
			item: { description: 'Pintura', quantity: 1, unitPriceCents: 100 }
		});
		expect(flush.state.ndjson).toBe('');
		expect(flush.state.finished).toBe(true);
	});

	it('emits nothing when the buffer is empty', () => {
		const flush = flushUpstreamBuffer(initialPumpState());
		expect(flush.events).toEqual([]);
	});
});

describe('normalizeParseText', () => {
	it('trims and accepts text within the cap', () => {
		expect(normalizeParseText('  presupuesto  ')).toEqual({ ok: true, text: 'presupuesto' });
	});

	it('rejects missing, non-string, blank and over-cap input', () => {
		expect(normalizeParseText(undefined).ok).toBe(false);
		expect(normalizeParseText(42).ok).toBe(false);
		expect(normalizeParseText('   ').ok).toBe(false);
		expect(normalizeParseText('a'.repeat(2001)).ok).toBe(false);
	});

	it('accepts exactly 2000 characters after trim', () => {
		expect(normalizeParseText(`  ${'a'.repeat(2000)}  `)).toEqual({
			ok: true,
			text: 'a'.repeat(2000)
		});
	});
});

describe('upstream contract', () => {
	it('exposes the NaN API chat completions endpoint', () => {
		expect(UPSTREAM_URL).toBe('https://api.nan.builders/v1/chat/completions');
	});

	it('builds a gemma4 streaming request with temperature 0 and system+user messages', () => {
		const body = JSON.parse(buildUpstreamBody('tres pinturas')) as {
			model: string;
			stream: boolean;
			temperature: number;
			messages: { role: string; content: string }[];
		};
		expect(body.model).toBe('gemma4');
		expect(body.stream).toBe(true);
		expect(body.temperature).toBe(0);
		expect(body.messages).toHaveLength(2);
		expect(body.messages[0].role).toBe('system');
		expect(body.messages[1]).toEqual({ role: 'user', content: 'tres pinturas' });
	});

	it('system prompt states the three field contracts and the NDJSON-only output', () => {
		expect(SYSTEM_PROMPT).toContain('description');
		expect(SYSTEM_PROMPT).toContain('quantity');
		expect(SYSTEM_PROMPT).toContain('unitPriceCents');
		expect(SYSTEM_PROMPT).toContain('240');
		expect(SYSTEM_PROMPT).toContain('1..9999');
		expect(SYSTEM_PROMPT).toContain('99999999');
		expect(SYSTEM_PROMPT).toContain('JSON');
	});
});
