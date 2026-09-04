import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import i18n from "@/i18n";
import {
	completeBackgroundTask,
	failBackgroundTask,
	startBackgroundTask,
	updateBackgroundTask,
} from "@/lib/core/background-tasks";
import { errorText } from "@/lib/core/error";
import { invokeApi } from "@/lib/core/ipc";
import { logger } from "@/lib/core/logger";
import { isTauri } from "@/lib/core/tauri";

/** Must match Host `LAYOUT_MODEL_TASK_ID`. */
export const LAYOUT_MODEL_TASK_ID = "layout-model";

export type LayoutModelStatus = {
	ready: boolean;
	path: string;
	sizeBytes: number;
	source: string | null;
	fileName: string;
};

type LayoutModelTaskEvent = {
	taskId: string;
	status: "running" | "completed" | "failed" | "cancelled" | string;
	progress?: number | null;
	detail?: string | null;
	error?: string | null;
	source?: string | null;
};

/** Local custom-protocol URL for the XDG-cached ONNX (Host serves the file). */
export function layoutModelLocalUrl(fileName = "pp-doclayoutv3.onnx"): string {
	const origin = navigator.userAgent.includes("Windows")
		? "http://agentero-model.localhost"
		: "agentero-model://localhost";
	return `${origin}/${fileName}`;
}

export async function getLayoutModelStatus(): Promise<LayoutModelStatus | null> {
	if (!isTauri()) return null;
	return invokeApi<LayoutModelStatus>("layout_model_status");
}

function ensurePanelRow(
	detail?: string | null,
	progress?: number | null,
): void {
	startBackgroundTask({
		id: LAYOUT_MODEL_TASK_ID,
		kind: "download",
		title: i18n.t("app:tasks.layoutModelDownload"),
		detail: detail ?? i18n.t("app:tasks.layoutModelDetail"),
		progress: progress === undefined ? 0 : progress,
	});
}

/**
 * Map Host `layout-model:task` / progress into the IDE background-tasks panel.
 * Call once from the main shell (Host may already be downloading on startup).
 */
export async function attachLayoutModelTaskListener(): Promise<UnlistenFn> {
	if (!isTauri()) return () => {};

	const unlisten = await listen<LayoutModelTaskEvent>(
		"layout-model:task",
		(event) => {
			const p = event.payload;
			if (!p?.taskId || p.taskId !== LAYOUT_MODEL_TASK_ID) return;

			const status = (p.status ?? "").toLowerCase();
			if (status === "running") {
				ensurePanelRow(p.detail, p.progress ?? 0);
				updateBackgroundTask(LAYOUT_MODEL_TASK_ID, {
					status: "running",
					detail: p.detail ?? undefined,
					progress: typeof p.progress === "number" ? p.progress : undefined,
				});
				return;
			}
			if (status === "completed") {
				ensurePanelRow(p.detail, 100);
				completeBackgroundTask(
					LAYOUT_MODEL_TASK_ID,
					p.detail ?? i18n.t("app:tasks.layoutModelDetail"),
				);
				return;
			}
			if (status === "cancelled") {
				updateBackgroundTask(LAYOUT_MODEL_TASK_ID, {
					status: "cancelled",
					detail: i18n.t("app:tasks.cancelled"),
				});
				return;
			}
			if (status === "failed") {
				ensurePanelRow(p.error ?? p.detail, null);
				failBackgroundTask(
					LAYOUT_MODEL_TASK_ID,
					p.error ?? p.detail ?? i18n.t("app:tasks.layoutModelDownload"),
				);
			}
		},
	);

	return unlisten;
}

/** Single-flight so Host startup + analyze share one download wait. */
let ensureInFlight: Promise<LayoutModelStatus | null> | null = null;

/**
 * Ensure PP-DocLayoutV3 is on disk under XDG cache.
 * If missing, joins / starts the Host download shown in the background-tasks panel.
 */
export async function ensureLayoutModel(): Promise<LayoutModelStatus | null> {
	if (!isTauri()) return null;
	if (!ensureInFlight) {
		ensureInFlight = (async () => {
			try {
				const existing = await getLayoutModelStatus();
				if (existing?.ready) return existing;
			} catch {
				// Fall through to ensure (command may still download).
			}

			ensurePanelRow();
			try {
				const result = await invokeApi<LayoutModelStatus>(
					"layout_model_ensure",
					{ progressTaskId: LAYOUT_MODEL_TASK_ID },
				);
				if (result.ready) {
					completeBackgroundTask(
						LAYOUT_MODEL_TASK_ID,
						result.source
							? `${result.source} · ${result.sizeBytes} bytes`
							: undefined,
					);
				}
				return result;
			} catch (e) {
				const msg = errorText(e);
				if (msg.includes("cancelled")) {
					updateBackgroundTask(LAYOUT_MODEL_TASK_ID, {
						status: "cancelled",
						detail: i18n.t("app:tasks.cancelled"),
					});
				} else {
					failBackgroundTask(LAYOUT_MODEL_TASK_ID, msg);
				}
				throw e;
			}
		})().finally(() => {
			ensureInFlight = null;
		});
	}
	return ensureInFlight;
}

/**
 * Wire panel listener + kick ensure if the model is still missing.
 * Safe to call once from App mount (Host may already be downloading).
 */
export function prefetchLayoutModel(): void {
	if (!isTauri()) return;
	void (async () => {
		try {
			const s = await getLayoutModelStatus();
			if (s?.ready) return;
			// Show a row immediately; Host startup download may already be running.
			ensurePanelRow();
			await ensureLayoutModel();
		} catch (e) {
			const msg = errorText(e);
			if (msg.includes("cancelled")) return;
			logger.warn("layout model prefetch failed", { error: msg });
		}
	})();
}
