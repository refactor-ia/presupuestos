<script lang="ts">
	import { onMount } from 'svelte';
	import { deleteBudget, listBudgets, type Budget } from '$lib/client/api';
	import { motionDuration } from '$lib/motion';
	import { fly } from 'svelte/transition';

	interface Props {
		/** Called with the chosen budget when the user presses Cargar. */
		onload: (budget: Budget) => void;
		/** Called after a successful delete so the parent can give feedback. */
		ondelete?: (budget: Budget) => void;
	}

	let { onload, ondelete }: Props = $props();

	let budgets = $state<Budget[]>([]);
	let selectedId = $state('');
	let listError = $state<string | null>(null);
	let deleting = $state(false);

	const selected = $derived(budgets.find((budget) => String(budget.id) === selectedId) ?? null);

	// Short numeric date (no Intl dependency, matching the date module's stance).
	function shortDate(iso: string): string {
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return '';
		return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
	}

	function optionLabel(budget: Budget): string {
		const date = shortDate(budget.createdAt);
		return date === '' ? `${budget.number} · ${budget.clientName}` : `${budget.number} · ${budget.clientName} · ${date}`;
	}

	async function refreshAsync(): Promise<void> {
		try {
			budgets = await listBudgets();
			listError = null;
			// Keep the selection only when it still points at a real budget.
			if (!budgets.some((budget) => String(budget.id) === selectedId)) {
				selectedId = '';
			}
		} catch {
			listError = 'No se pudo cargar la lista de presupuestos guardados.';
		}
	}

	/** Re-fetch the list; the page calls this after every successful save. */
	export function refresh(): void {
		void refreshAsync();
	}

	async function handleDelete(): Promise<void> {
		const budget = selected;
		if (budget === null || deleting) return;
		deleting = true;
		try {
			await deleteBudget(budget.id);
			await refreshAsync();
			ondelete?.(budget);
		} catch {
			listError = 'No se pudo eliminar el presupuesto seleccionado.';
		} finally {
			deleting = false;
		}
	}

	function handleLoad(): void {
		if (selected !== null) onload(selected);
	}

	onMount(() => {
		void refreshAsync();
	});
</script>

<div class="space-y-4">
	<div class="flex flex-col">
		<label class="field-label" for="saved-budgets">Presupuestos guardados</label>
		<select
			id="saved-budgets"
			bind:value={selectedId}
			class="field-input"
			aria-describedby={listError !== null ? 'saved-budgets-error' : undefined}
		>
			<option value="" disabled>Elegí un presupuesto…</option>
			{#each budgets as budget (budget.id)}
				<option value={String(budget.id)}>{optionLabel(budget)}</option>
			{/each}
		</select>
	</div>
	<!-- Reserved slot: the error never shifts the buttons below. -->
	<div class="min-h-5">
		{#if listError !== null}
			<p
				id="saved-budgets-error"
				class="text-sm text-red-600 dark:text-red-400"
				role="alert"
				in:fly={{ y: 4, duration: motionDuration(200) }}
			>
				{listError}
			</p>
		{/if}
	</div>
	<div class="flex gap-2">
		<button type="button" class="btn btn-primary flex-1" onclick={handleLoad} disabled={selected === null}>
			Cargar
		</button>
		<button
			type="button"
			class="btn btn-secondary flex-1"
			onclick={handleDelete}
			disabled={selected === null || deleting}
			aria-busy={deleting}
		>
			{deleting ? 'Eliminando…' : 'Eliminar'}
		</button>
	</div>
</div>
