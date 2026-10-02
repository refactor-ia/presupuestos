import { describe, expect, it } from 'vitest';
import { parseSseChunk } from './api';
import type { ParseEvent } from './api';

/** Build one downstream SSE frame exactly as $lib/server/parse emits it. */
function sseFrame(payload: unknown): string {
	return `data: ${JSON.stringify(payload)}\n\n`;
}

describe('parseSseChunk', () => {
	it('parses a single complete item event', () => {
		const item = { description: 'Diseño web', quantity: 3, unitPriceCents: 1055 };
		const { complete, rest } = parseSseChunk(sseFrame({ type: 'item', item }));
		expect(complete).toEqual<ParseEvent[]>([{ type: 'item', item }]);
		expect(rest).toBe('');
	});

	it('parses item, invalid and done events in one chunk', () => {
		const chunk =
			sseFrame({ type: 'item', item: { description: 'Logo', quantity: 1, unitPriceCents: 500 } }) +
			sseFrame({ type: 'invalid', line: 'garbage', reason: 'EXPORT_CLIENT_INVALID' }) +
			sseFrame({ type: 'done' });
		const { complete, rest } = parseSseChunk(chunk);
		expect(complete).toEqual<ParseEvent[]>([
			{ type: 'item', item: { description: 'Logo', quantity: 1, unitPriceCents: 500 } },
			{ type: 'invalid', line: 'garbage', reason: 'EXPORT_CLIENT_INVALID' },
			{ type: 'done' }
		]);
		expect(rest).toBe('');
	});

	it('buffers a frame split across chunks and completes it on the next chunk', () => {
		const full = sseFrame({
			type: 'item',
			item: { description: 'Impresión', quantity: 10, unitPriceCents: 100 }
		});
		const splitAt = full.indexOf('"quantity"');
		const first = full.slice(0, splitAt);
		const second = full.slice(splitAt);
		const firstPass = parseSseChunk(first);
		expect(firstPass.complete).toEqual([]);
		expect(firstPass.rest).toBe(first);
		const secondPass = parseSseChunk(firstPass.rest + second);
		expect(secondPass.complete).toEqual<ParseEvent[]>([
			{ type: 'item', item: { description: 'Impresión', quantity: 10, unitPriceCents: 100 } }
		]);
		expect(secondPass.rest).toBe('');
	});

	it('keeps a trailing partial frame in rest while emitting earlier frames', () => {
		const itemFrame = sseFrame({
			type: 'item',
			item: { description: 'Carpeta', quantity: 2, unitPriceCents: 250 }
		});
		const partial = 'data: {"type":"item","item":{"description":"Pend';
		const { complete, rest } = parseSseChunk(itemFrame + partial);
		expect(complete).toHaveLength(1);
		expect(rest).toBe(partial);
	});

	it('ignores frames with malformed JSON instead of throwing', () => {
		const good = sseFrame({ type: 'done' });
		const { complete, rest } = parseSseChunk('data: {not json}\n\n' + good);
		expect(complete).toEqual<ParseEvent[]>([{ type: 'done' }]);
		expect(rest).toBe('');
	});

	it('ignores unknown event types and non-data lines', () => {
		const chunk = 'event: ping\n\n' + sseFrame({ type: 'something-else' }) + sseFrame({ type: 'done' });
		const { complete, rest } = parseSseChunk(chunk);
		expect(complete).toEqual<ParseEvent[]>([{ type: 'done' }]);
		expect(rest).toBe('');
	});

	it('ignores item events whose payload is not a well-formed item', () => {
		const chunk =
			sseFrame({ type: 'item', item: { description: 42, quantity: 1, unitPriceCents: 1 } }) +
			sseFrame({ type: 'item', item: null }) +
			sseFrame({ type: 'done' });
		const { complete } = parseSseChunk(chunk);
		expect(complete).toEqual<ParseEvent[]>([{ type: 'done' }]);
	});

	it('parses a client event with its name payload', () => {
		const { complete, rest } = parseSseChunk(
			sseFrame({ type: 'client', client: { name: 'Leo Bidi' } })
		);
		expect(complete).toEqual<ParseEvent[]>([{ type: 'client', client: { name: 'Leo Bidi' } }]);
		expect(rest).toBe('');
	});

	it('completes a client frame split across two chunks', () => {
		const full = sseFrame({ type: 'client', client: { name: 'Leo Bidi' } });
		const splitAt = full.indexOf('"name"');
		const firstPass = parseSseChunk(full.slice(0, splitAt));
		expect(firstPass.complete).toEqual([]);
		expect(firstPass.rest).toBe(full.slice(0, splitAt));
		const secondPass = parseSseChunk(firstPass.rest + full.slice(splitAt));
		expect(secondPass.complete).toEqual<ParseEvent[]>([
			{ type: 'client', client: { name: 'Leo Bidi' } }
		]);
		expect(secondPass.rest).toBe('');
	});

	it('drops client events with a malformed payload instead of throwing', () => {
		const chunk =
			sseFrame({ type: 'client' }) +
			sseFrame({ type: 'client', client: 'Leo Bidi' }) +
			sseFrame({ type: 'client', client: { name: 42 } }) +
			sseFrame({ type: 'client', client: {} }) +
			sseFrame({ type: 'done' });
		const { complete } = parseSseChunk(chunk);
		expect(complete).toEqual<ParseEvent[]>([{ type: 'done' }]);
	});

	it('parses a full parse stream: client, item, invalid and done together', () => {
		const chunk =
			sseFrame({ type: 'client', client: { name: 'Leo Bidi' } }) +
			sseFrame({ type: 'item', item: { description: 'Chorizos', quantity: 45, unitPriceCents: 1500 } }) +
			sseFrame({ type: 'invalid', line: 'oops', reason: 'QUANTITY_INVALID' }) +
			sseFrame({ type: 'done' });
		const { complete } = parseSseChunk(chunk);
		expect(complete).toEqual<ParseEvent[]>([
			{ type: 'client', client: { name: 'Leo Bidi' } },
			{ type: 'item', item: { description: 'Chorizos', quantity: 45, unitPriceCents: 1500 } },
			{ type: 'invalid', line: 'oops', reason: 'QUANTITY_INVALID' },
			{ type: 'done' }
		]);
	});
});
