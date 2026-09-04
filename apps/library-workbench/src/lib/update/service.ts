import type { Update } from "@tauri-apps/plugin-updater";
import { errorText } from "@/lib/core/error";
import { logger } from "@/lib/core/logger";
import { isTauri } from "@/lib/core/tauri";
import { ensureSettingsLoaded } from "@/lib/settings/store";
import type { UpdateSnapshot } from "@/lib/update/types";

const UNSUPPORTED: UpdateSnapshot = { phase: "unsupported" };

let snapshot: UpdateSnapshot = isUpdaterSupported()
	? { phase: "idle" }
	: UNSUPPORTED;
let availableUpdate: Update | null = null;
let checkPromise: Promise<UpdateSnapshot> | null = null;
let installPromise: Promise<UpdateSnapshot> | null = null;
const listeners = new Set<(next: UpdateSnapshot) => void>();

function isUpdaterSupported(): boolean {
	return isTauri() && !import.meta.env.DEV;
}

/**
 * Settings → General → network proxy, which the updater plugin would otherwise
 * ignore: it ships its own reqwest client instead of Host `network::client_builder`.
 * When the app proxy is off, fall back to the OS system proxy detected by the
 * Host (Windows "Internet Settings") — same fallback Host requests use.
 */
async function resolveProxyUrl(): Promise<string | undefined> {
	const settings = await ensureSettingsLoaded();
	let url: string | undefined;
	if (settings.networkProxyEnabled) {
		url = settings.networkProxyUrl.trim() || undefined;
	} else {
		try {
			const { invokeApi } = await import("@/lib/core/ipc");
			url =
				(await invokeApi<string | null>("network_system_proxy")) ?? undefined;
		} catch {
			url = undefined;
		}
	}
	if (!url) return undefined;
	// The plugin's client has no SOCKS support, so forwarding such a URL would
	// fail every check — even where a direct connection still works.
	if (!/^https?:\/\//i.test(url)) {
		logger.warn(`updater_check proxy_unsupported scheme=${url.split(":")[0]}`);
		return undefined;
	}
	return url;
}

function emit(next: UpdateSnapshot): UpdateSnapshot {
	snapshot = next;
	for (const listener of listeners) listener(snapshot);
	return snapshot;
}

async function closeAvailableUpdate(): Promise<void> {
	const update = availableUpdate;
	availableUpdate = null;
	if (!update) return;
	try {
		await update.close();
	} catch {
		// The native resource may already have been released by a failed download.
	}
}

export function getUpdateSnapshot(): UpdateSnapshot {
	return { ...snapshot };
}

export function subscribeUpdate(
	listener: (next: UpdateSnapshot) => void,
): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * Queries the signed updater endpoint. It never throws so a background check
 * cannot affect application startup; callers render the returned state instead.
 */
export async function checkForUpdate(): Promise<UpdateSnapshot> {
	if (!isUpdaterSupported()) return emit(UNSUPPORTED);
	if (checkPromise) return checkPromise;

	checkPromise = (async () => {
		await closeAvailableUpdate();
		emit({ phase: "checking" });
		const proxy = await resolveProxyUrl();
		logger.info(`op start updater_check proxy=${proxy ? "on" : "off"}`);
		try {
			const { check } = await import("@tauri-apps/plugin-updater");
			// The returned Update carries this proxy into the later download.
			const update = await check({ timeout: 10_000, proxy });
			if (!update) {
				logger.info("op end updater_check ok=true available=false");
				return emit({ phase: "up-to-date" });
			}
			availableUpdate = update;
			logger.info("op end updater_check ok=true available=true", {
				version: update.version,
			});
			return emit({
				phase: "available",
				currentVersion: update.currentVersion,
				availableVersion: update.version,
				notes: update.body,
			});
		} catch (error) {
			logger.warn("op end updater_check ok=false", {
				error: errorText(error),
			});
			return emit({ phase: "error", errorOperation: "check" });
		} finally {
			checkPromise = null;
		}
	})();

	return checkPromise;
}

/** Downloads the verified updater package, installs it, then restarts the app. */
export async function installAvailableUpdate(): Promise<UpdateSnapshot> {
	if (!isUpdaterSupported()) return emit(UNSUPPORTED);
	if (installPromise) return installPromise;
	if (!availableUpdate)
		return emit({ phase: "error", errorOperation: "install" });

	const update = availableUpdate;
	installPromise = (async () => {
		logger.info("op start updater_install", { version: update.version });
		let downloadedBytes = 0;
		let totalBytes: number | undefined;
		emit({
			phase: "downloading",
			currentVersion: update.currentVersion,
			availableVersion: update.version,
			notes: update.body,
			downloadedBytes,
		});
		try {
			await update.download((event) => {
				if (event.event === "Started") {
					totalBytes = event.data.contentLength;
				} else if (event.event === "Progress") {
					downloadedBytes += event.data.chunkLength;
				}
				emit({
					phase: "downloading",
					currentVersion: update.currentVersion,
					availableVersion: update.version,
					notes: update.body,
					downloadedBytes,
					totalBytes,
				});
			});
			emit({
				phase: "installing",
				currentVersion: update.currentVersion,
				availableVersion: update.version,
				notes: update.body,
			});
			await update.install();
			logger.info("op end updater_install ok=true", {
				version: update.version,
			});
			const { relaunch } = await import("@tauri-apps/plugin-process");
			await relaunch();
			return getUpdateSnapshot();
		} catch (error) {
			logger.error("op end updater_install ok=false", {
				version: update.version,
				error: errorText(error),
			});
			await closeAvailableUpdate();
			return emit({ phase: "error", errorOperation: "install" });
		} finally {
			installPromise = null;
		}
	})();

	return installPromise;
}
