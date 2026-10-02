import { describe, expect, it } from 'vitest';
import type { BudgetItem } from '$lib/domain/validate';
import {
	buildUpstreamBody,
	extractCompleteLines,
	itemEvent,
	invalidEvent,
	doneEvent,
	normalizeParseText,
	parseItemLine,
	SYSTEM_PROMPT,
	UPSTREAM_URL
} from './parse';

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
