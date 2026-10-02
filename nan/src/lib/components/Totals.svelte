<script lang="ts">
	import { formatCents } from '$lib/domain/money';

	interface Props {
		subtotalCents: number;
		ivaCents: number;
		totalCents: number;
	}

	let { subtotalCents, ivaCents, totalCents }: Props = $props();
</script>

<!-- The Total is the visual protagonist of the interface (design.md hierarchy).
     Each value is keyed so a change remounts the span and replays its emphasis
     animation (feedback matrix: the new value stands out); the Total gets the
     strongest flash + scale pop, while subtotal/IVA only blink. The aria-live
     region stays on the stable <dd>, not the remounted span. -->
<dl class="mt-5 space-y-2 border-t border-slate-200 pt-4 dark:border-zinc-700">
	<div class="flex items-baseline justify-between gap-4">
		<dt class="text-sm text-slate-500 dark:text-zinc-400">Subtotal</dt>
		<dd class="table-num text-base text-slate-800 dark:text-zinc-200">
			{#key subtotalCents}<span class="value-flash">{formatCents(subtotalCents)}</span>{/key}
		</dd>
	</div>
	<div class="flex items-baseline justify-between gap-4">
		<dt class="text-sm text-slate-500 dark:text-zinc-400">IVA 22%</dt>
		<dd class="table-num text-base text-slate-800 dark:text-zinc-200">
			{#key ivaCents}<span class="value-flash">{formatCents(ivaCents)}</span>{/key}
		</dd>
	</div>
	<div class="mt-3 flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3 dark:border-zinc-700">
		<dt class="text-base font-semibold text-slate-900 dark:text-zinc-50">Total</dt>
		<dd class="table-num text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400" aria-live="polite">
			{#key totalCents}<span class="value-flash total-flash">{formatCents(totalCents)}</span>{/key}
		</dd>
	</div>
</dl>
