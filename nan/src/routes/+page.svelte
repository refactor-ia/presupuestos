<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import ItemsTable from '$lib/components/ItemsTable.svelte';
	import Totals from '$lib/components/Totals.svelte';
	import ParsePanel from '$lib/components/ParsePanel.svelte';
	import BudgetPicker from '$lib/components/BudgetPicker.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import ConfettiBurst from '$lib/components/ConfettiBurst.svelte';
	import { ApiError, saveBudget, updateBudget, sendBudgetEmail, type Budget, type BudgetPayload } from '$lib/client/api';
	import { formatLongDate } from '$lib/date';
	import { motionDuration, prefersReducedMotion } from '$lib/motion';
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
	let addShakeKey = $state(0);

	// --- Reward layer: toast, confetti, copy-to-clipboard -------------------

	let toastText = $state<string | null>(null);
	let toastSeq = $state(0);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	const TOAST_MS = 2_600;

	/** Transient confirmation. Every message also lands in a reserved slot,
	 *  so the toast is reinforcement, never the only channel. */
	function showToast(text: string): void {
		toastText = text;
		toastSeq += 1;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toastText = null), TOAST_MS);
	}

	let confettiTrigger = $state(0);
	let presCopied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	/** Copies the session number. The Clipboard API exists only in secure
	 *  contexts, so plain-HTTP evaluation URLs fall back to execCommand. */
	async function copyPresId(): Promise<void> {
		if (presId === null) return;
		let ok = false;
		try {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(presId);
				ok = true;
			}
		} catch {
			ok = false;
		}
		if (!ok) {
			const area = document.createElement('textarea');
			area.value = presId;
			area.setAttribute('readonly', '');
			area.style.position = 'fixed';
			area.style.opacity = '0';
			document.body.appendChild(area);
			area.select();
			ok = document.execCommand('copy');
			area.remove();
		}
		if (!ok) return;
		presCopied = true;
		showToast('Número copiado');
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (presCopied = false), 1_800);
	}

	let parseBusy = $state(false);

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
		if (descriptionCode !== null || quantityCode !== null || priceCode !== null) {
			addShakeKey += 1; // replay the shake on every invalid attempt
			return;
		}
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
		showToast('Ítem agregado');
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
			saveSuccessText = '';
		}
		saveNoticeText = null;
		// A stale send confirmation is a lie after the budget changed: the mail
		// that already went out no longer describes what is on screen. The
		// send-busy state survives like save-busy does.
		if (sendPhase !== 'busy') {
			sendPhase = 'idle';
			sendText = '';
		}
		clearSaveFeedbackTimer();
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

	/** Fills the client name from a parsed client mention. Never overwrites
	 *  user content: it applies only when the field is empty after trim. When
	 *  the field already holds a name the mention is dropped — but not
	 *  silently: a transient notice in the save feedback slot says so. The
	 *  other client fields (email/address/rut) stay manual. */
	function handleParsedClient(name: string): void {
		const trimmed = name.trim();
		if (trimmed === '') return;
		if (clientName.trim() === '') {
			resetSaveFeedback();
			clientName = trimmed;
			return;
		}
		showSaveNotice(
			`El texto mencionaba al cliente ${trimmed}, pero el campo ya tiene un nombre. No se modificó.`
		);
	}

	/** Fills the client email from a parsed email mention. Same never-overwrite
	 *  rule as handleParsedClient: applies only when the field is empty after
	 *  trim; otherwise a transient notice says the mention was dropped. */
	function handleParsedEmail(email: string): void {
		const trimmed = email.trim();
		if (trimmed === '') return;
		if (clientEmail.trim() === '') {
			resetSaveFeedback();
			clientEmail = trimmed;
			return;
		}
		showSaveNotice('El texto mencionaba un email, pero el campo ya tiene uno. No se modificó.');
	}

	/** Fills the client address from a parsed address mention. Same
	 *  never-overwrite rule as handleParsedClient (see above). */
	function handleParsedAddress(address: string): void {
		const trimmed = address.trim();
		if (trimmed === '') return;
		if (clientAddress.trim() === '') {
			resetSaveFeedback();
			clientAddress = trimmed;
			return;
		}
		showSaveNotice(
			'El texto mencionaba una dirección, pero el campo ya tiene una. No se modificó.'
		);
	}

	const LOAD_OVERWRITE_CONFIRM =
		'Hay datos en el formulario. ¿Cargar el presupuesto seleccionado y reemplazarlos?';

	/** True when the user has entered anything a load would replace: any
	 *  client field non-empty, or at least one item row. */
	function formIsDirty(): boolean {
		return (
			clientName.trim() !== '' ||
			clientEmail.trim() !== '' ||
			clientAddress.trim() !== '' ||
			clientRut.trim() !== '' ||
			items.length > 0
		);
	}

	/** Replaces the form state with a saved budget. The session-generated
	 *  number stays the session's own (RQ-01): the loaded budget's number is
	 *  deliberately NOT copied. The loaded budget's id is remembered so a
	 *  later save UPDATES that row instead of duplicating it. The PDF flow
	 *  keeps working untouched. */
	function handleLoadBudget(budget: Budget): void {
		// Overwrite guard: loading replaces everything the user typed, so the
		// action is confirmed whenever the form holds data (empty form loads
		// directly — there is nothing to lose).
		if (formIsDirty() && !confirm(LOAD_OVERWRITE_CONFIRM)) return;
		clientName = budget.clientName;
		clientEmail = budget.email;
		clientAddress = budget.address;
		clientRut = budget.rut;
		items = budget.items.map((item) => ({ ...item }));
		rowKeys = items.map(() => ++rowKeySeq);
		savedBudgetId = budget.id;
		// Recipient follows the loaded budget's client email again (the user
		// can still override it manually afterwards).
		sendTouched = false;
		sendDraft = '';
		// The loaded state is exactly what SQLite now holds: not dirty.
		savedSnapshot = JSON.stringify(buildPayload());
		// Values just loaded are valid; clear blur-touched errors.
		nameTouched = false;
		emailTouched = false;
		addressTouched = false;
		rutTouched = false;
		resetSaveFeedback();
		// Feedback in the shared save slot: what happened and which number the
		// loaded data carries. The parse panel's status line would otherwise
		// keep describing the previous form content, so it is reset too.
		showSaveSuccess(`Presupuesto ${budget.number} cargado.`);
		parsePanel?.resetStatus();
	}

	let picker = $state<BudgetPicker | null>(null);
	let parsePanel = $state<ParsePanel | null>(null);
	let savePhase = $state<'idle' | 'busy' | 'success' | 'error'>('idle');
	let saveErrorText = $state<string | null>(null);
	/** Success line: the PRES number echo on save, or load/delete feedback. */
	let saveSuccessText = $state('');
	/** Transient neutral notice (e.g. an ignored parse client mention). */
	let saveNoticeText = $state<string | null>(null);
	const SAVE_ERROR_FALLBACK = 'No se pudo guardar el presupuesto. Probá de nuevo.';
	/** How long success/notice feedback stays visible; errors persist until
	 *  the next action clears them (INV-08). */
	const SAVE_FEEDBACK_MS = 6_000;
	let saveFeedbackTimer: ReturnType<typeof setTimeout> | undefined;

	function clearSaveFeedbackTimer(): void {
		clearTimeout(saveFeedbackTimer);
	}

	/** Shows a success line that auto-clears after SAVE_FEEDBACK_MS. */
	function showSaveSuccess(text: string): void {
		savePhase = 'success';
		saveSuccessText = text;
		saveNoticeText = null;
		clearSaveFeedbackTimer();
		saveFeedbackTimer = setTimeout(() => {
			if (savePhase === 'success') {
				savePhase = 'idle';
				saveSuccessText = '';
			}
		}, SAVE_FEEDBACK_MS);
	}

	/** Shows a transient notice that auto-clears after SAVE_FEEDBACK_MS. A
	 *  save in flight owns the slot, so the notice is dropped: its outcome
	 *  lands immediately after and would overwrite it anyway. */
	function showSaveNotice(text: string): void {
		if (savePhase === 'busy') return;
		savePhase = 'idle';
		saveSuccessText = '';
		saveNoticeText = text;
		clearSaveFeedbackTimer();
		saveFeedbackTimer = setTimeout(() => {
			saveNoticeText = null;
		}, SAVE_FEEDBACK_MS);
	}

	// Feedback visibility (UX polish): the save card sits below the fold on
	// smaller viewports, so a phase change scrolls the feedback slot into
	// view. block:'nearest' never scrolls when it is already on screen, and
	// reduced motion gets an instant jump instead of the smooth scroll.
	let saveFeedbackEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		const visible = savePhase === 'success' || savePhase === 'error' || saveNoticeText !== null;
		if (!visible) return;
		saveFeedbackEl?.scrollIntoView({
			block: 'nearest',
			behavior: prefersReducedMotion ? 'auto' : 'smooth'
		});
	});

	/** Id of the budget row this session currently persists to, or null while
	 *  the form is unsaved (next save creates a row). Set on a successful
	 *  create and when a saved budget is loaded. No explicit "new budget"
	 *  control exists, so resetting to null happens on page reload only:
	 *  until then every save updates the same row (create-then-update). */
	let savedBudgetId = $state<number | null>(null);

	// --- Send by email (documented extension; external effect) -------------
	// Only saved budgets can be sent: the server reads the row from SQLite,
	// so the mail always reflects stored data. The recipient defaults to the
	// client email already on the form; the server throttles one mail per
	// recipient per minute (429) and owns the Postmark credentials.
	// --- Send by email (documented extension; external effect) -------------
	// One action, save-then-send: when the form differs from the persisted
	// row (or was never saved), handleSend persists first, so the mail always
	// reflects what the user sees. The recipient follows the client email
	// field until the user edits it deliberately; a loaded budget resets it
	// to the budget's own client email.
	let sendDraft = $state('');
	let sendTouched = $state(false);
	let sendPhase = $state<'idle' | 'busy' | 'success' | 'error'>('idle');
	let sendText = $state('');
	const SEND_ERROR_FALLBACK = 'No se pudo enviar el mail. Intentá de nuevo.';
	/** Recipient shown/used by the send flow. */
	const sendEmail = $derived(sendTouched ? sendDraft : clientEmail);
	const sendEmailInvalid = $derived(
		sendEmail.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(sendEmail.trim())
	);

	// Staleness detection: snapshot of the payload as it exists in SQLite.
	// Every save/load refreshes it; any form mutation makes the comparison
	// fail and marks the form dirty (save-then-send kicks in).
	let savedSnapshot = $state('');
	function buildPayload(): BudgetPayload {
		return {
			number: presId ?? '',
			clientName: clientName.trim(),
			email: clientEmail.trim(),
			address: clientAddress.trim(),
			rut: clientRut.trim(),
			items: items.map((item) => ({ ...item }))
		};
	}
	const isDirty = $derived(JSON.stringify(buildPayload()) !== savedSnapshot);

	const sendHint = $derived.by(() => {
		if (items.length === 0) return 'Agregá al menos un ítem para enviarlo por mail.';
		if (clientInvalid) return messageFor('EXPORT_CLIENT_INVALID');
		if (sendEmail.trim() === '') return 'Escribí el mail del destinatario.';
		return null;
	});
	const canSend = $derived(
		presId !== null &&
			items.length > 0 &&
			!clientInvalid &&
			!sendEmailInvalid &&
			sendPhase !== 'busy' &&
			savePhase !== 'busy'
	);

	async function handleSend(): Promise<void> {
		if (!canSend) return;
		sendPhase = 'busy';
		sendText = '';
		const wasDirty = isDirty;
		try {
			if (isDirty) {
				// Persist first: the mail is built from the SQLite row, so this
				// guarantees what arrives is exactly what is on screen. handleSave
				// owns its own feedback and error text.
				await handleSave();
				if (savePhase === 'error' || savedBudgetId === null) {
					sendPhase = 'error';
					sendText = 'No se pudo guardar el presupuesto, así que no se envió nada.';
					return;
				}
			}
			const id = savedBudgetId;
			if (id === null) {
				sendPhase = 'error';
				sendText = 'No se pudo guardar el presupuesto, así que no se envió nada.';
				return;
			}
			await sendBudgetEmail(id, sendEmail.trim());
			sendPhase = 'success';
			sendText = wasDirty ? `Guardado y enviado a ${sendEmail.trim()}.` : `Enviado a ${sendEmail.trim()}.`;
			showToast(`Enviado a ${sendEmail.trim()}`);
		} catch (error) {
			sendPhase = 'error';
			sendText = error instanceof ApiError && error.message !== '' ? error.message : SEND_ERROR_FALLBACK;
		}
	}

	const saveBusy = $derived(savePhase === 'busy');
	const canSave = $derived(presId !== null && items.length > 0 && !clientInvalid);

	// Gate hint for the disabled Guardar button (mirrors exportHint): a
	// disabled state is information, not an error, so it uses the neutral
	// hint style — never red.
	const saveHintId = 'save-hint';
	const saveHint = $derived.by(() => {
		if (presId === null || canSave) return null;
		if (items.length === 0) return 'Agregá al menos un ítem para guardar.';
		if (clientName.trim() === '') return 'Completá el nombre del cliente para guardar.';
		// Items + name are fine: another client field fails validation.
		return messageFor('EXPORT_CLIENT_INVALID');
	});

	async function handleSave(): Promise<void> {
		if (presId === null || savePhase === 'busy') return;
		const sessionNumber = presId;
		savePhase = 'busy';
		saveErrorText = null;
		const payload = {
			number: sessionNumber,
			clientName: clientName.trim(),
			email: clientEmail.trim(),
			address: clientAddress.trim(),
			rut: clientRut.trim(),
			items: items.map((item) => ({ ...item }))
		};
		try {
			// Create-then-update: the first save POSTs a new row; every later
			// save PUTs the same row. The session PRES- number is only used on
			// create — the server preserves (and ignores) it on update (RQ-01).
			const saved =
				savedBudgetId !== null
					? await updateBudget(savedBudgetId, payload)
					: await saveBudget(payload);
			savedBudgetId = saved.id;
			// What SQLite holds now matches the form exactly: not dirty.
			savedSnapshot = JSON.stringify(buildPayload());
			// Success echoes the session number, so the user can match the
			// saved row in the picker without hunting for it.
			showSaveSuccess(`Guardado como ${sessionNumber}.`);
			showToast(`Guardado como ${sessionNumber}`);
			picker?.refresh(); // the saved budget appears in the list immediately
		} catch (error) {
			// The API surfaces the Spanish { code, message } contract: render its
			// message directly, falling back to a generic text when unreachable.
			saveErrorText =
				error instanceof ApiError && error.message !== '' ? error.message : SAVE_ERROR_FALLBACK;
			savePhase = 'error';
			clearSaveFeedbackTimer(); // errors persist until the next action
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
		clearSaveFeedbackTimer();
		clearTimeout(toastTimer);
		clearTimeout(copiedTimer);
		exportFlow.dispose();
	});

	/** Feedback for a confirmed delete from the picker (shared save slot). */
	function handleBudgetDeleted(): void {
		showSaveSuccess('Presupuesto eliminado.');
	}

	const exportBusy = $derived(exportPhase === 'preparing');
	const exportSuccessText = $derived(
		exportPhase === 'success' && presId !== null
			? `Descarga iniciada: ${pdfFilenameFor(presId)}`
			: null
	);
	// Reward on a started download: confetti burst + toast, success only.
	$effect(() => {
		const text = exportSuccessText;
		if (text === null) return;
		untrack(() => {
			confettiTrigger += 1;
			showToast(text);
		});
	});

	const EXPORT_ERROR_TEXT =
		'No se pudo generar el PDF. Tus datos siguen intactos; probá de nuevo.';
