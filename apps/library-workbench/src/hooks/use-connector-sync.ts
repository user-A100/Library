/**
 * Zotero Connector server sync: bind the active vault + Library folder scope,
 * honor the settings toggle, and surface save/progress events as background
 * tasks. Extracted from App so connector traffic never re-renders the shell.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	useLibraryStore,
	useSettings,
	useVaultStore,
} from "@/hooks/use-app-stores";
import {
	completeBackgroundTask,
	failBackgroundTask,
	startBackgroundTask,
	updateBackgroundTask,
} from "@/lib/core/background-tasks";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import { listenSafe } from "@/lib/core/tauri-events";
import {
	type ConnectorItemSaved,
	type ConnectorProgress,
	connectorSetEnabled,
	connectorSetParentDir,
	connectorSetVault,
} from "@/lib/paper/import/connector";
import { scheduleLibraryRefresh } from "@/lib/paper/library-store";
import { joinVaultPath } from "@/lib/vault";
import { getVaultPath, scheduleTreeRefresh } from "@/lib/vault/store";
import { openPaper } from "@/lib/workspace/actions";

export function useConnectorSync(): void {
	const { t } = useTranslation(["app", "sidebar"]);
	const vaultPath = useVaultStore((s) => s.vaultPath);
	const libraryScopePath = useLibraryStore((s) => s.scopePath);
	const connectorEnabled = useSettings((s) => s.connectorEnabled);
	const progressTasksRef = useRef(new Map<string, string>());

	// Sync active vault into the Connector server (save target).
	useEffect(() => {
		if (!isTauri()) return;
		void connectorSetVault(vaultPath).catch((e) => {
			console.warn("[connector] setVault failed", e);
		});
	}, [vaultPath]);

	// Mirror Library folder scope → Connector default collection.
	useEffect(() => {
		if (!isTauri() || !connectorEnabled) return;
		const scope = libraryScopePath
			?.replace(/\\/g, "/")
			.replace(/^\/+|\/+$/g, "");
		const parent =
			scope && (scope === "papers" || scope.startsWith("papers/"))
				? scope
				: "papers";
		void connectorSetParentDir(parent).catch(() => {
			/* ignore */
		});
	}, [libraryScopePath, connectorEnabled]);

	// Restore Connector server from settings on launch / toggle.
	useEffect(() => {
		if (!isTauri()) return;
		void connectorSetEnabled(connectorEnabled)
			.then(async (st) => {
				if (connectorEnabled && st.lastError) {
					notifyError(st.lastError);
				}
				// After the HTTP server starts, re-bind vault (Host may be unbound).
				if (connectorEnabled && getVaultPath()) {
					try {
						await connectorSetVault(getVaultPath());
					} catch (e) {
						console.warn("[connector] re-bind vault after enable failed", e);
					}
				}
			})
			.catch((e) => {
				notifyError(errorText(e));
			});
	}, [connectorEnabled]);

	// Refresh tree/library when the Connector saves into the vault; open the
	// paper tab (same as magic-wand import).
	useEffect(() => {
		const offs = [
			listenSafe<ConnectorItemSaved>("connector:item-saved", (p) => {
				const vault = getVaultPath();
				if (vault) {
					// Debounced: import saves coalesce with the paper:imported
					// handler; non-import saves (upload, move) still refresh here.
					scheduleTreeRefresh();
					scheduleLibraryRefresh();
				}
				// Open/focus the paper tab (metadata save, upload, or move).
				const rel = (p?.path ?? "")
					.replace(/\\/g, "/")
					.replace(/^\/+|\/+$/g, "");
				if (vault && rel) {
					openPaper(joinVaultPath(vault, rel));
				}
			}),
			listenSafe<ConnectorProgress>("connector:progress", (p) => {
				if (!p?.key) return;
				let taskId = progressTasksRef.current.get(p.key);
				if (!taskId) {
					taskId = startBackgroundTask({
						kind: "connector",
						title: p.title || t("app:tasks.connector"),
						detail: p.detail ?? undefined,
						progress: p.progress ?? null,
					});
					progressTasksRef.current.set(p.key, taskId);
				} else {
					updateBackgroundTask(taskId, {
						detail: p.detail ?? undefined,
						progress: p.progress ?? null,
					});
				}
				if (p.status === "completed") {
					completeBackgroundTask(
						taskId,
						p.detail ?? t("app:tasks.connectorComplete"),
					);
					progressTasksRef.current.delete(p.key);
				} else if (p.status === "failed") {
					failBackgroundTask(
						taskId,
						p.error ?? p.detail ?? t("app:tasks.connectorFailed"),
					);
					progressTasksRef.current.delete(p.key);
				}
			}),
			listenSafe<{ message?: string }>("connector:error", (payload) => {
				const msg = payload?.message?.trim();
				if (msg) notifyError(msg);
			}),
		];
		return () => {
			for (const off of offs) off();
		};
	}, [t]);
}
