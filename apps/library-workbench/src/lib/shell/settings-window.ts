/**
 * Native settings window control (single instance; `?window=settings` route).
 */

import { notifyError } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import { getVaultPath } from "@/lib/vault/store";
import { setSettingsOpenState, uiStore } from "./ui-store";

export function openSettingsWindow(section: string = "general"): void {
	if (!isTauri()) return;
	void (async () => {
		try {
			const { invoke } = await import("@tauri-apps/api/core");
			await invoke("settings_window_open", {
				section,
				vaultPath: getVaultPath(),
			});
			setSettingsOpenState(true);
		} catch (e) {
			notifyError(String(e));
		}
	})();
}

export function closeSettingsWindow(): void {
	if (!isTauri()) return;
	void (async () => {
		try {
			const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
			const win = await WebviewWindow.getByLabel("settings");
			await win?.close();
		} catch {
			// ignore
		}
	})();
}

export function toggleSettingsWindow(): void {
	if (uiStore.getState().settingsOpen) closeSettingsWindow();
	else openSettingsWindow();
}
