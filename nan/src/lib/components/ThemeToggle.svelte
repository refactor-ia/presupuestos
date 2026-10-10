<script lang="ts">
	import { onDestroy } from 'svelte';

	// Dark is the initial theme: html.dark is already set in app.html, so the
	// initial component state matches the document (no hydration mismatch).
	// Session-scoped only: the preference is never persisted (SC-10, SC-11).
	let dark = $state(true);

	// Global color cross-fade on toggle (feedback matrix: no hard cut). The
	// .theme-transition class eases every color token (see app.css). The flip is
	// deferred two animation frames so the transition rule is committed AND
	// painted before the theme class changes — otherwise both changes can land
	// in one style recalculation and hard-cut. The class is removed right after
	// so everyday hover transitions stay cheap.
	let themeTimer: ReturnType<typeof setTimeout> | undefined;

	function toggleTheme(): void {
		const root = document.documentElement;
		root.classList.add('theme-transition');
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				dark = !dark;
				root.classList.toggle('dark', dark);
				clearTimeout(themeTimer);
				themeTimer = setTimeout(() => root.classList.remove('theme-transition'), 480);
			});
		});
	}

	onDestroy(() => clearTimeout(themeTimer));

	const label = $derived(dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
</script>

<button type="button" class="btn-icon" onclick={toggleTheme} aria-label={label} title={label}>
	<!-- One glyph that rotates through the switch: sun while dark (go light), moon while light. -->
	<span class="theme-icon inline-flex" class:theme-icon-light={!dark}>
		{#if dark}
			<svg xmlns="http://www.w3.org/2000/svg" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="12" cy="12" r="4.2" />
				<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
			</svg>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
			</svg>
		{/if}
	</span>
</button>
