<script lang="ts">
	import { parseSseChunk } from '$lib/client/api';
	import type { BudgetItem } from '$lib/domain/validate';
	import { motionDuration } from '$lib/motion';
	import { fly } from 'svelte/transition';

	interface Props {
		/** Called for every validated item as it streams in (live table update). */
		onitem: (item: BudgetItem) => void;
		/** Called at most once per stream when the model detects a client mention. */
		onclient?: (name: string) => void;
		/** Called at most once per stream when the model detects an email mention. */
		onemail?: (email: string) => void;
		/** Called at most once per stream when the model detects an address mention. */
		onaddress?: (address: string) => void;
	}

	let { onitem, onclient, onemail, onaddress }: Props = $props();

	// Same cap the server applies to the parse text (see $lib/server/parse).
	const TEXT_MAX = 2000;

	let text = $state('');
	let busy = $state(false);
	let done = $state(false);
	let itemCount = $state(0);
	let invalidCount = $state(0);
	let errorText = $state<string | null>(null);

	const statusId = 'parse-status';
	const PARSE_REQUEST_ERROR = 'No se pudo conectar con el analizador. Intentá de nuevo.';
	const PARSE_RESPONSE_ERROR = 'El análisis falló. Intentá de nuevo.';
	/** Same text the server sends on a mid-stream upstream failure. */
	const STREAM_INTERRUPTED = 'El análisis se interrumpió. Los ítems mostrados pueden estar incompletos.';
	/** Abort the fetch when no upstream frame arrives for this long. */
	const FRAME_TIMEOUT_MS = 30_000;

	// Live status line: parsing… → N ítems → done (+ invalid count). Reserved
	// min-height keeps the composition stable across states.
	const statusText = $derived.by(() => {
		if (busy) {
			return `Analizando… ${itemCount} ${itemCount === 1 ? 'ítem' : 'ítems'}`;
		}
		if (!done || errorText !== null) return null;
		const items = `${itemCount} ${itemCount === 1 ? 'ítem' : 'ítems'}`;
		return invalidCount > 0
			? `Listo: ${items}. ${invalidCount} ${invalidCount === 1 ? 'línea ignorada' : 'líneas ignoradas'}.`
			: `Listo: ${items}.`;
	});

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const trimmed = text.trim();
		if (busy || trimmed === '') return;
		busy = true;
		done = false;
		itemCount = 0;
		invalidCount = 0;
		errorText = null;
		let watchdogFired = false;
		let watchdog: ReturnType<typeof setTimeout> | undefined;
		try {
			const controller = new AbortController();
			// Inactivity watchdog, armed across the WHOLE request (fetch +
			// stream): no response headers or no downstream bytes for
			// FRAME_TIMEOUT_MS abort the fetch and surface the interruption
			// message. It must be armed before the fetch too — a slow upstream
			// can hang before the response even starts (time-to-first-token is
			// bimodal, 1.2s to 100s+), and the read loop below is only reached
			// once the response has arrived.
			const restartWatchdog = (): void => {
				clearTimeout(watchdog);
				watchdog = setTimeout(() => {
					watchdogFired = true;
					controller.abort();
				}, FRAME_TIMEOUT_MS);
			};
			restartWatchdog();
			const response = await fetch('/api/parse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: trimmed }),
				signal: controller.signal
			});
			if (!response.ok || response.body === null) {
				errorText = PARSE_RESPONSE_ERROR;
				return;
			}
			// Read the SSE stream incrementally: every complete frame yields an
			// event; the trailing partial frame stays buffered for the next chunk.
			// Each received chunk re-arms the watchdog, so it only fires when no
			// downstream bytes arrive for FRAME_TIMEOUT_MS (upstream hang guard).
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			for (;;) {
				// When the watchdog aborts the fetch, the pending read (and every
				// later one) rejects with an abort error, which the catch below
				// turns into the interruption message — no Promise.race needed.
				const { value, done: streamDone } = await reader.read();
				if (streamDone) break;
				restartWatchdog();
				buffer += decoder.decode(value, { stream: true });
				const parsed = parseSseChunk(buffer);
				buffer = parsed.rest;
				let stop = false;
				for (const parsedEvent of parsed.complete) {
					if (parsedEvent.type === 'item') {
						itemCount += 1;
						onitem(parsedEvent.item);
					} else if (parsedEvent.type === 'client') {
						onclient?.(parsedEvent.client.name);
					} else if (parsedEvent.type === 'email') {
						onemail?.(parsedEvent.email);
					} else if (parsedEvent.type === 'address') {
						onaddress?.(parsedEvent.address);
					} else if (parsedEvent.type === 'invalid') {
						invalidCount += 1; // counted, never fatal
					} else if (parsedEvent.type === 'error') {
						// Upstream failure reported by the server: show it and stop
						// reading. done stays false, so no "Listo" is ever shown.
						errorText = parsedEvent.message;
						stop = true;
					} else if (parsedEvent.type === 'done') {
						done = true;
					}
				}
				if (stop) {
					await reader.cancel().catch(() => {});
					break;
				}
			}
		} catch {
			// A watchdog abort (hung upstream before the response or mid-stream)
			// surfaces as the interruption message, never the generic failure.
			errorText = watchdogFired ? STREAM_INTERRUPTED : PARSE_REQUEST_ERROR;
		} finally {
			clearTimeout(watchdog);
			busy = false;
		}
	}

	/** Clears the status line and stream counters without touching the drafted
	 *  text. The page calls this after a saved budget load replaces the form
	 *  content, so a stale "Listo: N ítems." never describes the new state. */
	export function resetStatus(): void {
		busy = false;
		done = false;
		itemCount = 0;
		invalidCount = 0;
		errorText = null;
	}
</script>

<form class="space-y-4" onsubmit={handleSubmit}>
	<div class="flex flex-col">
		<label class="field-label" for="parse-text">Descripción en lenguaje natural</label>
		<textarea
			id="parse-text"
			bind:value={text}
			class="field-input h-auto! min-h-24 resize-y py-2"
			maxlength={TEXT_MAX}
			placeholder="Ej.: Necesito 3 logos a $ 10,55 cada uno y una impresión de 10 afiches a $ 1"
			disabled={busy}
		></textarea>
	</div>
	<!-- Reserved slot: status / error swap in place without shifting the button. -->
	<div class="min-h-5">
		{#if errorText !== null}
			<p
				class="text-sm text-red-600 dark:text-red-400"
				id={statusId}
				role="alert"
				in:fly={{ y: 4, duration: motionDuration(200) }}
			>
				{errorText}
			</p>
		{:else}
			<p class="field-hint" id={statusId} aria-live="polite">{statusText ?? ''}</p>
		{/if}
	</div>
	<button
		type="submit"
		class="btn btn-primary w-full sm:w-auto"
		disabled={busy || text.trim() === ''}
		aria-busy={busy}
		aria-describedby={statusId}
	>
		{#if busy}
			<svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
				<path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
			</svg>
			Analizando…
		{:else}
			Analizar texto
		{/if}
	</button>
</form>
