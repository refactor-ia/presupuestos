// Shared decorative-motion preference for the interaction-feedback layer (M-04).
// Svelte transitions run outside CSS, so the prefers-reduced-motion media query
// cannot disable them from the stylesheet: it is consulted once here and every
// decorative duration collapses to 0 under it. CSS animations/transitions are
// disabled for reduced motion directly in app.css.
const QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion: boolean =
	typeof window !== 'undefined' && window.matchMedia(QUERY).matches;

/** Duration (ms) for a decorative motion; 0 when reduced motion is preferred. */
export function motionDuration(ms: number): number {
	return prefersReducedMotion ? 0 : ms;
}
