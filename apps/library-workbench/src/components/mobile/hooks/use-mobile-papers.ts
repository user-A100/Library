import { useCallback, useEffect, useState } from "react";
import { bridgeRpc } from "@/lib/bridge/client";
import type { PaperMetadata } from "@/lib/paper/types";

const PAPERS_POLL_INTERVAL_MS = 10_000;

/**
 * Keeps the paper list fresh over the bridge: fetch on connect, refresh when
 * the app becomes visible, and poll while the library tab is shown.
 */
export function useMobilePapers({
	paired,
	connected,
	libraryVisible,
}: {
	paired: boolean;
	connected: boolean;
	libraryVisible: boolean;
}) {
	const [papers, setPapers] = useState<PaperMetadata[]>([]);
	const [loading, setLoading] = useState(false);

	const refresh = useCallback(async () => {
		if (!paired || !connected) return;
		setLoading(true);
		try {
			const next = await bridgeRpc<PaperMetadata[]>("paper_list");
			setPapers(next);
		} catch {
			// Keep the last successful list during a transient bridge failure.
		} finally {
			setLoading(false);
		}
	}, [connected, paired]);

	useEffect(() => {
		if (!paired) {
			setPapers([]);
			setLoading(false);
			return;
		}
		if (!connected) return;

		void refresh();
		const refreshWhenVisible = () => {
			if (document.visibilityState === "visible") void refresh();
		};
		window.addEventListener("focus", refreshWhenVisible);
		document.addEventListener("visibilitychange", refreshWhenVisible);
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible" && libraryVisible) {
				void refresh();
			}
		}, PAPERS_POLL_INTERVAL_MS);

		return () => {
			window.removeEventListener("focus", refreshWhenVisible);
			document.removeEventListener("visibilitychange", refreshWhenVisible);
			window.clearInterval(interval);
		};
	}, [libraryVisible, connected, paired, refresh]);

	return { papers, loading };
}
