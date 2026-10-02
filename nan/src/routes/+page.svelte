<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import ItemsTable from '$lib/components/ItemsTable.svelte';
	import Totals from '$lib/components/Totals.svelte';
	import ParsePanel from '$lib/components/ParsePanel.svelte';
	import BudgetPicker from '$lib/components/BudgetPicker.svelte';
	import { ApiError, saveBudget, type Budget } from '$lib/client/api';
	import { formatLongDate } from '$lib/date';
	import { motionDuration } from '$lib/motion';
	import { exportBudgetPdf } from '$lib/pdf/generate';
	import { pdfFilenameFor } from '$lib/pdf/plan';
	import { createExportFlow, type ExportPhase } from '$lib/pdf/exportFlow';
	import {
		computeIvaCents,
		itemSubtotalCents,
		parsePriceToCents,
		sumCents,
		totalCents
	} from '$lib/domain/money';
	import {
		parseQuantity,
		type BudgetItem,
		validateClientAddress,
		validateClientEmail,
		validateClientName,
		validateClientRut,
		validateItemDescription,
		validateItemLimit,
		validateItemQuantity,
		validateItemUnitPrice
	} from '$lib/domain/validate';
	import { messageFor } from '$lib/domain/messages';
	import { createPresId } from '$lib/domain/session';

	// RQ-01: the session number is generated client-side only, after mount —
	// never during prerender, so the user never sees an id that later changes.
	// The session date is captured in the same tick: UI header and PDF export
	// format the SAME Date through the shared date module (one export, one date).
	let presId = $state<string | null>(null);
	let sessionDate = $state<Date | null>(null);
	onMount(() => {
		presId = createPresId();
		sessionDate = new Date();
	});
	const issueDateText = $derived(sessionDate === null ? '' : formatLongDate(sessionDate));

	// --- Client data (RQ-02) -----------------------------------------------

	let clientName = $state('');
	let clientEmail = $state('');
	let clientAddress = $state('');
	let clientRut = $state('');

	// Errors appear only after the user leaves the field (or attempts the action)
	// — never while exploring an empty form.
	let nameTouched = $state(false);
	let emailTouched = $state(false);
	let addressTouched = $state(false);
	let rutTouched = $state(false);

	const nameError = $derived(nameTouched ? messageFor(validateClientName(clientName)) : null);
	const emailError = $derived(emailTouched ? messageFor(validateClientEmail(clientEmail)) : null);
	const addressError = $derived(
		addressTouched ? messageFor(validateClientAddress(clientAddress)) : null
	);
	const rutError = $derived(rutTouched ? messageFor(validateClientRut(clientRut)) : null);

	// Real validity (independent of touched) drives the export gate (SC-02/SC-03).
	const clientInvalid = $derived(
		validateClientName(clientName) !== null ||
			validateClientEmail(clientEmail) !== null ||
			validateClientAddress(clientAddress) !== null ||
			validateClientRut(clientRut) !== null
	);

	// --- Items (RQ-03) ------------------------------------------------------

	let items = $state<BudgetItem[]>([]);

	// Row identity for the animated table (feedback matrix): a key is minted
	// when an item is added and stays stable until removal, letting Svelte run
	// the row enter/exit/reflow transitions in ItemsTable. Both arrays are only
	// ever mutated together in the two handlers below.
	let rowKeySeq = 0;
	let rowKeys = $state<number[]>([]);

	let itemDescription = $state('');
	let itemQuantity = $state('');
	let itemUnitPrice = $state('');
	let itemAttempted = $state(false);
	let descriptionTouched = $state(false);
	let quantityTouched = $state(false);
	let priceTouched = $state(false);
	let descriptionInput = $state<HTMLInputElement>();

	// Live counter ceiling: mirrors validateItemDescription's 240-char limit;
	// submit-time validation stays the single enforcement point.
	const DESCRIPTION_MAX = 240;

	const descriptionError = $derived(
		descriptionTouched || itemAttempted ? messageFor(validateItemDescription(itemDescription)) : null
	);
	const quantityError = $derived(
		quantityTouched || itemAttempted ? messageFor(validateItemQuantity(itemQuantity)) : null
	);
	const priceError = $derived(
		priceTouched || itemAttempted ? messageFor(validateItemUnitPrice(itemUnitPrice)) : null
	);
	const itemLimitMessage = $derived(messageFor(validateItemLimit(items.length)));

	function handleAddItem(): void {
		itemAttempted = true;
		if (validateItemLimit(items.length) !== null) return;
		const descriptionCode = validateItemDescription(itemDescription);
		const quantityCode = validateItemQuantity(itemQuantity);
		const priceCode = validateItemUnitPrice(itemUnitPrice);
		if (descriptionCode !== null || quantityCode !== null || priceCode !== null) return;
		resetSaveFeedback();
		items.push({
			description: itemDescription.trim(),
			// Grammar-validated above; these parses cannot fail here.
			quantity: parseQuantity(itemQuantity)!,
			unitPriceCents: parsePriceToCents(itemUnitPrice.trim())!
		});
		rowKeys.push(++rowKeySeq);
		itemDescription = '';
		itemQuantity = '';
		itemUnitPrice = '';
		itemAttempted = false;
		descriptionTouched = false;
		quantityTouched = false;
		priceTouched = false;
		descriptionInput?.focus(); // keep a usable field focused after the row enters (INV-07)
	}

	function handleRemoveItem(index: number): void {
		resetSaveFeedback();
		items.splice(index, 1);
		rowKeys.splice(index, 1);
		descriptionInput?.focus(); // the removed button is gone; land focus on a usable field
	}

	// --- Parse stream (natural language → items) and saved budgets ----------

	// INV-08 analog for saving: any budget change makes a visible save
	// confirmation obsolete, so it is cleared on every mutation. A save that is
	// currently in flight keeps its state (its outcome lands afterwards).
	function resetSaveFeedback(): void {
		if (savePhase !== 'busy') {
			savePhase = 'idle';
			saveErrorText = null;
		}
	}

	/** Appends one streamed item to the table. The MAX_ITEMS cap is respected:
	 *  once reached, further streamed items are dropped and the existing
	 *  item-limit reserved slot shows ITEM_LIMIT_REACHED (messages.ts). */
	function handleParsedItem(item: BudgetItem): void {
		resetSaveFeedback();
		if (validateItemLimit(items.length) !== null) return;
		items.push({ ...item });
		rowKeys.push(++rowKeySeq);
	}

	/** Replaces the form state with a saved budget. The session-generated
	 *  number stays the session's own (RQ-01): the loaded budget's number is
	 *  deliberately NOT copied. The PDF flow keeps working untouched. */
	function handleLoadBudget(budget: Budget): void {
		clientName = budget.clientName;
		clientEmail = budget.email;
		clientAddress = budget.address;
		clientRut = budget.rut;
		items = budget.items.map((item) => ({ ...item }));
		rowKeys = items.map(() => ++rowKeySeq);
		// Values just loaded are valid; clear blur-touched errors.
		nameTouched = false;
		emailTouched = false;
		addressTouched = false;
		rutTouched = false;
		resetSaveFeedback();
	}

	let picker = $state<BudgetPicker | null>(null);
	let savePhase = $state<'idle' | 'busy' | 'success' | 'error'>('idle');
	let saveErrorText = $state<string | null>(null);
	const SAVE_SUCCESS_TEXT = 'Presupuesto guardado.';
	const SAVE_ERROR_FALLBACK = 'No se pudo guardar el presupuesto. Probá de nuevo.';

	const saveBusy = $derived(savePhase === 'busy');
	const canSave = $derived(presId !== null && items.length > 0 && !clientInvalid);

	async function handleSave(): Promise<void> {
		if (presId === null || savePhase === 'busy') return;
		savePhase = 'busy';
		saveErrorText = null;
		try {
			await saveBudget({
				number: presId,
				clientName: clientName.trim(),
				email: clientEmail.trim(),
				address: clientAddress.trim(),
				rut: clientRut.trim(),
				items: items.map((item) => ({ ...item }))
			});
			savePhase = 'success';
			picker?.refresh(); // the saved budget appears in the list immediately
		} catch (error) {
			// The API surfaces the Spanish { code, message } contract: render its
			// message directly, falling back to a generic text when unreachable.
			saveErrorText =
				error instanceof ApiError && error.message !== '' ? error.message : SAVE_ERROR_FALLBACK;
			savePhase = 'error';
		}
	}

	// Display rows for the table: items plus their stable transition key.
	const rows = $derived(items.map((item, i) => ({ ...item, key: rowKeys[i] ?? -1 })));

	// --- Totals (RQ-04): one source of truth, integer cents -----------------

	const subtotal = $derived(
		sumCents(items.map((item) => itemSubtotalCents(item.quantity, item.unitPriceCents)))
	);
	const iva = $derived(computeIvaCents(subtotal));
	const total = $derived(totalCents(subtotal, iva));

	// --- Export gate (SC-02/SC-03/SC-09); the PDF itself is M-03 -------------

	const canExport = $derived(items.length > 0 && !clientInvalid);
	const exportHint = $derived(
		items.length === 0
			? messageFor('NO_ITEMS')
			: clientInvalid
				? messageFor('EXPORT_CLIENT_INVALID')
				: null
	);
	const exportHintId = 'export-hint';

	// --- Export (RQ-05, pdf_contract.interaction, INV-06/08/09/10) ----------

	let exportPhase = $state<ExportPhase>('idle');

	// INV-06 on the real click path: exportFlow bounds the success transition
	// (minPreparingMs), but a fast failure would flip preparing→error almost
	// instantly. The UI mirror therefore holds the preparing state until it has
	// been visible for EXPORT_MIN_VISIBLE_MS before showing success or error;
	// exportFlow semantics and timers are untouched. Clearing the pending hold
	// on every transition keeps the newest flow phase authoritative (e.g. a
	// budget change arriving mid-hold must never surface a stale success).
	const EXPORT_MIN_VISIBLE_MS = 300;
	let exportRunSeq = 0;
	let preparingStartedAt = 0;
	let phaseHoldTimer: ReturnType<typeof setTimeout> | undefined;

	const mirrorPhase = (phase: ExportPhase): void => {
		clearTimeout(phaseHoldTimer);
		if (phase === 'preparing') {
			exportRunSeq += 1;
			preparingStartedAt = Date.now();
			exportPhase = phase;
			return;
		}
		const run = exportRunSeq;
		const remaining = EXPORT_MIN_VISIBLE_MS - (Date.now() - preparingStartedAt);
		if (remaining <= 0) {
			exportPhase = phase;
			return;
		}
		phaseHoldTimer = setTimeout(() => {
			if (run === exportRunSeq) exportPhase = phase;
		}, remaining);
	};

	const exportFlow = createExportFlow({
		onPhase: mirrorPhase,
		generate: async () => {
			if (presId === null || sessionDate === null) return;
			// Double rAF before the (synchronous) jsPDF work: a macrotask yield
			// does NOT guarantee a paint, so on a slow frame the spinner could
			// first paint only after the generator blocked the main thread,
			// shrinking the visible preparing window below INV-06. Two rAFs make
			// sure the preparing state has painted at least one frame first; the
			// timeout fallback covers a backgrounded tab, where rAF is suspended.
			await new Promise<void>((resolve) => {
				let settled = false;
				const done = () => {
					if (!settled) {
						settled = true;
						resolve();
					}
				};
				requestAnimationFrame(() => requestAnimationFrame(done));
				setTimeout(done, 50);
			});
			exportBudgetPdf({
				presId,
				issueDateText: formatLongDate(sessionDate),
				client: {
					name: clientName,
					email: clientEmail,
					address: clientAddress,
					rut: clientRut
				},
				items: items.map((item) => ({ ...item })),
				// Same derived cents the UI renders — the single money source.
				totals: { subtotalCents: subtotal, ivaCents: iva, totalCents: total }
			});
		}
	});

	function handleExport(): void {
		if (!canExport) return;
		// The flow's in-flight guard is checked synchronously inside run():
		// two clicks < 150ms apart produce exactly one download (INV-09).
		void exportFlow.run();
	}

	// INV-08: any budget change makes a visible success confirmation obsolete.
	$effect(() => {
		void items.length;
		void subtotal;
		void clientName;
		void clientEmail;
		void clientAddress;
		void clientRut;
		exportFlow.notifyBudgetChanged();
	});

	onDestroy(() => {
		clearTimeout(phaseHoldTimer);
		exportFlow.dispose();
	});

	const exportBusy = $derived(exportPhase === 'preparing');
	const exportSuccessText = $derived(
		exportPhase === 'success' && presId !== null
			? `Descarga iniciada: ${pdfFilenameFor(presId)}`
			: null
	);
	const EXPORT_ERROR_TEXT =
		'No se pudo generar el PDF. Tus datos siguen intactos; probá de nuevo.';
