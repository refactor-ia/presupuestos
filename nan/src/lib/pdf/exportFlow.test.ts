import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExportFlow, type ExportPhase } from './exportFlow';

describe('export flow state machine', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
		let resolve!: () => void;
		let reject!: (e: unknown) => void;
		const promise = new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, resolve, reject };
	}

	it('transitions idle → preparing → success', async () => {
		const gate = deferred();
		const generate = vi.fn(() => gate.promise);
		const phases: ExportPhase[] = [];
		const flow = createExportFlow({ generate, onPhase: (p) => phases.push(p), minPreparingMs: 300 });

		const done = flow.run();
		expect(flow.phase).toBe('preparing'); // set synchronously on entry
		gate.resolve();
		await vi.advanceTimersByTimeAsync(299);
		expect(flow.phase).toBe('preparing'); // INV-06: visible progress ≥ 300ms
		await vi.advanceTimersByTimeAsync(1);
		expect(flow.phase).toBe('success');
		await done;
		expect(generate).toHaveBeenCalledTimes(1);
		expect(phases).toEqual(['preparing', 'success']);
	});

	it('success auto-expires within 10s (INV-08)', async () => {
		const flow = createExportFlow({ generate: async () => {} });
		const done = flow.run();
		await vi.advanceTimersByTimeAsync(500);
		expect(flow.phase).toBe('success');
		await vi.advanceTimersByTimeAsync(8500);
		expect(flow.phase).toBe('idle');
		await done;
	});

	it('success does not expire before the configured horizon (default 8500ms)', async () => {
		const flow = createExportFlow({ generate: async () => {} });
		const done = flow.run();
		await vi.advanceTimersByTimeAsync(500);
		await vi.advanceTimersByTimeAsync(8449); // expiry scheduled at 450 + 8500 = 8950
		expect(flow.phase).toBe('success');
		await vi.advanceTimersByTimeAsync(1); // t = 8950
		expect(flow.phase).toBe('idle');
		await done;
	});

	it('budget data change clears the success message immediately (INV-08)', async () => {
		const flow = createExportFlow({ generate: async () => {} });
		const done = flow.run();
		await vi.advanceTimersByTimeAsync(500);
		expect(flow.phase).toBe('success');
		flow.notifyBudgetChanged();
		expect(flow.phase).toBe('idle');
		// the expiry timer must be cancelled: advancing time stays idle, no crash
		await vi.advanceTimersByTimeAsync(60_000);
		expect(flow.phase).toBe('idle');
		await done;
	});

	it('ignores a second run while preparing → exactly one download (INV-09)', async () => {
		const gate = deferred();
		const generate = vi.fn(() => gate.promise);
		const flow = createExportFlow({ generate });

		const first = flow.run();
		flow.run(); // < 150ms later: must be a no-op
		gate.resolve();
		await vi.advanceTimersByTimeAsync(500);

		await first;
		expect(generate).toHaveBeenCalledTimes(1);
		expect(flow.phase).toBe('success');
	});

	it('min-duration guard waits for the remaining time (fast generate)', async () => {
		const flow = createExportFlow({ generate: async () => {}, minPreparingMs: 300 });
		const done = flow.run();
		// generate resolves at t=0; preparing must still hold until t=300
		await vi.advanceTimersByTimeAsync(250);
		expect(flow.phase).toBe('preparing');
		await vi.advanceTimersByTimeAsync(50);
		expect(flow.phase).toBe('success');
		await done;
	});

	it('does not pad a slow generate (min duration is not additive)', async () => {
		const flow = createExportFlow({ generate: async () => {}, minPreparingMs: 300 });
		const done = flow.run();
		await vi.advanceTimersByTimeAsync(400);
		expect(flow.phase).toBe('success'); // generate took 400ms; no extra wait
		await done;
	});

	it('error keeps the session recoverable and retry works (INV-10)', async () => {
		const failing = vi.fn(async () => {
			throw new Error('boom');
		});
		const working = vi.fn(async () => {});
		const generate = vi.fn(() => (generate.mock.calls.length === 1 ? failing() : working()));
		const flow = createExportFlow({ generate });

		const first = flow.run();
		await vi.advanceTimersByTimeAsync(0);
		await first;
		expect(flow.phase).toBe('error');
		expect(working).not.toHaveBeenCalled();

		// immediate retry: no cooldown, no data reset needed by the flow
		const second = flow.run();
		await vi.advanceTimersByTimeAsync(500);
		await second;
		expect(generate).toHaveBeenCalledTimes(2);
		expect(flow.phase).toBe('success');
	});

	it('error phase has no pending success timer', async () => {
		const generate = vi.fn(async () => {
			throw new Error('boom');
		});
		const flow = createExportFlow({ generate });
		const first = flow.run();
		await vi.advanceTimersByTimeAsync(10_000);
		await first;
		expect(flow.phase).toBe('error');
	});

	it('run during success restarts the export', async () => {
		const generate = vi.fn(async () => {});
		const flow = createExportFlow({ generate });
		const first = flow.run();
		await vi.advanceTimersByTimeAsync(500);
		expect(flow.phase).toBe('success');
		const second = flow.run();
		expect(flow.phase).toBe('preparing');
		await vi.advanceTimersByTimeAsync(500);
		await second;
		expect(generate).toHaveBeenCalledTimes(2);
		await first;
	});

	it('notifyBudgetChanged during preparing does not abort the export', async () => {
		const gate = deferred();
		const generate = vi.fn(() => gate.promise);
		const flow = createExportFlow({ generate });
		const done = flow.run();
		flow.notifyBudgetChanged();
		expect(flow.phase).toBe('preparing');
		gate.resolve();
		await vi.advanceTimersByTimeAsync(500);
		await done;
		expect(flow.phase).toBe('success');
	});

	it('dispose cancels the success expiry', async () => {
		const flow = createExportFlow({ generate: async () => {} });
		const done = flow.run();
		await vi.advanceTimersByTimeAsync(500);
		flow.dispose();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(flow.phase).toBe('success'); // timer cancelled; component is gone anyway
		await done;
	});
});
