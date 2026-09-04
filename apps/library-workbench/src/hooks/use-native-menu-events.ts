import { useTauriEvent } from "@/hooks/use-tauri-event";

type NativeMenuHandlers = {
	onSettings: () => void;
	onOpenVault: () => void;
	onCreateVault: () => void;
	onRefresh: () => void;
	onToggleSidebar: () => void;
	onSplitPane: () => void;
	onToggleChat: () => void;
	onCloseTabOrWindow: () => void;
};

/**
 * Subscribe to the desktop native menu bar events (Agentero → Settings…, File,
 * View). No-op outside the Tauri shell. `new_window` is handled natively in Rust.
 */
export function useNativeMenuEvents(handlers: NativeMenuHandlers): void {
	useTauriEvent<{ action: string }>("menu:invoked", (payload) => {
		switch (payload?.action) {
			case "settings":
				handlers.onSettings();
				break;
			case "open_vault":
				handlers.onOpenVault();
				break;
			case "create_vault":
				handlers.onCreateVault();
				break;
			case "refresh_tree":
				handlers.onRefresh();
				break;
			case "toggle_sidebar":
				handlers.onToggleSidebar();
				break;
			case "split_pane":
				handlers.onSplitPane();
				break;
			case "toggle_chat":
				handlers.onToggleChat();
				break;
			// File → Close / ⌘W (macOS menu accelerator; keydown also handles
			// non-macOS)
			case "close_tab_or_window":
				handlers.onCloseTabOrWindow();
				break;
		}
	});
}
