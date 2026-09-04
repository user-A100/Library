import { emit } from "@/lib/lifecycle/bus";
import type { LifecycleEvent, LifecycleEventMap } from "@/lib/lifecycle/events";

const WIRE_EVENTS = [
	"window:closed",
	"paper:imported",
	"paper:assets-ready",
	"paper:renamed",
	"job:completed",
	"job:failed",
	"agent:registry-changed",
] as const satisfies readonly LifecycleEvent[];

let bridgePromise: Promise<Array<() => void>> | null = null;
let consumers = 0;

/** Forwards Tauri wire lifecycle events into the frontend bus. Idempotent;
 *  the returned disposer waits for pending `listen` calls before unlistening. */
export function initLifecycleBridge(): () => void {
	consumers += 1;
	if (!bridgePromise) {
		bridgePromise = (async () => {
			const { listen } = await import("@tauri-apps/api/event");
			return Promise.all(
				WIRE_EVENTS.map((event) =>
					listen<LifecycleEventMap[typeof event]>(event, (e) => {
						void emit(event, e.payload);
					}),
				),
			);
		})();
	}
	const pending = bridgePromise;
	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		consumers -= 1;
		void pending.then((unlistens) => {
			if (consumers > 0 || bridgePromise !== pending) return;
			bridgePromise = null;
			for (const unlisten of unlistens) unlisten();
		});
	};
}
