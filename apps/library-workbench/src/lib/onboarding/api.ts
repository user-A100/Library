/**
 * Cross-window onboarding request (Settings → main).
 * Settings emits a Tauri event; the main window forces the wizard open.
 */

import { isTauri } from "@/lib/core/tauri";
import { broadcastSafe } from "@/lib/core/tauri-events";

export const ONBOARDING_REQUEST_EVENT = "onboarding:request";

/** Settings (or any window): ask main to reopen the first-run wizard. */
export function broadcastOnboardingRequest(): void {
	broadcastSafe(ONBOARDING_REQUEST_EVENT);
}

/** Main window only: resolve when the wizard should be force-opened. */
export async function listenOnboardingRequest(
	handler: () => void,
): Promise<() => void> {
	if (!isTauri()) return () => {};
	const { listen } = await import("@tauri-apps/api/event");
	return listen<unknown>(ONBOARDING_REQUEST_EVENT, () => {
		handler();
	});
}

export const TOUR_REQUEST_EVENT = "tour:request";

/** Settings (or any window): ask main to replay the feature tour. */
export function broadcastTourRequest(): void {
	broadcastSafe(TOUR_REQUEST_EVENT);
}

/** Main window only: resolve when the feature tour should be replayed. */
export async function listenTourRequest(
	handler: () => void,
): Promise<() => void> {
	if (!isTauri()) return () => {};
	const { listen } = await import("@tauri-apps/api/event");
	return listen<unknown>(TOUR_REQUEST_EVENT, () => {
		handler();
	});
}
