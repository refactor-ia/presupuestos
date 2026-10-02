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
				themeTimer = setTimeout(() => root.classList.remove('theme-transition'), 320);
			});
		});
	}

	onDestroy(() => clearTimeout(themeTimer));

	const label = $derived(dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
</script>

<button type="button" class="btn btn-secondary" onclick={toggleTheme} aria-label={label} title={label}>
	{#if dark}
		<!-- Sun: switching to light -->
		<svg xmlns="http://www.w3.org/2000/svg" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
		</svg>
	{:else}
		<!-- Moon: switching to dark -->
		<svg xmlns="http://www.w3.org/2000/svg" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
		</svg>
	{/if}
	<span aria-hidden="true">{dark ? 'Claro' : 'Oscuro'}</span>
</button>
