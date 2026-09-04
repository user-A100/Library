/**
 * CLI install status and PATH shim management (Settings → About).
 * Install may use a local/dev binary or download the same app version from GitHub Releases.
 */

import { invoke } from "@tauri-apps/api/core";
import { type ApiResult, invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";

export type CliInstallStatus = {
	appVersion: string;
	bundledVersion: string | null;
	bundledPath: string | null;
	/** `bundled` | `managed` | `dev` when a binary is resolved */
	source: string | null;
	cliVersion: string | null;
	downloadUrl: string | null;
	releasePageUrl: string;
	canInstall: boolean;
	installed: boolean;
	installPath: string | null;
	shimCurrent: boolean;
	preferredBinDir: string;
	preferredBinOnPath: boolean;
	/** `brew` executable detected (PATH or standard Homebrew roots) */
	brewAvailable: boolean;
	/** Command users type after install (`agentero-cli` on Windows, `agentero` elsewhere) */
	commandName: string;
	message: string | null;
};

export type CliInstallResult = {
	status: CliInstallStatus;
	action: string;
};

export function fetchCliInstallStatus(): Promise<CliInstallStatus> {
	return invokeApi<CliInstallStatus>("cli_install_status", undefined, {
		fallback: "Failed to read CLI install status",
	});
}

export function installCliCommand(): Promise<CliInstallResult> {
	return invokeApi<CliInstallResult>("cli_install_command", undefined, {
		fallback: "Failed to install CLI command",
	});
}

export function uninstallCliCommand(): Promise<CliInstallResult> {
	return invokeApi<CliInstallResult>("cli_uninstall_command", undefined, {
		fallback: "Failed to remove CLI command",
	});
}

export type FinderServiceStatus = {
	/** Quick Action integration exists only on macOS */
	supported: boolean;
	installed: boolean;
	installPath: string | null;
	appBundlePath: string | null;
	/** installed && baked-in bundle matches the current app bundle */
	current: boolean;
	message: string | null;
};

export function fetchFinderServiceStatus(): Promise<FinderServiceStatus> {
	return invokeApi<FinderServiceStatus>("finder_service_status", undefined, {
		fallback: "Failed to read Finder service status",
	});
}

export function installFinderService(): Promise<FinderServiceStatus> {
	return invokeApi<FinderServiceStatus>("finder_service_install", undefined, {
		fallback: "Failed to install Finder service",
	});
}

export function uninstallFinderService(): Promise<FinderServiceStatus> {
	return invokeApi<FinderServiceStatus>("finder_service_uninstall", undefined, {
		fallback: "Failed to remove Finder service",
	});
}

/** Consume Host-queued vault path from a cold-start deep link (null if none). */
export async function takePendingVaultOpen(): Promise<string | null> {
	if (!isTauri()) return null;
	const res = await invoke<ApiResult<string | null>>("vault_open_take_pending");
	if (!res.ok) return null;
	// `data: null` means no pending path (not a failure).
	return res.data ?? null;
}
