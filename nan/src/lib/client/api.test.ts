import { describe, expect, it, vi } from 'vitest';
import { ApiError, parseSseChunk, updateBudget } from './api';
import type { ParseEvent } from './api';

/** Build one downstream SSE frame exactly as $lib/server/parse emits it. */
function sseFrame(payload: unknown): string {
	return `data: ${JSON.stringify(payload)}\n\n`;
}

describe('updateBudget', () => {
	const payload = {
		number: 'PRES-000001',
		clientName: 'Ada Lovelace',
		email: 'ada@example.com',
		address: 'Calle Falsa 123',
		rut: '12345678-9',
		items: [{ description: 'Consultoría', quantity: 2, unitPriceCents: 1500 }]
	};

	it('PUTs the payload to /api/budgets/[id] and resolves with the stored budget', async () => {
		const stored = { id: 7, ...payload, createdAt: 't1', updatedAt: 't2' };
		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify(stored), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		try {
			await expect(updateBudget(7, payload)).resolves.toEqual(stored);
		} finally {
			vi.unstubAllGlobals();
		}
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/budgets/7',
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			}
		);
	});

	it('throws an ApiError with the server code/message/status on non-OK responses', async () => {
		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({ code: 'PRES_NUMBER_DUPLICATE', message: 'Duplicado' }), {
				status: 422,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		try {
			const error = await updateBudget(7, payload).then(
				() => null,
				(e: unknown) => e
			);
			expect(error).toBeInstanceOf(ApiError);
			expect((error as ApiError).code).toBe('PRES_NUMBER_DUPLICATE');
			expect((error as ApiError).message).toBe('Duplicado');
			expect((error as ApiError).status).toBe(422);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

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
