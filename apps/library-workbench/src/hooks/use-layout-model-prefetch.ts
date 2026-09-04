/**
 * Attach Host layout-model download to the IDE background-tasks panel.
 * Host may already be downloading on startup (`layout-model` task id).
 */
import { useEffect } from "react";
import { isTauri } from "@/lib/core/tauri";
import {
	attachLayoutModelTaskListener,
	prefetchLayoutModel,
} from "@/lib/pdf/layout/model";

export function useLayoutModelPrefetch(): void {
	useEffect(() => {
		if (!isTauri()) return;
		let disposed = false;
		let unlisten: (() => void) | undefined;

		void (async () => {
			const u = await attachLayoutModelTaskListener();
			if (disposed) {
				u();
				return;
			}
			unlisten = u;
			prefetchLayoutModel();
		})();

		return () => {
			disposed = true;
			unlisten?.();
		};
	}, []);
}
