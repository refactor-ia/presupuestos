<script lang="ts">
	import { prefersReducedMotion } from '$lib/motion';

	interface Props {
		/** Increment to fire a burst; 0 never fires. */
		trigger: number;
	}

	let { trigger }: Props = $props();

	// Brand palette only (refactoria.dev brand-500 and its tints).
	const PALETTE = ['#7127ff', '#a57bff', '#ffffff', '#c9b3ff', '#2c2144'];
	const PIECES = 26;
	const LIFETIME_MS = 1200;

	type Piece = { dx: string; dy: string; rot: string; color: string; delay: string };

	let pieces = $state<Piece[]>([]);
	let clearTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (trigger === 0 || prefersReducedMotion) return;
		pieces = Array.from({ length: PIECES }, (_, i) => {
			const angle = (Math.PI * 2 * i) / PIECES + Math.random() * 0.3;
			const radius = 70 + Math.random() * 70;
			return {
				dx: `${Math.round(Math.cos(angle) * radius)}px`,
				dy: `${Math.round(Math.sin(angle) * radius - 30)}px`,
				rot: `${Math.round(Math.random() * 540)}deg`,
				color: PALETTE[i % PALETTE.length],
				delay: `${Math.round(Math.random() * 80)}ms`
			};
		});
		clearTimeout(clearTimer);
		clearTimer = setTimeout(() => (pieces = []), LIFETIME_MS);
		return () => clearTimeout(clearTimer);
	});
</script>

<span class="pointer-events-none absolute top-1/2 left-1/2 size-0" aria-hidden="true">
	{#each pieces as piece, i (`${trigger}-${i}`)}
		<i
			class="confetti-piece"
			style:--dx={piece.dx}
			style:--dy={piece.dy}
			style:--rot={piece.rot}
			style:background={piece.color}
			style:animation-delay={piece.delay}
		></i>
	{/each}
</span>