</script>

<svelte:head>
	<title>Presupuestos</title>
	<meta name="description" content="Armá un presupuesto de cliente y revisá sus importes." />
</svelte:head>

<main class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
	<header class="mb-6 flex items-start justify-between gap-4">
		<div>
			<p class="text-xs font-semibold tracking-widest text-slate-600 uppercase dark:text-zinc-400">
				Presupuesto
			</p>
			<p class="mt-1 text-2xl font-bold text-slate-900 tabular-nums dark:text-zinc-50" aria-live="polite">
				{#if presId === null}
					PRES-······
				{:else}
					{#key presId}
						<!-- F-02: the placeholder→real id swap materializes with a short
						     fade/scale on first render so hydration reads as
						     intentional; collapsed by the reduced-motion guard. -->
						<span class="inline-block materialize">{presId}</span>
					{/key}
				{/if}
			</p>
			{#if issueDateText}
				<!-- Same shared date module the PDF uses: one export, one visible date. -->
				<p class="mt-1 text-sm text-slate-600 dark:text-zinc-400">{issueDateText}</p>
			{/if}
		</div>
		<ThemeToggle />
	</header>

	<div class="grid items-start gap-6 lg:grid-cols-2">
		<section class="card min-w-0" aria-labelledby="client-heading">
			<h2 id="client-heading" class="card-title">Cliente</h2>
			<div class="space-y-4">
				<TextField
					id="client-name"
					label="Nombre"
					bind:value={clientName}
					error={nameError}
					required
					onblur={() => (nameTouched = true)}
				/>
				<div class="grid gap-4 sm:grid-cols-2">
					<TextField
						id="client-email"
						label="Email"
						bind:value={clientEmail}
						error={emailError}
						optional
						onblur={() => (emailTouched = true)}
					/>
					<TextField
						id="client-rut"
						label="RUT"
						bind:value={clientRut}
						error={rutError}
						optional
						onblur={() => (rutTouched = true)}
					/>
				</div>
				<TextField
					id="client-address"
					label="Dirección"
					bind:value={clientAddress}
					error={addressError}
					optional
					onblur={() => (addressTouched = true)}
				/>
			</div>

			<h2 class="card-title mt-8">Agregar ítem</h2>
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();
					handleAddItem();
				}}
			>
				<TextField
					id="item-description"
					label="Descripción"
					bind:value={itemDescription}
					error={descriptionError}
					placeholder="Ej.: Diseño web"
					counter={{ current: itemDescription.length, max: DESCRIPTION_MAX }}
					onblur={() => (descriptionTouched = true)}
					bind:inputEl={descriptionInput}
				/>
				<div class="grid gap-4 sm:grid-cols-2">
					<TextField
						id="item-quantity"
						label="Cantidad"
						bind:value={itemQuantity}
						error={quantityError}
						inputmode="numeric"
						placeholder="Ej.: 3"
						onblur={() => (quantityTouched = true)}
					/>
					<TextField
						id="item-price"
						label="Precio unitario"
						bind:value={itemUnitPrice}
						error={priceError}
						inputmode="decimal"
						placeholder="Ej.: 10,55"
						onblur={() => (priceTouched = true)}
					/>
				</div>
				<!-- Reserved slot for the item limit message: never shifts the button. -->
				<p class="field-error" aria-live="polite">{itemLimitMessage ?? ''}</p>
				<button type="submit" class="btn btn-primary w-full sm:w-auto">Agregar ítem</button>
			</form>
		</section>

		<section class="card min-w-0" aria-labelledby="summary-heading">
			<h2 id="summary-heading" class="card-title">Ítems</h2>
			<ItemsTable items={rows} onremove={handleRemoveItem} />
			<Totals subtotalCents={subtotal} ivaCents={iva} totalCents={total} />
			<div class="mt-6">
				<button
					type="button"
					class="btn btn-primary w-full"
					onclick={handleExport}
					disabled={!canExport || exportBusy}
					aria-busy={exportBusy}
					aria-describedby={exportHint ? exportHintId : undefined}
				>
					{#if exportBusy}
						<svg
							class="size-4 animate-spin"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							/>
							<path
								class="opacity-90"
								fill="currentColor"
								d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
							/>
						</svg>
						Exportando…
					{:else}
						Exportar PDF
					{/if}
				</button>
				<!-- Reserved slot: idle hint / success / error swap in place without
				     shifting the surrounding composition. -->
				<div class="mt-1 min-h-5">
					{#if exportSuccessText}
						<!-- Confirms the download STARTED; never claims the OS saved it. -->
						<p
							class="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400"
							role="status"
							in:fly={{ y: 4, duration: motionDuration(200) }}
						>
							<svg
								class="size-4 shrink-0"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M20 6 9 17l-5-5" />
							</svg>
							<span>{exportSuccessText}</span>
						</p>
					{:else if exportPhase === 'error'}
						<p
							class="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400"
							role="alert"
							in:fly={{ y: 4, duration: motionDuration(200) }}
						>
							<svg
								class="mt-0.5 size-4 shrink-0"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
							</svg>
							<span>{EXPORT_ERROR_TEXT}</span>
						</p>
					{:else}
						<p id={exportHintId} class="field-error" aria-live="polite">{exportHint ?? ''}</p>
					{/if}
				</div>
			</div>
		</section>
	</div>

	<div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
		<section class="card min-w-0" aria-labelledby="parse-heading">
			<h2 id="parse-heading" class="card-title">Analizar texto</h2>
			<p class="hint-text mb-4">
				Escribí lo que necesita el cliente y los ítems se agregan a la tabla mientras se analizan.
			</p>
			<ParsePanel onitem={handleParsedItem} />
		</section>

		<section class="card min-w-0" aria-labelledby="saved-heading">
			<h2 id="saved-heading" class="card-title">Guardar y cargar</h2>
			<p class="hint-text mb-4">
				Guardá el presupuesto actual con su número {presId ?? 'PRES-······'} o cargá uno guardado
				para seguir trabajando con esos datos.
			</p>
			<button
				type="button"
				class="btn btn-primary w-full"
				onclick={handleSave}
				disabled={!canSave || saveBusy}
				aria-busy={saveBusy}
			>
				{#if saveBusy}
					<svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						/>
						<path
							class="opacity-90"
							fill="currentColor"
							d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
						/>
					</svg>
					Guardando…
				{:else}
					Guardar
				{/if}
			</button>
			<!-- Reserved slot: save feedback swaps in place without shifting layout. -->
			<div class="mt-1 min-h-5">
				{#if savePhase === 'success'}
					<p
						class="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400"
						role="status"
						in:fly={{ y: 4, duration: motionDuration(200) }}
					>
						<svg
							class="size-4 shrink-0"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M20 6 9 17l-5-5" />
						</svg>
						<span>{SAVE_SUCCESS_TEXT}</span>
					</p>
				{:else if savePhase === 'error'}
					<p
						class="text-sm text-red-600 dark:text-red-400"
						role="alert"
						in:fly={{ y: 4, duration: motionDuration(200) }}
					>
						{saveErrorText}
					</p>
				{/if}
			</div>
			<div class="mt-6">
				<BudgetPicker bind:this={picker} onload={handleLoadBudget} />
			</div>
		</section>
	</div>
</main>
