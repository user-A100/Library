import { isTauri } from "@/lib/core/tauri";

export type TauriEventHandler<T> = (payload: T) => void;

/**
 * Wrap a promise-returning subscribe so its disposer is safe to call at any
 * time, including before the subscribe resolves.
 *
 * Subscribing needs a round-trip, so the naive
 * `let off; void subscribe().then((o) => { off = o }); return () => off?.()`
 * shape leaks the listener forever whenever the caller disposes before that
 * round-trip lands — which StrictMode makes happen on every dev mount.
 * Chaining the disposer off the pending promise is always correct.
 */
export function toSafeDisposer(pending: Promise<() => void>): () => void {
	// Keep a terminal branch so a failed subscribe never surfaces as an
	// unhandled rejection when nobody disposes.
	pending.catch(() => undefined);
	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		void pending.then((off) => off()).catch(() => undefined);
	};
}

/** Subscribe to a global Tauri wire event. No-op outside the Tauri shell. */
export function listenSafe<T>(
	event: string,
	handler: TauriEventHandler<T>,
): () => void {
	if (!isTauri()) return () => undefined;
	return toSafeDisposer(
		import("@tauri-apps/api/event").then(({ listen }) =>
			listen<T>(event, (e) => handler(e.payload)),
		),
	);
}

/** Emit a global Tauri wire event. No-op outside the Tauri shell; failures are non-fatal. */
export function broadcastSafe(event: string, payload?: unknown): void {
	if (!isTauri()) return;
	void (async () => {
		try {
			const { emit } = await import("@tauri-apps/api/event");
			await emit(event, payload);
		} catch {
			// non-fatal
		}
	})();
}
