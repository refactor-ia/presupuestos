<script lang="ts">
	import { parseSseChunk } from '$lib/client/api';
	import type { BudgetItem } from '$lib/domain/validate';
	import { motionDuration } from '$lib/motion';
	import { fly } from 'svelte/transition';

	interface Props {
		/** Called for every validated item as it streams in (live table update). */
		onitem: (item: BudgetItem) => void;
	}

	let { onitem }: Props = $props();

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
		try {
			const response = await fetch('/api/parse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: trimmed })
			});
			if (!response.ok || response.body === null) {
				errorText = PARSE_RESPONSE_ERROR;
				return;
			}
			// Read the SSE stream incrementally: every complete frame yields an
			// event; the trailing partial frame stays buffered for the next chunk.
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			for (;;) {
				const { value, done: streamDone } = await reader.read();
				if (streamDone) break;
				buffer += decoder.decode(value, { stream: true });
				const parsed = parseSseChunk(buffer);
				buffer = parsed.rest;
				for (const parsedEvent of parsed.complete) {
					if (parsedEvent.type === 'item') {
						itemCount += 1;
						onitem(parsedEvent.item);
					} else if (parsedEvent.type === 'invalid') {
						invalidCount += 1; // counted, never fatal
					} else if (parsedEvent.type === 'done') {
						done = true;
					}
				}
			}
			done = true;
		} catch {
			errorText = PARSE_REQUEST_ERROR;
		} finally {
			busy = false;
		}
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
			<p class="field-error" id={statusId} aria-live="polite">{statusText ?? ''}</p>
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
