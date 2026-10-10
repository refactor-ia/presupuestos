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
	const micId = 'parse-mic';
	const PARSE_REQUEST_ERROR = 'No se pudo conectar con el analizador. Intentá de nuevo.';
	const PARSE_RESPONSE_ERROR = 'El análisis falló. Intentá de nuevo.';
	/** Same text the server sends on a mid-stream upstream failure. */
	const STREAM_INTERRUPTED = 'El análisis se interrumpió. Los ítems mostrados pueden estar incompletos.';
	/** Abort the fetch when no upstream frame arrives for this long. */
	const FRAME_TIMEOUT_MS = 30_000;

	// --- Voice dictation (STT) ---
	// Browser records one clip with MediaRecorder; the server proxies it to the
	// NaN API whisper endpoint (/api/transcribe) and the resulting text fills
	// the textarea, then the existing parse flow runs on it.
	type DictationState = 'idle' | 'recording' | 'transcribing';
	let dictation: DictationState = $state('idle');
	let recorder: MediaRecorder | null = null;
	let recordedChunks: BlobPart[] = [];
	const DICTATION_HINT =
		'El dictado necesita un navegador con micrófono y una conexión segura (HTTPS o localhost).';
	const DICTATION_REQUEST_ERROR = 'No se pudo transcribir el audio. Intentá de nuevo.';

	// Spoken confirmation: when the parse stream finishes cleanly the server
	// synthesizes a short phrase (Kokoro, Santa voice) and the client plays
	// it. Autoplay is covered by the click that started the parse.
	const SPEAK_PHRASE = '¡Bien, papá! Presupuesto listo.';
	let lastSpokenParse = 0;

	/** Plays the spoken confirmation; failures are silent by design — the
	 *  chiche never turns into an error for the user. */
	async function playConfirmation(): Promise<void> {
		const now = Date.now();
		// Guard against double completion of the same parse (done + stream end).
		if (now - lastSpokenParse < 500) return;
		lastSpokenParse = now;
		try {
			const response = await fetch('/api/speak', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: SPEAK_PHRASE })
			});
			if (!response.ok) return;
			const blob = await response.blob();
			const audio = new Audio(URL.createObjectURL(blob));
			audio.addEventListener('ended', () => URL.revokeObjectURL(audio.src));
			await audio.play();
		} catch {
			// Intentionally ignored: the confirmation is a delight, not a step.
		}
	}

	const canDictate = $derived(
		typeof navigator !== 'undefined' &&
			navigator.mediaDevices !== undefined &&
			typeof MediaRecorder !== 'undefined'
	);
	const dictating = $derived(dictation !== 'idle');

	/** One browser recording MIME type, in preference order. */
	function pickRecorderMimeType(): string | undefined {
		const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
		return candidates.find((type) => MediaRecorder.isTypeSupported(type));
	}

	function toggleDictation(): void {
		if (dictation === 'recording') {
			recorder?.stop();
			return;
		}
		if (dictating || busy) return;
		navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then((stream) => {
				recordedChunks = [];
				const mimeType = pickRecorderMimeType();
				recorder = mimeType !== undefined ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
				recorder.addEventListener('dataavailable', (event) => {
					if (event.data.size > 0) recordedChunks.push(event.data);
				});
				recorder.addEventListener('stop', () => {
					for (const track of stream.getTracks()) track.stop();
					void submitRecording(new Blob(recordedChunks, { type: recorder?.mimeType ?? 'audio/webm' }));
				});
				recorder.start();
				dictation = 'recording';
			})
			.catch(() => {
				errorText = DICTATION_HINT;
			});
	}

	/** Sends the recorded clip to /api/transcribe and fills the textarea with
	 *  the transcription, then runs the existing parse flow on it. */
	async function submitRecording(blob: Blob): Promise<void> {
		dictation = 'transcribing';
		errorText = null;
		try {
			const form = new FormData();
			form.set('audio', new File([blob], 'dictation.webm', { type: blob.type }));
			const response = await fetch('/api/transcribe', { method: 'POST', body: form });
			if (!response.ok) {
				errorText = DICTATION_REQUEST_ERROR;
				return;
			}
			const payload = (await response.json()) as { text?: unknown };
			const transcribed = typeof payload.text === 'string' ? payload.text.trim() : '';
			if (transcribed === '') {
				errorText = DICTATION_REQUEST_ERROR;
				return;
			}
			text = transcribed.slice(0, TEXT_MAX);
			await runParse();
		} catch {
			errorText = DICTATION_REQUEST_ERROR;
		} finally {
			dictation = 'idle';
		}
	}

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
		await runParse();
	}

	async function runParse(): Promise<void> {
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
						void playConfirmation();
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
		<div class="flex items-end gap-2">
			<textarea
				id="parse-text"
				bind:value={text}
				class="field-input h-auto! min-h-24 resize-y flex-1 py-2"
				maxlength={TEXT_MAX}
				placeholder="Ej.: Necesito 3 logos a $ 10,55 cada uno y una impresión de 10 afiches a $ 1"
				disabled={busy}
			></textarea>
			{#if canDictate}
				<button
					type="button"
					id={micId}
					class="btn btn-secondary shrink-0 self-start"
					onclick={toggleDictation}
					disabled={busy || dictation === 'transcribing'}
					aria-pressed={dictation === 'recording'}
					aria-label={
						dictation === 'recording'
							? 'Detener grabación'
							: dictation === 'transcribing'
								? 'Transcribiendo audio'
								: 'Dictar por voz'
						}
					aria-describedby={statusId}
				>
					{#if dictation === 'recording'}
						<svg xmlns="http://www.w3.org/2000/svg" class="size-4 animate-pulse text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<rect x="6" y="6" width="12" height="12" rx="2" />
						</svg>
						Detener
					{:else if dictation === 'transcribing'}
						<svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
						</svg>
						Transcribiendo…
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
							<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
							<line x1="12" y1="19" x2="12" y2="22" />
						</svg>
						Dictar
					{/if}
				</button>
			{/if}
		</div>
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
