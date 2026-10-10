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
		/** Parse stream in flight: shows skeleton rows below the real ones. */
		loading?: boolean;
	}

	let { items, onremove, loading = false }: Props = $props();
</script>

<!-- relative makes this scroll container the containing block for the sr-only
     caption/label inside the table: without it they anchor to the page and
     escape the clip, widening the document when the table's min-content
     exceeds the viewport (INV-01). The table itself scrolls internally. -->
<div class="relative overflow-x-auto">
	<table class="w-full border-collapse text-sm">
		<caption class="sr-only text-left">Ítems del presupuesto</caption>
		<thead>
			<tr class="border-b border-line text-left text-xs tracking-[0.06em] text-fg-2 uppercase">
				<th scope="col" class="py-2 pr-3 font-medium">Descripción</th>
				<th scope="col" class="table-num py-2 pr-3 font-medium">Cant.</th>
				<th scope="col" class="table-num py-2 pr-3 font-medium">Precio</th>
				<th scope="col" class="table-num py-2 pr-3 font-medium">Subtotal</th>
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
					class="row-enter border-b border-line transition-colors last:border-0 hover:bg-brand-soft"
					in:fly={{ y: 14, duration: motionDuration(260), easing: cubicOut }}
					out:fly={{ y: 8, duration: motionDuration(180), easing: cubicOut }}
					animate:flip={{ duration: motionDuration(220) }}
				>
					<td
						class="max-w-48 min-w-0 py-2 pr-3 align-top break-words sm:max-w-none"
						title={item.description}
					>
						{item.description}
					</td>
					<td class="table-num py-2 pr-3 align-top text-fg-2">{item.quantity}</td>
					<td class="table-num py-2 pr-3 align-top text-fg-2">
						{formatCents(item.unitPriceCents)}
					</td>
					<td class="table-num py-2 pr-3 align-top font-medium">
						{formatCents(itemSubtotalCents(item.quantity, item.unitPriceCents))}
					</td>
					<td class="py-1 align-top text-right">
						<button
							type="button"
							class="btn-icon-ghost btn-icon-row"
							aria-label={`Eliminar ítem ${item.description}`}
							onclick={() => onremove(index)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
							</svg>
						</button>
					</td>
				</tr>
			{:else}
				{#if !loading}
					<tr>
						<td colspan="5" class="py-9 text-center">
							<div class="flex flex-col items-center gap-2.5 text-fg-2">
								<svg class="float-soft size-14" viewBox="0 0 56 56" fill="none" aria-hidden="true">
									<rect x="12" y="8" width="32" height="40" rx="6" stroke="var(--brand)" stroke-width="2" />
									<path d="M20 20h16M20 28h16M20 36h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
								</svg>
								<span class="text-sm">Sin ítems todavía. Dictá, describí o agregá el primero.</span>
							</div>
						</td>
					</tr>
				{/if}
			{/each}
			{#if loading}
				<tr aria-hidden="true">
					<td colspan="5" class="space-y-2 py-2">
						<div class="skeleton"></div>
						<div class="skeleton w-3/4"></div>
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
