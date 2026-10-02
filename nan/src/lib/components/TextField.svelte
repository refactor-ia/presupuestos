<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		/** Unique field id; also derives the error message id for aria-describedby. */
		id: string;
		label: string;
		value?: string;
		/** Resolved error message, shown only when the parent decides (blur or attempt). */
		error?: string | null;
		required?: boolean;
		optional?: boolean;
		type?: 'text' | 'email';
		inputmode?: 'text' | 'numeric' | 'decimal';
		placeholder?: string;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		/** Parent marks the field as touched (validation gate) on blur. */
		onblur?: () => void;
		/** Element handle so the page can keep focus on a usable field (INV-07). */
		inputEl?: HTMLInputElement;
		/** Live character counter (F-03): shown in the label row once `current`
		 *  gets near `max`; sits in the label line's free space, so it never
		 *  adds a line or shifts layout. */
		counter?: { current: number; max: number } | null;
	}

	let {
		id,
		label,
		value = $bindable(''),
		error = null,
		required = false,
		optional = false,
		type = 'text',
		inputmode,
		placeholder,
		autocomplete,
		onblur,
		inputEl = $bindable(),
		counter = null
	}: Props = $props();

	const errorId = $derived(`${id}-error`);

	// Counter visibility thresholds scale with the limit: visible 40 chars
	// before it, amber 20 before it, red at/over the limit.
	const counterText = $derived.by(() => {
		if (counter === null || counter.current < counter.max - 40) return null;
		return `${counter.current}/${counter.max}`;
	});
	const counterClass = $derived.by(() => {
		if (counter === null) return '';
		if (counter.current >= counter.max) return 'text-red-600 dark:text-red-400';
		if (counter.current >= counter.max - 20) return 'text-amber-700 dark:text-amber-400';
		return 'text-slate-500 dark:text-zinc-400';
	});
</script>

<div class="flex flex-col">
	<div class="flex items-baseline justify-between gap-2">
		<label class="field-label" for={id}>
			{label}
			{#if required}
				<span class="text-red-500 dark:text-red-400" aria-hidden="true">*</span>
			{/if}
			{#if optional}
				<span class="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
			{/if}
		</label>
		{#if counterText}
			<span class="shrink-0 text-xs font-medium tabular-nums {counterClass}" aria-live="polite">
				{counterText}
			</span>
		{/if}
	</div>
	<input
		bind:this={inputEl}
		bind:value
		{id}
		{type}
		{inputmode}
		{placeholder}
		{autocomplete}
		class="field-input"
		class:field-input-error={error !== null && error !== ''}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? errorId : undefined}
		{onblur}
	/>
	<!-- Reserved slot: always present so error text never shifts neighboring fields. -->
	<p id={errorId} class="field-error" aria-live="polite">{error ?? ''}</p>
</div>
