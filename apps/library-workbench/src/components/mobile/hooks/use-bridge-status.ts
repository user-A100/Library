import { useEffect, useState } from "react";
import {
	type BridgeClientStatus,
	bridgeResume,
	bridgeStatus,
	listenBridgeStatus,
	listenPairPending,
	type PairPendingEvent,
} from "@/lib/bridge/client";
import { isTauri } from "@/lib/core/tauri";

/**
 * Subscribes to the native bridge status, resumes the saved pairing on
 * launch, and re-checks whenever the app returns to the foreground.
 */
export function useBridgeStatus() {
	const [status, setStatus] = useState<BridgeClientStatus>({
		connected: false,
		paired: false,
	});
	const [pairPending, setPairPending] = useState<PairPendingEvent | null>(null);

	useEffect(() => {
		if (!isTauri()) return;
		let active = true;
		const unlisten: Array<() => void> = [];
		const resume = async () => {
			try {
				const [offStatus, offPairPending] = await Promise.all([
					listenBridgeStatus((next) => active && setStatus(next)),
					listenPairPending((next) => active && setPairPending(next)),
				]);
				if (!active) {
					offStatus();
					offPairPending();
					return;
				}
				unlisten.push(offStatus, offPairPending);
				const next = await bridgeResume().catch(() => bridgeStatus());
				if (active) setStatus(next);
			} catch {
				// Keep the pairing screen usable when the native bridge is unavailable.
			}
		};
		void resume();

		const onVisible = () => {
			if (document.visibilityState !== "visible" || !active) return;
			void bridgeStatus()
				.then((next) => {
					if (active) setStatus(next);
					if (active && next.paired && !next.connected) {
						return bridgeResume().then((resumed) => {
							if (active) setStatus(resumed);
						});
					}
					return undefined;
				})
				.catch(() => undefined);
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			active = false;
			document.removeEventListener("visibilitychange", onVisible);
			for (const off of unlisten) off();
		};
	}, []);

	return { status, setStatus, pairPending };
}
