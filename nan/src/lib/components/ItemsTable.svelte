<script lang="ts">
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { motionDuration } from '$lib/motion';
	import { formatCents, itemSubtotalCents } from '$lib/domain/money';
	import type { BudgetItem } from '$lib/domain/validate';

	/** Row identity: the page mints `key` when the item is added and keeps it
	 *  stable until removal, so Svelte can run enter/exit/reflow transitions. */
	type RowItem = BudgetItem & { key: number };

	interface Props {
		items: RowItem[];
		onremove: (index: number) => void;
	}

	let { items, onremove }: Props = $props();
</script>

<!-- relative makes this scroll container the containing block for the sr-only
     caption/label inside the table: without it they anchor to the page and
     escape the clip, widening the document when the table's min-content
     exceeds the viewport (INV-01). The table itself scrolls internally. -->
<div class="relative overflow-x-auto">
	<table class="w-full border-collapse text-sm">
		<caption class="sr-only text-left">Ítems del presupuesto</caption>
		<thead>
			<tr class="border-b border-slate-200 text-left dark:border-zinc-700">
				<th scope="col" class="py-2 pr-3 font-semibold">Descripción</th>
				<th scope="col" class="table-num py-2 pr-3 font-semibold">Cant.</th>
				<th scope="col" class="table-num py-2 pr-3 font-semibold">Precio</th>
				<th scope="col" class="table-num py-2 pr-3 font-semibold">Subtotal</th>
				<th scope="col" class="py-2">
					<span class="sr-only">Eliminar</span>
				</th>
			</tr>
		</thead>
		<tbody>
			{#each items as item, index (item.key)}
				<!-- Feedback matrix: animated row entrance (.row-enter wash + fly),
				     animated exit (out:fly) and perceptible reflow of the remaining
				     rows (animate:flip). Durations collapse under reduced motion. -->
				<tr
					class="row-enter border-b border-slate-100 last:border-0 dark:border-zinc-800"
					in:fly={{ y: 14, duration: motionDuration(260), easing: cubicOut }}
					out:fly={{ y: 8, duration: motionDuration(180), easing: cubicOut }}
					animate:flip={{ duration: motionDuration(220) }}
				>
					<td
						class="max-w-48 min-w-0 py-2 pr-3 align-top break-words text-slate-800 sm:max-w-none dark:text-zinc-200"
						title={item.description}
					>
						{item.description}
					</td>
					<td class="table-num py-2 pr-3 align-top text-slate-600 dark:text-zinc-400">{item.quantity}</td>
					<td class="table-num py-2 pr-3 align-top text-slate-600 dark:text-zinc-400">
						{formatCents(item.unitPriceCents)}
					</td>
					<td class="table-num py-2 pr-3 align-top font-medium text-slate-900 dark:text-zinc-100">
						{formatCents(itemSubtotalCents(item.quantity, item.unitPriceCents))}
					</td>
					<td class="py-1 align-top text-right">
						<button
							type="button"
							class="btn-icon-ghost btn-icon-row"
							aria-label={`Eliminar ítem ${item.description}`}
							onclick={() => onremove(index)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M18 6 6 18" /><path d="m6 6 12 12" />
							</svg>
						</button>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="5" class="py-6 text-center hint-text">
						Sin ítems todavía. Agregá el primero con el formulario.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
