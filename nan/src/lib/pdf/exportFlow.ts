/**
 * Export flow state machine (pdf_contract.interaction + INV-06/08/09/10).
 *
 * idle → preparing → success | error
 *
 * - preparing is perceptible: a minimum-duration guard keeps the progress
 *   state on screen at least `minPreparingMs` (INV-06).
 * - Double-click protection: `run()` checks and sets the in-flight state
 *   SYNCHRONOUSLY on entry, so two clicks < 150ms apart produce exactly one
 *   download (INV-09).
 * - success auto-expires after `successExpiryMs` and is cleared immediately
 *   when the budget data changes (INV-08). The UI copy — not this module —
 *   confirms that the download STARTED, never that the OS saved the file.
 * - error is recoverable: the caller keeps its session data and can call
 *   `run()` again immediately with no cooldown (INV-10).
 *
 * Framework-agnostic: the Svelte component mirrors `phase` through `onPhase`
 * and provides `generate`. Timers are injectable for deterministic tests.
 */

export type ExportPhase = 'idle' | 'preparing' | 'success' | 'error';

export interface ExportFlowOptions {
	/** Performs the actual PDF generation + browser download. Must be idempotent per call. */
	generate: () => Promise<void>;
	/** Mirrors every phase transition to the UI. */
	onPhase?: (phase: ExportPhase) => void;
	/** INV-06: the preparing state never disappears faster than this. Default 450ms. */
	minPreparingMs?: number;
	/** INV-08: success confirmation auto-expires within 10s. Default 8500ms. */
	successExpiryMs?: number;
	/** Timer abstraction; defaults to setTimeout/clearTimeout. */
	schedule?: (callback: () => void, ms: number) => () => void;
}

export interface ExportFlow {
	/** Starts one export attempt; resolves when the flow settles. */
	run(): Promise<void>;
	/** INV-08: the budget data changed — a visible success is now obsolete. */
	notifyBudgetChanged(): void;
	/** Called when the owning component is destroyed. */
	dispose(): void;
	readonly phase: ExportPhase;
}

const DEFAULT_MIN_PREPARING_MS = 450;
const DEFAULT_SUCCESS_EXPIRY_MS = 8500;

export function createExportFlow(options: ExportFlowOptions): ExportFlow {
	const minPreparingMs = options.minPreparingMs ?? DEFAULT_MIN_PREPARING_MS;
	const successExpiryMs = options.successExpiryMs ?? DEFAULT_SUCCESS_EXPIRY_MS;
	const schedule =
		options.schedule ??
		((callback: () => void, ms: number) => {
			const id = setTimeout(callback, ms);
			return () => clearTimeout(id);
		});

	let phase: ExportPhase = 'idle';
	let successTimer: (() => void) | null = null;

	// Opaque read: after an await, TypeScript's control-flow analysis still
	// holds the stale narrowing of the local; a function boundary re-reads it.
	const getPhase = (): ExportPhase => phase;

	const setPhase = (next: ExportPhase): void => {
		phase = next;
		options.onPhase?.(next);
	};

	const cancelSuccessTimer = (): void => {
		if (successTimer !== null) {
			successTimer();
			successTimer = null;
		}
	};

	const delay = (ms: number): Promise<void> =>
		new Promise<void>((resolve) => {
			successTimer = schedule(resolve, ms);
		});

	const run = async (): Promise<void> => {
		// INV-09: synchronous in-flight check — no await happens before this
		// guard, so a second click landing while the first export is preparing
		// returns without ever calling generate again.
		if (phase === 'preparing') {
			return;
		}
		cancelSuccessTimer();
		const startedAt = Date.now();
		setPhase('preparing');
		try {
			await options.generate();
		} catch {
			setPhase('error');
			return;
		}
		const elapsed = Date.now() - startedAt;
		if (elapsed < minPreparingMs) {
			await delay(minPreparingMs - elapsed);
			if (getPhase() !== 'preparing') {
				return; // disposed or otherwise superseded while waiting
			}
		}
		setPhase('success');
		successTimer = schedule(() => {
			if (getPhase() === 'success') {
				setPhase('idle');
			}
		}, successExpiryMs);
	};

	return {
		run,
		notifyBudgetChanged: (): void => {
			if (phase === 'success') {
				cancelSuccessTimer();
				setPhase('idle');
			}
		},
		dispose: (): void => {
			cancelSuccessTimer();
		},
		get phase(): ExportPhase {
			return phase;
		}
	};
}
