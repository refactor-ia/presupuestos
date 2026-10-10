<script lang="ts">
	import { fly } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { motionDuration } from '$lib/motion';

	interface Props {
		/** Message to show; null hides the toast. A new `seq` replays the entrance. */
		text: string | null;
		seq: number;
	}

	let { text, seq }: Props = $props();
</script>

<!-- Transient confirmation (reward layer). The status role announces it; the
     same information also lives in the reserved feedback slots, so the toast
     is never the only channel. -->
<div class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" role="status" aria-live="polite">
	{#if text !== null}
		{#key seq}
			<div
				class="flex max-w-full items-center gap-2.5 rounded-[var(--radius-round)] py-3 pr-5 pl-3.5 text-sm font-medium shadow-[0_18px_50px_-12px_rgb(11_7_20/0.6)]"
				style="background: var(--toast-bg); color: var(--toast-fg);"
				in:fly={{ y: 24, duration: motionDuration(450), easing: backOut }}
				out:fly={{ y: 12, duration: motionDuration(200) }}
			>
				<span class="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg">
					<svg class="check-draw size-3" viewBox="0 0 16 16" aria-hidden="true">
						<path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</span>
				<span class="truncate">{text}</span>
			</div>
		{/key}
	{/if}
</div>
