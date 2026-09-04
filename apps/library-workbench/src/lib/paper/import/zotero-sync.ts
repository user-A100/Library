/**
 * Bidirectional Zotero sync API (Host `zotero_sync`).
 * Pull: metadata fill / child notes / annotations → vault.
 * Push: NOTES.md → Agentero-marked Zotero child note (offline write,
 * Zotero must be closed; mandatory backup). See docs/backend/identifier-lookup.md §17.
 */

import { Channel } from "@tauri-apps/api/core";
import i18n from "@/i18n";
import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";

export type ZoteroSyncPhase = "read" | "pull" | "push";

export type ZoteroSyncConflict = {
	paperPath: string;
	title: string;
	reason: string;
};

export type ZoteroSyncResult = {
	linked: number;
	unlinked: number;
	metadataFilled: number;
	notesPulled: number;
	annotationsPulled: number;
	notesPushed: number;
	linkageBackfilled: number;
	conflicts: ZoteroSyncConflict[];
	errors: string[];
};

/** Run one bidirectional sync pass. */
export async function syncZotero(opts: {
	vaultPath: string;
	zoteroDir: string;
	pullMetadata: boolean;
	pullNotes: boolean;
	pullAnnotations: boolean;
	pushNotes: boolean;
	/** Ignore watermarks and re-push every linked paper (damage recovery). */
	forcePush?: boolean;
	onProgress?: (current: number, total: number, phase: ZoteroSyncPhase) => void;
}): Promise<ZoteroSyncResult> {
	if (!isTauri()) {
		throw new Error(i18n.t("sidebar:zoteroMigrate.desktopOnly"));
	}
	const onProgress = new Channel<{
		current: number;
		total: number;
		phase: ZoteroSyncPhase;
	}>();
	if (opts.onProgress) {
		const cb = opts.onProgress;
		onProgress.onmessage = (m) => cb(m.current, m.total, m.phase);
	}
	return invokeApi<ZoteroSyncResult>(
		"zotero_sync",
		{
			args: {
				vaultPath: opts.vaultPath,
				zoteroDir: opts.zoteroDir,
				pullMetadata: opts.pullMetadata,
				pullNotes: opts.pullNotes,
				pullAnnotations: opts.pullAnnotations,
				pushNotes: opts.pushNotes,
				forcePush: opts.forcePush ?? false,
			},
			onProgress,
		},
		{ fallback: "zotero_sync failed" },
	);
}
