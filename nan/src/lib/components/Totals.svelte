<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { motionDuration } from '$lib/motion';
	import { formatCents } from '$lib/domain/money';

	interface Props {
		subtotalCents: number;
		ivaCents: number;
		totalCents: number;
	}

	let { subtotalCents, ivaCents, totalCents }: Props = $props();

	// Count-up: the visible Total eases toward the new value. Presentation only —
	// the tween lands exactly on the integer-cents target, and assistive tech
	// reads the exact value from the sr-only twin, never an intermediate frame.
	const shownTotal = new Tween(0, { duration: motionDuration(650), easing: cubicOut });
	$effect(() => {
		void shownTotal.set(totalCents);
	});
</script>

<!-- The Total is the visual protagonist (design.md hierarchy). Subtotal/IVA
     blink on change; the Total counts and pops. -->
<div>
	<p class="eyebrow">Total del presupuesto</p>
	<p class="mt-3 mb-1 text-[44px] leading-none font-medium tracking-[var(--tracking-tight)]">
		<span class="sr-only" aria-live="polite">{formatCents(totalCents)}</span>
		{#key totalCents}
			<span class="num total-pop" aria-hidden="true">{formatCents(Math.round(shownTotal.current))}</span>
		{/key}
	</p>
	<dl class="mt-5 space-y-2 border-t border-line pt-4">
		<div class="flex items-baseline justify-between gap-4">
			<dt class="text-sm text-fg-2">Subtotal</dt>
			<dd class="table-num text-base">
				{#key subtotalCents}<span class="value-flash">{formatCents(subtotalCents)}</span>{/key}
			</dd>
		</div>
		<div class="flex items-baseline justify-between gap-4">
			<dt class="text-sm text-fg-2">IVA 22%</dt>
			<dd class="table-num text-base">
				{#key ivaCents}<span class="value-flash">{formatCents(ivaCents)}</span>{/key}
			</dd>
		</div>
	</dl>
</div>
