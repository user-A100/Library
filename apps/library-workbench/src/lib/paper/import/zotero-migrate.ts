/**
 * One-click Zotero migration: read a local Zotero data directory (zotero.sqlite
 * + storage/) via the Host and write papers into the catalog. Fully local.
 */
import { Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import i18n from "@/i18n";
import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";

export type ZoteroCollectionInfo = {
	id: number;
	path: string;
	itemCount: number;
};

export type ZoteroItemInfo = {
	id: number;
	title: string;
	/** Zotero item type (journalArticle, webpage, …) for the picker badge. */
	itemType: string;
	year: number | null;
	hasPdf: boolean;
	notes: number;
	collections: number[];
};

export type ZoteroScan = {
	valid: boolean;
	itemCount: number;
	withPdfCount: number;
	noteCount: number;
	collections: ZoteroCollectionInfo[];
	items: ZoteroItemInfo[];
	warning?: string;
};

export type ZoteroMigrateResult = {
	imported: number;
	skipped: number;
	copiedPdfs: number;
	notesAdded: number;
	/** Already-imported papers moved into their collection folder. */
	relocated: number;
	/** Duplicate Zotero items merged into an already-imported paper. */
	mergedDuplicates: number;
	pruned: number;
	paths: string[];
	errors: string[];
};

export type ZoteroMigratePhase = "migrate" | "parse";

/** Folder picker for the Zotero data directory. Returns null when cancelled. */
export async function pickZoteroDir(): Promise<string | null> {
	const selected = await open({ directory: true, multiple: false });
	if (!selected) return null;
	return Array.isArray(selected) ? (selected[0] ?? null) : selected;
}

/** Backend scan error when the picked folder holds no zotero.sqlite. */
export function isSqliteMissingError(e: unknown): boolean {
	return e instanceof Error && e.message.includes("zotero.sqlite not found");
}

/** If `picked` holds no zotero.sqlite but its parent does, return the parent. */
export async function suggestZoteroParentDir(
	picked: string,
): Promise<string | null> {
	if (!isTauri()) return null;
	try {
		const { dirname, join } = await import("@tauri-apps/api/path");
		const { exists } = await import("@tauri-apps/plugin-fs");
		const parent = await dirname(picked);
		if (parent === picked) return null;
		return (await exists(await join(parent, "zotero.sqlite"))) ? parent : null;
	} catch {
		return null;
	}
}

/** Read-only preview: how many references, and how many have a local PDF. */
export async function scanZotero(zoteroDir: string): Promise<ZoteroScan> {
	if (!isTauri()) {
		throw new Error(i18n.t("sidebar:zoteroMigrate.desktopOnly"));
	}
	return invokeApi<ZoteroScan>(
		"zotero_scan",
		{ args: { zoteroDir } },
		{
			fallback: "zotero_scan failed",
		},
	);
}

/** Migrate the Zotero library into `parentDir` + catalog; optionally copy PDFs. */
export async function migrateZotero(opts: {
	vaultPath: string;
	zoteroDir: string;
	parentDir?: string;
	copyPdfs: boolean;
	preserveCollections: boolean;
	migrateNotes: boolean;
	migrateAnnotations: boolean;
	includeCollections?: number[];
	includeItems?: number[];
	/** Selected collection: placement prefers this subtree for multi-folder items. */
	preferCollection?: number;
	onProgress?: (
		current: number,
		total: number,
		phase: ZoteroMigratePhase,
	) => void;
}): Promise<ZoteroMigrateResult> {
	if (!isTauri()) {
		throw new Error(i18n.t("sidebar:zoteroMigrate.desktopOnly"));
	}
	const onProgress = new Channel<{
		current: number;
		total: number;
		phase: ZoteroMigratePhase;
	}>();
	if (opts.onProgress) {
		const cb = opts.onProgress;
		onProgress.onmessage = (m) => cb(m.current, m.total, m.phase);
	}
	return invokeApi<ZoteroMigrateResult>(
		"zotero_migrate",
		{
			args: {
				vaultPath: opts.vaultPath,
				zoteroDir: opts.zoteroDir,
				parentDir: opts.parentDir ?? "papers",
				copyPdfs: opts.copyPdfs,
				preserveCollections: opts.preserveCollections,
				migrateNotes: opts.migrateNotes,
				migrateAnnotations: opts.migrateAnnotations,
				includeCollections: opts.includeCollections ?? null,
				includeItems: opts.includeItems ?? null,
				preferCollection: opts.preferCollection ?? null,
			},
			onProgress,
		},
		{ fallback: "zotero_migrate failed" },
	);
}
