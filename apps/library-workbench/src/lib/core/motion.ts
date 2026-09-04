/**
 * Motion helpers for JS-driven animation.
 *
 * The `prefers-reduced-motion` block in index.css only caps CSS transitions and
 * keyframes. `scrollIntoView({ behavior })`, virtualizer scrolls and motion/react
 * animations are invisible to it, so every JS-driven motion has to ask here.
 */

export function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Behavior for programmatic scrolling ("auto" lands on the target immediately). */
export function scrollBehavior(): ScrollBehavior {
	return prefersReducedMotion() ? "auto" : "smooth";
}