</script>

<svelte:head>
	<title>Presupuestos</title>
	<meta name="description" content="Armá un presupuesto de cliente y revisá sus importes." />
</svelte:head>

{#snippet spinner()}
	<svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
		<path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
	</svg>
{/snippet}

{#snippet checkIcon()}
	<svg class="check-draw mt-0.5 size-4 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
		<path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
{/snippet}

{#snippet alertIcon()}
	<svg class="mt-0.5 size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
	</svg>
{/snippet}

<header class="sticky top-0 z-40 border-b border-line backdrop-blur-md" style="background: color-mix(in lab, var(--bg) 82%, transparent);">
	<div class="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
		<div class="flex flex-1 items-center gap-2.5">
			<svg class="size-8 shrink-0" viewBox="0 0 32 32" aria-hidden="true">
				<rect width="32" height="32" rx="9" fill="var(--brand)" />
				<path d="M9 22V10l7 9V10M23 10v12" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<span class="text-[17px] font-bold tracking-[var(--tracking-tight)]">NaN</span>
			<span class="hidden text-sm text-fg-2 sm:inline">Presupuestos</span>
		</div>
		<!-- Session number: the first thing to identify (design.md hierarchy). -->
		<button
			type="button"
			class="chip"
			onclick={copyPresId}
			disabled={presId === null}
			aria-label={presId === null ? 'Número de presupuesto' : `Copiar número ${presId}`}
		>
			<span aria-live="polite">
				{#if presId === null}
					PRES-······
				{:else}
					{#key presId}
						<span class="materialize inline-block">{presId}</span>
					{/key}
				{/if}
			</span>
			{#if presCopied}
				<svg class="check-draw size-4" viewBox="0 0 16 16" aria-hidden="true">
					<path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			{:else}
				<svg class="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
					<rect x="5" y="5" width="8" height="8" rx="2" /><path d="M3 10.5V4a1 1 0 0 1 1-1h6.5" />
				</svg>
			{/if}
		</button>
		<ThemeToggle />
	</div>
</header>

<main class="mx-auto w-full max-w-7xl px-4 pt-8 pb-24 sm:px-6 sm:pt-10">
	<div class="mb-8 flex flex-wrap items-end gap-x-6 gap-y-3">
		<div class="flex-1">
			<p class="eyebrow">
				Presupuesto{#if issueDateText}<span> · {issueDateText}</span>{/if}
			</p>
			<h1 class="mt-2.5 text-4xl leading-none font-medium tracking-[var(--tracking-tight)] sm:text-5xl">
				Armá tu presupuesto
			</h1>
		</div>
		<p class="max-w-sm text-[15px] leading-normal text-fg-2">
			Dictalo, describilo o cargalo a mano. Los totales se actualizan al instante.
		</p>
	</div>

	<div class="flex flex-wrap items-start gap-6">
		<div class="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
			<section class="card" aria-labelledby="parse-heading">
				<h2 id="parse-heading" class="card-title">Analizar texto</h2>
				<ParsePanel
					bind:this={parsePanel}
					bind:busy={parseBusy}
					onitem={handleParsedItem}
					onclient={handleParsedClient}
					onemail={handleParsedEmail}
					onaddress={handleParsedAddress}
				/>
			</section>

			<section class="card" aria-labelledby="client-heading">
				<h2 id="client-heading" class="card-title">Cliente</h2>
				<div class="grid gap-x-4 gap-y-1 sm:grid-cols-2">
					<TextField
						id="client-name"
						label="Nombre"
						bind:value={clientName}
						error={nameError}
						required
						autocomplete="organization"
						onblur={() => (nameTouched = true)}
					/>
					<TextField
						id="client-email"
						label="Email"
						bind:value={clientEmail}
						error={emailError}
						optional
						type="email"
						autocomplete="email"
						onblur={() => (emailTouched = true)}
					/>
					<TextField
						id="client-address"
						label="Dirección"
						bind:value={clientAddress}
						error={addressError}
						optional
						autocomplete="street-address"
						onblur={() => (addressTouched = true)}
					/>
					<TextField
						id="client-rut"
						label="RUT"
						bind:value={clientRut}
						error={rutError}
						optional
						autocomplete="off"
						onblur={() => (rutTouched = true)}
					/>
				</div>
			</section>

			<section class="card" aria-labelledby="summary-heading">
				<div class="mb-2 flex items-baseline justify-between gap-4">
					<h2 id="summary-heading" class="card-title mb-0">Ítems</h2>
					<span class="num text-[13px] text-fg-2">{items.length} {items.length === 1 ? 'ítem' : 'ítems'}</span>
				</div>
				<ItemsTable items={rows} onremove={handleRemoveItem} loading={parseBusy} />

				<form
					class="mt-5 rounded-[var(--radius-main)] border border-dashed border-line bg-bg p-4"
					aria-labelledby="add-heading"
					onsubmit={(event) => {
						event.preventDefault();
						handleAddItem();
					}}
				>
					<h3 id="add-heading" class="eyebrow mb-3">Agregar ítem</h3>
					<div class="grid gap-x-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem]">
						<TextField
							id="item-description"
							label="Descripción"
							bind:value={itemDescription}
							error={descriptionError}
							placeholder="Ej.: Diseño web"
							counter={{ current: itemDescription.length, max: DESCRIPTION_MAX }}
							onblur={() => (descriptionTouched = true)}
							bind:inputEl={descriptionInput}
							shakeKey={addShakeKey}
						/>
						<TextField
							id="item-quantity"
							label="Cantidad"
							bind:value={itemQuantity}
							error={quantityError}
							inputmode="numeric"
							placeholder="Ej.: 3"
							onblur={() => (quantityTouched = true)}
							shakeKey={addShakeKey}
							inputClass="num text-right"
						/>
						<TextField
							id="item-price"
							label="Precio unitario"
							bind:value={itemUnitPrice}
							error={priceError}
							inputmode="decimal"
							placeholder="Ej.: 10,55"
							onblur={() => (priceTouched = true)}
							shakeKey={addShakeKey}
							inputClass="num text-right"
						/>
					</div>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<!-- Reserved slot for the item limit message: never shifts the button. -->
						<p class="field-error mt-0" aria-live="polite">{itemLimitMessage ?? ''}</p>
						<button type="submit" class="btn btn-primary w-full sm:w-auto">
							<svg class="size-4" viewBox="0 0 16 16" aria-hidden="true">
								<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
							Agregar ítem
						</button>
					</div>
				</form>
			</section>
		</div>

		<aside class="flex min-w-0 flex-[1_1_340px] flex-col gap-6 lg:sticky lg:top-24">
			<section class="card relative overflow-hidden p-6 sm:p-7" aria-labelledby="totals-heading">
				<h2 id="totals-heading" class="sr-only">Totales y exportación</h2>
				<div
					class="pointer-events-none absolute -top-16 -right-16 size-52 rounded-full"
					style="background: radial-gradient(circle, var(--brand-soft), transparent 70%);"
					aria-hidden="true"
				></div>
				<Totals subtotalCents={subtotal} ivaCents={iva} totalCents={total} />
				<div class="mt-6">
					{#if exportBusy}
						<div class="progress-track mb-3" role="progressbar" aria-label="Generando PDF">
							<i class="progress-bar"></i>
						</div>
					{/if}
					<div class="relative">
						<button
							type="button"
							class="btn btn-primary min-h-[52px] w-full text-[15px]"
							onclick={handleExport}
							disabled={!canExport || exportBusy}
							aria-busy={exportBusy}
							aria-describedby={exportHint ? exportHintId : undefined}
						>
							{#if exportBusy}
								{@render spinner()}
								Exportando…
							{:else if exportSuccessText}
								<svg class="check-draw size-[18px]" viewBox="0 0 16 16" aria-hidden="true">
									<path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
								Exportar PDF
							{:else}
								<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
									<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
								</svg>
								Exportar PDF
							{/if}
						</button>
						<ConfettiBurst trigger={confettiTrigger} />
					</div>
					<!-- Reserved slot: idle hint / success / error swap in place without
					     shifting the surrounding composition. -->
					<div class="mt-1 min-h-5">
						{#if exportSuccessText}
							<!-- Confirms the download STARTED; never claims the OS saved it. -->
							<p
								class="flex items-start gap-1.5 text-sm font-medium text-accent"
								role="status"
								in:fly={{ y: 4, duration: motionDuration(200) }}
							>
								{@render checkIcon()}
								<span>{exportSuccessText}</span>
							</p>
						{:else if exportPhase === 'error'}
							<p
								class="flex items-start gap-1.5 text-sm text-danger"
								role="alert"
								in:fly={{ y: 4, duration: motionDuration(200) }}
							>
								{@render alertIcon()}
								<span>{EXPORT_ERROR_TEXT}</span>
							</p>
						{:else}
							<p id={exportHintId} class="field-hint" aria-live="polite">{exportHint ?? ''}</p>
						{/if}
					</div>
					<!-- Send by email (documented extension): one action, save-then-send.
					     Always rendered next to the export action it complements; the
					     hint slot explains the gate instead of hiding the control. -->
					<div class="mt-5 flex flex-col gap-2 border-t border-line pt-5">
						<label class="field-label" for="send-email">Enviar por mail a</label>
						<div class="flex items-start gap-2">
							<input
								id="send-email"
								type="email"
								value={sendTouched ? sendDraft : clientEmail}
								oninput={(event) => {
									sendTouched = true;
									sendDraft = event.currentTarget.value;
								}}
								class="field-input min-w-0 flex-1"
								class:field-input-error={sendEmailInvalid}
								placeholder="destinatario@dominio.com"
								aria-invalid={sendEmailInvalid}
								disabled={sendPhase === 'busy'}
							/>
							<button
								type="button"
								class="btn btn-secondary shrink-0"
								onclick={handleSend}
								disabled={!canSend}
								aria-busy={sendPhase === 'busy'}
								aria-describedby={sendHint !== null ? 'send-hint' : undefined}
							>
								{#if sendPhase === 'busy'}
									{@render spinner()}
									{isDirty ? 'Guardando y enviando…' : 'Enviando…'}
								{:else}
									<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M3.5 6.5l8.5 6 8.5-6M4 5h16v14H4z" />
									</svg>
									{isDirty ? 'Guardar y enviar' : 'Enviar'}
								{/if}
							</button>
						</div>
						<!-- Reserved slot: hint / invalid / result swap in place. -->
						<div class="min-h-5">
							{#if sendEmailInvalid}
								<p class="text-sm text-danger" role="alert">El mail del destinatario no es válido.</p>
							{:else if sendText !== ''}
								<p
									class="flex items-start gap-1.5 text-sm {sendPhase === 'error' ? 'text-danger' : 'font-medium text-accent'}"
									role={sendPhase === 'error' ? 'alert' : 'status'}
									in:fly={{ y: 4, duration: motionDuration(200) }}
								>
									{#if sendPhase === 'error'}{@render alertIcon()}{:else}{@render checkIcon()}{/if}
									<span>{sendText}</span>
								</p>
							{:else if sendHint !== null}
								<p id="send-hint" class="field-hint" aria-live="polite">{sendHint}</p>
							{/if}
						</div>
					</div>
				</div>
			</section>

			<section class="card" aria-labelledby="saved-heading">
				<h2 id="saved-heading" class="card-title">Guardar y cargar</h2>
				<p class="hint-text mb-4">
					Guardá el presupuesto actual con su número {presId ?? 'PRES-······'} o cargá uno guardado
					para seguir trabajando con esos datos.
				</p>
				<button
					type="button"
					class="btn btn-secondary w-full"
					onclick={handleSave}
					disabled={!canSave || saveBusy}
					aria-busy={saveBusy}
					aria-describedby={saveHint ? saveHintId : undefined}
				>
					{#if saveBusy}
						{@render spinner()}
						Guardando…
					{:else}
						Guardar
					{/if}
				</button>
				<!-- Reserved slot: save feedback swaps in place without shifting layout. -->
				<div class="mt-1 min-h-5" bind:this={saveFeedbackEl}>
					{#if savePhase === 'success'}
						<p
							class="flex items-start gap-1.5 text-sm font-medium text-accent"
							role="status"
							in:fly={{ y: 4, duration: motionDuration(200) }}
						>
							{@render checkIcon()}
							<span>{saveSuccessText}</span>
						</p>
					{:else if savePhase === 'error'}
						<p
							class="flex items-start gap-1.5 text-sm text-danger"
							role="alert"
							in:fly={{ y: 4, duration: motionDuration(200) }}
						>
							{@render alertIcon()}
							<span>{saveErrorText}</span>
						</p>
					{:else if saveNoticeText !== null}
						<p
							class="flex items-start gap-1.5 text-sm font-medium text-accent"
							role="status"
							in:fly={{ y: 4, duration: motionDuration(200) }}
						>
							<svg class="mt-0.5 size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
							</svg>
							<span>{saveNoticeText}</span>
						</p>
					{:else if saveHint !== null}
						<!-- Gate hint for the disabled button: neutral, never red. -->
						<p id={saveHintId} class="field-hint" aria-live="polite">{saveHint}</p>
					{/if}
				</div>
				<div class="mt-6">
					<BudgetPicker bind:this={picker} onload={handleLoadBudget} ondelete={handleBudgetDeleted} />
				</div>
			</section>
		</aside>
	</div>
</main>

<Toast text={toastText} seq={toastSeq} />
