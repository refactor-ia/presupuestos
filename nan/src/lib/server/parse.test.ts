import { describe, expect, it } from 'vitest';
import type { BudgetItem } from '$lib/domain/validate';
import {
	buildUpstreamBody,
	clientEvent,
	emailEvent,
	addressEvent,
	extractCompleteLines,
	extractDeltaContent,
	flushUpstreamBuffer,
	initialPumpState,
	isUpstreamDone,
	itemEvent,
	invalidEvent,
	doneEvent,
	errorEvent,
	STREAM_INTERRUPTED_MESSAGE,
	normalizeParseText,
	parseClientLine,
	parseEmailLine,
	parseAddressLine,
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

/**
 * Client mention lines: an NDJSON object with a single string `client` field
 * (no item fields). A line mixing `client` with item fields is an item line.
 */
describe('parseClientLine', () => {
	it('parses a valid client line and trims the name', () => {
		expect(parseClientLine('{"client":"  Leo Bidi "}')).toEqual({ ok: true, name: 'Leo Bidi' });
	});

	it('rejects an empty (whitespace) client name with CLIENT_NAME_REQUIRED', () => {
		expect(parseClientLine('{"client":"   "}')).toEqual({
			ok: false,
			reason: 'CLIENT_NAME_REQUIRED'
		});
	});

	it('rejects a name over 120 characters with CLIENT_NAME_TOO_LONG', () => {
		expect(parseClientLine(JSON.stringify({ client: 'a'.repeat(121) }))).toEqual({
			ok: false,
			reason: 'CLIENT_NAME_TOO_LONG'
		});
	});

	it('accepts a name of exactly 120 characters', () => {
		const name = 'a'.repeat(120);
		expect(parseClientLine(JSON.stringify({ client: name }))).toEqual({ ok: true, name });
	});
});

/**
 * Email mention lines: an NDJSON object with a single string `email` field
 * (no item fields). A line mixing `email` with item fields is an item line.
 */
describe('parseEmailLine', () => {
	it('parses a valid email line and trims it', () => {
		expect(parseEmailLine('{"email":"  leo@selamastic.com "}')).toEqual({
			ok: true,
			email: 'leo@selamastic.com'
		});
	});

	it('rejects an empty (whitespace) email with EMAIL_INVALID (model emitted junk)', () => {
		expect(parseEmailLine('{"email":"   "}')).toEqual({ ok: false, reason: 'EMAIL_INVALID' });
	});

	it('rejects a malformed email with EMAIL_INVALID', () => {
		expect(parseEmailLine('{"email":"not-an-email"}')).toEqual({
			ok: false,
			reason: 'EMAIL_INVALID'
		});
	});

	it('rejects an email over 254 characters with EMAIL_TOO_LONG', () => {
		const local = 'a'.repeat(250);
		expect(parseEmailLine(JSON.stringify({ email: `${local}@example.com` }))).toEqual({
			ok: false,
			reason: 'EMAIL_TOO_LONG'
		});
	});
});

/**
 * Address mention lines: an NDJSON object with a single string `address`
 * field (no item fields). A line mixing `address` with item fields is an
 * item line.
 */
describe('parseAddressLine', () => {
	it('parses a valid address line and trims it verbatim', () => {
		expect(parseAddressLine('{"address":"  av sarmiento 456 "}')).toEqual({
			ok: true,
			address: 'av sarmiento 456'
		});
	});

	it('rejects an empty (whitespace) address (model emitted junk)', () => {
		expect(parseAddressLine('{"address":"   "}').ok).toBe(false);
	});

	it('rejects an address over 240 characters with ADDRESS_TOO_LONG', () => {
		expect(parseAddressLine(JSON.stringify({ address: 'a'.repeat(241) }))).toEqual({
			ok: false,
			reason: 'ADDRESS_TOO_LONG'
		});
	});

	it('accepts an address of exactly 240 characters', () => {
		const address = 'a'.repeat(240);
		expect(parseAddressLine(JSON.stringify({ address }))).toEqual({ ok: true, address });
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

	it('clientEvent emits one SSE data frame with the trimmed client name', () => {
		const frame = clientEvent('Leo Bidi');
		expect(frame.endsWith('\n\n')).toBe(true);
		expect(frame.startsWith('data: ')).toBe(true);
		const payload = JSON.parse(frame.slice('data: '.length)) as {
			type: string;
			client: { name: string };
		};
		expect(payload).toEqual({ type: 'client', client: { name: 'Leo Bidi' } });
	});

	it('emailEvent emits one SSE data frame with the email payload', () => {
		const frame = emailEvent('leo@selamastic.com');
		expect(frame.endsWith('\n\n')).toBe(true);
		expect(frame.startsWith('data: ')).toBe(true);
		const payload = JSON.parse(frame.slice('data: '.length)) as {
			type: string;
			email: string;
		};
		expect(payload).toEqual({ type: 'email', email: 'leo@selamastic.com' });
	});

	it('addressEvent emits one SSE data frame with the address payload', () => {
		const frame = addressEvent('av sarmiento 456');
		expect(frame.endsWith('\n\n')).toBe(true);
		expect(frame.startsWith('data: ')).toBe(true);
		const payload = JSON.parse(frame.slice('data: '.length)) as {
			type: string;
			address: string;
		};
		expect(payload).toEqual({ type: 'address', address: 'av sarmiento 456' });
	});

	it('errorEvent emits one SSE data frame with the given message', () => {
		const frame = errorEvent('Algo salió mal');
		expect(frame.endsWith('\n\n')).toBe(true);
		expect(frame.startsWith('data: ')).toBe(true);
		const payload = JSON.parse(frame.slice('data: '.length)) as {
			type: string;
			message: string;
		};
		expect(payload).toEqual({ type: 'error', message: 'Algo salió mal' });
	});

	it('STREAM_INTERRUPTED_MESSAGE tells the user the stream was cut short', () => {
		expect(STREAM_INTERRUPTED_MESSAGE).toBe(
			'El análisis se interrumpió. Los ítems mostrados pueden estar incompletos.'
		);
		expect(STREAM_INTERRUPTED_MESSAGE).not.toContain('Listo');
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

	describe('email mention lines', () => {
		it('emits an email event for a valid email line, trimming it', () => {
			const result = processUpstreamLines(
				[chunkLine('{"email":"  leo@selamastic.com "}\n')],
				initialPumpState()
			);
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'email',
				email: 'leo@selamastic.com'
			});
			expect(result.state.emailSeen).toBe(true);
		});

		it('emits an invalid event with EMAIL_INVALID for an empty email', () => {
			const line = JSON.stringify({ email: '   ' });
			const result = processUpstreamLines([chunkLine(`${line}\n`)], initialPumpState());
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'invalid',
				line,
				reason: 'EMAIL_INVALID'
			});
			expect(result.state.emailSeen).toBe(false);
		});

		it('emits an invalid event with EMAIL_TOO_LONG for an over-long email', () => {
			const line = JSON.stringify({ email: `${'a'.repeat(250)}@example.com` });
			const result = processUpstreamLines([chunkLine(`${line}\n`)], initialPumpState());
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'invalid',
				line,
				reason: 'EMAIL_TOO_LONG'
			});
		});

		it('ignores later email lines after the first valid one (first valid wins)', () => {
			const result = processUpstreamLines(
				[
					chunkLine('{"email":"leo@selamastic.com"}\n'),
					chunkLine('{"email":"otro@example.com"}\n')
				],
				initialPumpState()
			);
			expect(result.events).toHaveLength(1); // no invalid event for the later line
			expect(framePayload(result.events[0])).toEqual({
				type: 'email',
				email: 'leo@selamastic.com'
			});
		});

		it('ignores later email lines split across batches (state carries emailSeen)', () => {
			let state = initialPumpState();
			const first = processUpstreamLines([chunkLine('{"email":"leo@selamastic.com"}\n')], state);
			state = first.state;
			const second = processUpstreamLines([chunkLine('{"email":"otro@example.com"}\n')], state);
			expect(first.events).toHaveLength(1);
			expect(second.events).toEqual([]);
		});

		it('emits invalid for the first (empty) email line and accepts a later valid one', () => {
			const badLine = JSON.stringify({ email: '' });
			const result = processUpstreamLines(
				[chunkLine(`${badLine}\n`), chunkLine('{"email":"leo@selamastic.com"}\n')],
				initialPumpState()
			);
			expect(result.events).toHaveLength(2);
			expect(framePayload(result.events[0])).toEqual({
				type: 'invalid',
				line: badLine,
				reason: 'EMAIL_INVALID'
			});
			expect(framePayload(result.events[1])).toEqual({
				type: 'email',
				email: 'leo@selamastic.com'
			});
		});

		it('treats an object mixing email with item fields as an item line', () => {
			const line = JSON.stringify({
				email: 'leo@selamastic.com',
				description: 'Chorizos colorados',
				quantity: 45,
				unitPriceCents: 1500
			});
			const result = processUpstreamLines([chunkLine(`${line}\n`)], initialPumpState());
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'item',
				item: { description: 'Chorizos colorados', quantity: 45, unitPriceCents: 1500 }
			});
			expect(result.state.emailSeen).toBe(false);
		});
	});

	describe('address mention lines', () => {
		it('emits an address event for a valid address line, trimming it verbatim', () => {
			const result = processUpstreamLines(
				[chunkLine('{"address":"  av sarmiento 456 "}\n')],
				initialPumpState()
			);
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'address',
				address: 'av sarmiento 456'
			});
			expect(result.state.addressSeen).toBe(true);
		});

		it('emits an invalid event with ADDRESS_TOO_LONG for an over-long address', () => {
			const line = JSON.stringify({ address: 'a'.repeat(241) });
			const result = processUpstreamLines([chunkLine(`${line}\n`)], initialPumpState());
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'invalid',
				line,
				reason: 'ADDRESS_TOO_LONG'
			});
			expect(result.state.addressSeen).toBe(false);
		});

		it('ignores later address lines after the first valid one (first valid wins)', () => {
			const result = processUpstreamLines(
				[
					chunkLine('{"address":"av sarmiento 456"}\n'),
					chunkLine('{"address":"otra calle 1"}\n')
				],
				initialPumpState()
			);
			expect(result.events).toHaveLength(1); // no invalid event for the later line
			expect(framePayload(result.events[0])).toEqual({
				type: 'address',
				address: 'av sarmiento 456'
			});
		});

		it('emits invalid for the first (empty) address line and accepts a later valid one', () => {
			const badLine = JSON.stringify({ address: '' });
			const result = processUpstreamLines(
				[chunkLine(`${badLine}\n`), chunkLine('{"address":"av sarmiento 456"}\n')],
				initialPumpState()
			);
			expect(result.events).toHaveLength(2);
			expect(framePayload(result.events[0]).type).toBe('invalid');
			expect(framePayload(result.events[1])).toEqual({
				type: 'address',
				address: 'av sarmiento 456'
			});
		});

		it('treats an object mixing address with item fields as an item line', () => {
			const line = JSON.stringify({
				address: 'av sarmiento 456',
				description: 'Chorizos colorados',
				quantity: 45,
				unitPriceCents: 1500
			});
			const result = processUpstreamLines([chunkLine(`${line}\n`)], initialPumpState());
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'item',
				item: { description: 'Chorizos colorados', quantity: 45, unitPriceCents: 1500 }
			});
			expect(result.state.addressSeen).toBe(false);
		});
	});

	it('handles a realistic stream: client, email, address, items and [DONE]', () => {
		const itemLine = JSON.stringify({
			description: 'Chorizos de rueda',
			quantity: 3,
			unitPriceCents: 450000
		});
		const result = processUpstreamLines(
			[
				chunkLine('{"client":"Leo"}\n'),
				chunkLine('{"email":"leo@selamastic.com"}\n'),
				chunkLine('{"address":"av sarmiento 456"}\n'),
				chunkLine(`${itemLine}\n`),
				'data: [DONE]'
			],
			initialPumpState()
		);
		expect(result.events).toHaveLength(4);
		expect(framePayload(result.events[0])).toEqual({ type: 'client', client: { name: 'Leo' } });
		expect(framePayload(result.events[1])).toEqual({
			type: 'email',
			email: 'leo@selamastic.com'
		});
		expect(framePayload(result.events[2])).toEqual({
			type: 'address',
			address: 'av sarmiento 456'
		});
		expect(framePayload(result.events[3])).toEqual({
			type: 'item',
			item: { description: 'Chorizos de rueda', quantity: 3, unitPriceCents: 450000 }
		});
		expect(result.state.finished).toBe(true);
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

	/** Extract the client-event payloads (if any) from emitted frames. */
	function clientPayloads(events: string[]): Record<string, unknown>[] {
		return events.map(framePayload).filter((payload) => payload.type === 'client');
	}

	describe('client mention lines', () => {
		it('emits a client event for a valid client line, trimming the name', () => {
			const result = processUpstreamLines(
				[chunkLine('{"client":"  Leo Bidi "}\n')],
				initialPumpState()
			);
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'client',
				client: { name: 'Leo Bidi' }
			});
			expect(result.state.clientSeen).toBe(true);
		});

		it('emits an invalid event with CLIENT_NAME_TOO_LONG for an over-long name', () => {
			const line = JSON.stringify({ client: 'a'.repeat(121) });
			const result = processUpstreamLines([chunkLine(`${line}\n`)], initialPumpState());
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'invalid',
				line,
				reason: 'CLIENT_NAME_TOO_LONG'
			});
			expect(result.state.clientSeen).toBe(false);
		});

		it('emits an invalid event with CLIENT_NAME_REQUIRED for an empty name', () => {
			const line = JSON.stringify({ client: '   ' });
			const result = processUpstreamLines([chunkLine(`${line}\n`)], initialPumpState());
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'invalid',
				line,
				reason: 'CLIENT_NAME_REQUIRED'
			});
		});

		it('ignores later client lines after the first valid one (first valid wins)', () => {
			const result = processUpstreamLines(
				[chunkLine('{"client":"Leo Bidi"}\n'), chunkLine('{"client":"Otro Cliente"}\n')],
				initialPumpState()
			);
			expect(clientPayloads(result.events)).toEqual([
				{ type: 'client', client: { name: 'Leo Bidi' } }
			]);
			expect(result.events).toHaveLength(1); // no invalid event for the later line
		});

		it('ignores later client lines split across batches (state carries clientSeen)', () => {
			let state = initialPumpState();
			const first = processUpstreamLines([chunkLine('{"client":"Leo Bidi"}\n')], state);
			state = first.state;
			const second = processUpstreamLines([chunkLine('{"client":"Otro"}\n')], state);
			expect(clientPayloads(first.events)).toHaveLength(1);
			expect(second.events).toEqual([]);
		});

		it('emits invalid for the first (empty) client line and accepts a later valid one', () => {
			const badLine = JSON.stringify({ client: '' });
			const result = processUpstreamLines(
				[chunkLine(`${badLine}\n`), chunkLine('{"client":"Leo Bidi"}\n')],
				initialPumpState()
			);
			expect(clientPayloads(result.events)).toEqual([
				{ type: 'client', client: { name: 'Leo Bidi' } }
			]);
			expect(framePayload(result.events[0])).toEqual({
				type: 'invalid',
				line: badLine,
				reason: 'CLIENT_NAME_REQUIRED'
			});
		});

		it('treats an object mixing client with item fields as an item line', () => {
			const line = JSON.stringify({
				client: 'Leo Bidi',
				description: 'Chorizos colorados',
				quantity: 45,
				unitPriceCents: 1500
			});
			const result = processUpstreamLines([chunkLine(`${line}\n`)], initialPumpState());
			expect(result.events).toHaveLength(1);
			expect(framePayload(result.events[0])).toEqual({
				type: 'item',
				item: { description: 'Chorizos colorados', quantity: 45, unitPriceCents: 1500 }
			});
			expect(result.state.clientSeen).toBe(false);
		});

		it('handles a realistic stream: client mention plus items plus [DONE]', () => {
			const itemLine = JSON.stringify({
				description: 'Chorizos colorados',
				quantity: 45,
				unitPriceCents: 1500
			});
			const result = processUpstreamLines(
				[
					chunkLine('{"client":"Leo Bidi"}\n'),
					chunkLine(`${itemLine}\n`),
					'data: [DONE]'
				],
				initialPumpState()
			);
			expect(result.events).toHaveLength(2);
			expect(clientPayloads(result.events)).toEqual([
				{ type: 'client', client: { name: 'Leo Bidi' } }
			]);
			expect(framePayload(result.events[1]).type).toBe('item');
		});
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

	it('flushes a trailing client line lacking the final newline', () => {
		let state = initialPumpState();
		state = processUpstreamLines([chunkLine('{"client":"Leo Bidi"}')], state).state;
		const flush = flushUpstreamBuffer(state);
		expect(flush.events).toHaveLength(1);
		expect(framePayload(flush.events[0])).toEqual({
			type: 'client',
			client: { name: 'Leo Bidi' }
		});
		expect(flush.state.clientSeen).toBe(true);
	});

	it('flushes a trailing email line lacking the final newline', () => {
		let state = initialPumpState();
		state = processUpstreamLines([chunkLine('{"email":"leo@selamastic.com"}')], state).state;
		const flush = flushUpstreamBuffer(state);
		expect(flush.events).toHaveLength(1);
		expect(framePayload(flush.events[0])).toEqual({
			type: 'email',
			email: 'leo@selamastic.com'
		});
		expect(flush.state.emailSeen).toBe(true);
	});

	it('flushes a trailing address line lacking the final newline', () => {
		let state = initialPumpState();
		state = processUpstreamLines([chunkLine('{"address":"av sarmiento 456"}')], state).state;
		const flush = flushUpstreamBuffer(state);
		expect(flush.events).toHaveLength(1);
		expect(framePayload(flush.events[0])).toEqual({
			type: 'address',
			address: 'av sarmiento 456'
		});
		expect(flush.state.addressSeen).toBe(true);
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

	it('system prompt instructs the at-most-once client line', () => {
		expect(SYSTEM_PROMPT).toContain('"client"');
		expect(SYSTEM_PROMPT).toContain('client name');
	});

	it('system prompt instructs the at-most-once email and address lines', () => {
		expect(SYSTEM_PROMPT).toContain('"email"');
		expect(SYSTEM_PROMPT).toContain('email address');
		expect(SYSTEM_PROMPT).toContain('"address"');
		expect(SYSTEM_PROMPT).toContain('no invention');
	});
});
