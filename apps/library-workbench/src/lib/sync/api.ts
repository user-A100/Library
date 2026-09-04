/**
 * Vault cloud sync (S3-compatible) — Host command wrappers + event names.
 * Design: docs/development/cloud-sync-s3.md
 */

import { invokeApi } from "@/lib/core/ipc";

export const SYNC_STATE_EVENT = "sync:state";
export const SYNC_PROGRESS_EVENT = "sync:progress";

/**
 * Which bulky paper assets take part in sync. Notes, metadata sidecars,
 * marks and embedded images always sync — they are small and irreplaceable,
 * while PDFs / LaTeX sources can be re-fetched from their upstream source.
 */
export type SyncScope = {
	pdf: boolean;
	source: boolean;
	attachments: boolean;
};

export type SyncBackendConfig = {
	endpoint: string;
	region: string;
	bucket: string;
	prefix: string;
	accessKey: string;
	/** Masked (`***`) on the way out; send the mask back to keep the secret. */
	secretKey: string;
	forcePathStyle: boolean;
	/** Background sync: on open, after 30s quiet, and every intervalMinutes. */
	autoSync: boolean;
	intervalMinutes: number;
	/** Detected on connect: false when the backend rejects conditional PUTs. */
	conditionalWrites: boolean;
	/** Sync scope for bulky paper assets (default: everything). */
	scope: SyncScope;
};

export type SyncStatus = {
	configured: boolean;
	config?: SyncBackendConfig;
	running: boolean;
	lastSyncAt?: string;
	lastVersion: number;
};

export type SyncOutcome = {
	version: number;
	uploaded: number;
	downloaded: number;
	deletedLocal: number;
	removedRemote: number;
	conflictCopies: string[];
};

export type SyncStateEvent = {
	vaultPath: string;
	status: "syncing" | "idle" | "error";
	error?: string;
};

export type SyncProgressEvent = {
	vaultPath: string;
	phase: "scan" | "pull" | "download" | "upload" | "finalize";
	current: number;
	total: number;
};

export const emptySyncConfig = (): SyncBackendConfig => ({
	endpoint: "",
	region: "us-east-1",
	bucket: "",
	prefix: "",
	accessKey: "",
	secretKey: "",
	forcePathStyle: true,
	autoSync: true,
	intervalMinutes: 30,
	conditionalWrites: true,
	scope: { pdf: true, source: true, attachments: true },
});

/** Interval choices shared with the Host (`config::INTERVAL_CHOICES`). */
export const SYNC_INTERVAL_CHOICES = [15, 30, 60];

/** Local disk usage per bulky-asset category (bytes). */
export type SyncScopeSizes = {
	pdf: number;
	source: number;
	attachments: number;
};

export function syncGetStatus(vaultPath: string): Promise<SyncStatus> {
	return invokeApi("sync_get_status", { args: { vaultPath } });
}

export function syncScopeSizes(vaultPath: string): Promise<SyncScopeSizes> {
	return invokeApi("sync_scope_sizes", { args: { vaultPath } });
}

export function syncConfigure(
	vaultPath: string,
	config: SyncBackendConfig,
): Promise<SyncStatus> {
	return invokeApi("sync_configure", { args: { vaultPath, config } });
}

export function syncDisconnect(vaultPath: string): Promise<void> {
	return invokeApi(
		"sync_disconnect",
		{ args: { vaultPath } },
		{
			allowVoid: true,
		},
	);
}

export function syncNow(vaultPath: string): Promise<SyncOutcome> {
	return invokeApi("sync_now", { args: { vaultPath } });
}
