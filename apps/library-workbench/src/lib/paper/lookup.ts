/**
 * Magic-wand identifier import via Host `lookup_import`.
 * Always downloads PDF; arXiv also downloads and unpacks LaTeX into `source/`.
 * Translator base URL comes from Settings (`translatorBaseUrl`).
 * @see docs/backend/identifier-lookup.md
 */
import { open } from "@tauri-apps/plugin-dialog";
import i18n from "@/i18n";
import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";
import { type AppSettings, DEFAULT_TRANSLATOR_BASE_URL } from "@/lib/settings";

export type LookupAddResult = {
	paperDir: string;
	path: string;
	id: string;
	title: string;
	usedTranslator: boolean;
	translatorBaseUrl: string;
	/** Local PDF present after import download. */
	pdf?: boolean;
	/** Local TeX present after import download. */
	tex?: boolean;
	paperMd?: boolean;
	assetMessages?: string[];
	/** `deduped` = paper already existed (a local PDF was merged into it). */
	status?: "created" | "deduped" | "skipped";
	/** Placeholder metadata committed; a RecognizeMetadata job resolves the
	 *  real metadata (and renames the folder) in the background. */
	recognizePending?: boolean;
};

export type SkillImportResult = {
	name: string;
	description: string;
	path: string;
	source: string;
	skipped: boolean;
};

export type SkillCandidate = {
	name: string;
	description: string;
	source: string;
	relativePath: string;
	alreadyInstalled: boolean;
};

export type SkillDiscovery = {
	discoveryId: string;
	source: string;
	candidates: SkillCandidate[];
};

/** One importable hit from a magic-wand title search. */
export type PaperSearchCandidate = {
	title: string;
	authors: string[];
	year?: number;
	venue?: string;
	doi?: string;
	arxivId?: string;
	citationCount?: number;
	url?: string;
	/** Text handed back to the identifier pipeline on confirm. */
	identifier: string;
	source: "s2" | "arxiv";
};

export type PaperSearchGroup = {
	query: string;
	candidates: PaperSearchCandidate[];
};

/**
 * Frontend heuristic mirroring Host `classify_segment`: true when the input
 * is likely free text that will fall through to title search. Used to open
 * the picker with a shimmer before the Host round-trip returns.
 *
 * Prefer false negatives (dialog opens late) over false positives that flash
 * the picker for a real identifier import — but single non-id tokens like
 * "AlphaFold" are titles, matching Host.
 */
export function looksLikeTitleSearchQuery(input: string): boolean {
	const text = input.trim();
	if (!text) return false;
	// Skill sources keep spaces; never treat them as titles.
	if (
		/\bnpx\s+skills\b/i.test(text) ||
		/\bskills\.sh\b/i.test(text) ||
		/github\.com\/[^\s]+/i.test(text)
	) {
		return false;
	}

	const tokens = text.split(/\s+/).filter(Boolean);
	if (tokens.length <= 1) {
		return !looksLikeIdentifierToken(tokens[0] ?? text);
	}
	// Space-separated identifier lists stay on the identifier path.
	if (tokens.every(looksLikeIdentifierToken)) return false;
	return true;
}

function looksLikeIdentifierToken(token: string): boolean {
	const t = token.trim();
	if (!t) return false;
	if (/^https?:\/\//i.test(t)) return true;
	if (/^(doi:)?10\.\d{4,}/i.test(t)) return true;
	if (/^(arXiv:)?\d{4}\.\d{4,5}(v\d+)?$/i.test(t)) return true;
	if (/^(arXiv:)?[a-z-]+(\.[A-Z]{2})?\/\d{7}(v\d+)?$/i.test(t)) return true;
	if (/^PMID:?\d{1,9}$/i.test(t) || /^\d{1,8}$/.test(t)) return true;
	if (/^(978|979)[-\d]{10,}$/i.test(t) || /^\d{9}[\dXx]$/.test(t)) return true;
	if (/^\d{4}[A-Za-z]\S{14}$/.test(t)) return true; // ADS bibcode-ish
	return false;
}

export type PaperAssetsDownloadResult = {
	pdf: boolean;
	tex: boolean;
	paperMd?: boolean;
	messages: string[];
};

type HostLookupResult = {
	paperDir: string;
	path: string;
	id: string;
	title: string;
	usedTranslator: boolean;
	translatorBaseUrl: string;
	pdf?: boolean;
	tex?: boolean;
	paperMd?: boolean;
	assetMessages?: string[];
	status?: "created" | "deduped" | "skipped";
	recognizePending?: boolean;
};

function resolveTranslatorBaseUrl(
	settings: AppSettings | undefined,
	override?: string,
): string {
	const raw =
		override?.trim() ||
		settings?.translatorBaseUrl?.trim() ||
		DEFAULT_TRANSLATOR_BASE_URL;
	return raw.replace(/\/+$/, "");
}

function toLookupAddResult(d: HostLookupResult): LookupAddResult {
	return {
		paperDir: d.paperDir,
		path: d.path,
		id: d.id,
		title: d.title,
		usedTranslator: d.usedTranslator,
		translatorBaseUrl: d.translatorBaseUrl,
		pdf: d.pdf,
		tex: d.tex,
		paperMd: d.paperMd,
		assetMessages: d.assetMessages,
		status: d.status,
		recognizePending: d.recognizePending,
	};
}

export type LookupBatchAddResult = {
	imported: LookupAddResult[];
	skills: SkillImportResult[];
	skillCandidates: SkillDiscovery[];
	searchCandidates: PaperSearchGroup[];
	skipped: { raw: string; kind: string; value: string; reason: string }[];
	errors: string[];
};

/**
 * Batch add papers by identifiers/URLs into `vaultRoot/parentDir/`.
 * Host parses, deduplicates, and imports items with the configured limit.
 */
export async function addPapersByIdentifiers(opts: {
	vaultRoot: string;
	/** Vault-relative, e.g. `papers` or `papers/nlp` */
	parentDir: string;
	texts: string[];
	settings: AppSettings;
	/** Override settings URL for this call */
	translatorBaseUrl?: string;
	progressTaskId?: string;
}): Promise<LookupBatchAddResult> {
	if (!isTauri()) {
		throw new Error(i18n.t("sidebar:lookup.desktopOnly"));
	}

	const texts = opts.texts.map((t) => t.trim()).filter(Boolean);
	if (texts.length === 0) {
		throw new Error(i18n.t("sidebar:lookup.batchEmpty"));
	}

	const translatorBaseUrl = resolveTranslatorBaseUrl(
		opts.settings,
		opts.translatorBaseUrl,
	);

	const result = await invokeApi<LookupBatchAddResult>(
		"lookup_import_batch",
		{
			args: {
				vaultPath: opts.vaultRoot,
				parentDir: opts.parentDir.replace(/\\/g, "/"),
				texts,
				translatorBaseUrl,
				taskId: opts.progressTaskId,
				concurrency: opts.settings.batchImportConcurrency,
			},
		},
		{ fallback: i18n.t("sidebar:lookup.fetchFailed") },
	);

	return {
		imported: result.imported.map(toLookupAddResult),
		skills: result.skills ?? [],
		skillCandidates: result.skillCandidates ?? [],
		searchCandidates: result.searchCandidates ?? [],
		skipped: result.skipped,
		errors: result.errors,
	};
}

export async function installDiscoveredSkills(opts: {
	vaultRoot: string;
	discoveryId: string;
	selectedNames: string[];
}): Promise<SkillImportResult[]> {
	if (!isTauri()) {
		throw new Error(i18n.t("sidebar:lookup.desktopOnly"));
	}
	return invokeApi<SkillImportResult[]>(
		"skill_install",
		{
			args: {
				vaultPath: opts.vaultRoot,
				discoveryId: opts.discoveryId,
				selectedNames: opts.selectedNames,
			},
		},
		{ fallback: i18n.t("sidebar:lookup.fetchFailed") },
	);
}

export async function discardSkillDiscovery(
	discoveryId: string,
): Promise<void> {
	if (!isTauri()) return;
	await invokeApi<void>(
		"skill_discard",
		{ discoveryId },
		{ fallback: i18n.t("sidebar:lookup.fetchFailed"), allowVoid: true },
	);
}

/**
 * Download PDF (+ arXiv LaTeX) for a paper folder missing local assets.
 * `paperPath` is vault-relative (e.g. `papers/1706.03762`).
 */
export async function downloadPaperAssets(opts: {
	vaultRoot: string;
	paperPath: string;
	progressTaskId?: string;
}): Promise<PaperAssetsDownloadResult> {
	if (!isTauri()) {
		throw new Error(i18n.t("sidebar:lookup.desktopOnly"));
	}
	return invokeApi<PaperAssetsDownloadResult>(
		"paper_download_assets",
		{
			args: {
				vaultPath: opts.vaultRoot,
				path: opts.paperPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
				taskId: opts.progressTaskId,
			},
		},
		{ fallback: i18n.t("sidebar:fileTree.downloadFailed") },
	);
}

type HostLocalPdfImportResult = {
	papers: HostLookupResult[];
	errors?: string[];
};

export type LocalPdfImportResult = {
	papers: LookupAddResult[];
	/** `"<file>: <reason>"` for each PDF that failed to import. */
	errors: string[];
};

/** Structured fields fetched via identifier resolution (not user-edited). */
export type LocalPdfExtraMeta = {
	publication?: string;
	volume?: string;
	issue?: string;
	pages?: string;
	publisher?: string;
	issn?: string;
	language?: string;
	date?: string;
	abstract?: string;
};

/** Per-file metadata overrides for local PDF import (host recognizes when absent). */
export type LocalPdfImportEntry = {
	filePath: string;
	title?: string;
	authors?: string[];
	year?: number;
	doi?: string;
	arxivId?: string;
	extra?: LocalPdfExtraMeta;
};

/**
 * Import local PDF file(s) into `vaultRoot/parentDir/<slug>/` (copy + catalog + liteparse).
 * Opens a native PDF picker unless `entries` or `filePaths` is provided.
 * Returns null when the user cancels the picker.
 */
export async function importLocalPdfs(opts: {
	vaultRoot: string;
	/** Vault-relative, e.g. `papers` or `papers/nlp` */
	parentDir: string;
	/** Absolute paths (skip native picker when non-empty; no metadata overrides). */
	filePaths?: string[];
	/** Path + optional metadata overrides (host recognizes when absent). */
	entries?: LocalPdfImportEntry[];
	/** Background task receiving the host parse phase. */
	progressTaskId?: string;
	/** Settings (translator URL for background recognition). */
	settings?: AppSettings;
}): Promise<LocalPdfImportResult | null> {
	if (!isTauri()) {
		throw new Error(i18n.t("sidebar:lookup.desktopOnly"));
	}
	let entries = (opts.entries ?? [])
		.map((e) => ({ ...e, filePath: e.filePath.trim() }))
		.filter((e) => e.filePath);
	if (!entries.length) {
		let filePaths = (opts.filePaths ?? []).map((p) => p.trim()).filter(Boolean);
		if (!filePaths.length) {
			const selected = await open({
				multiple: true,
				filters: [{ name: "PDF", extensions: ["pdf"] }],
			});
			if (!selected) return null;
			filePaths = (Array.isArray(selected) ? selected : [selected]).filter(
				(p): p is string => Boolean(p),
			);
		}
		entries = filePaths.map((filePath) => ({ filePath }));
	}
	if (!entries.length) return null;

	const result = await invokeApi<HostLocalPdfImportResult>(
		"paper_import_local_pdf",
		{
			args: {
				vaultPath: opts.vaultRoot,
				parentDir: opts.parentDir.replace(/\\/g, "/"),
				filePaths: [],
				entries,
				taskId: opts.progressTaskId,
				translatorBaseUrl: resolveTranslatorBaseUrl(opts.settings),
			},
		},
		{ fallback: i18n.t("sidebar:lookup.fetchFailed") },
	);
	return {
		papers: result.papers.map(toLookupAddResult),
		errors: result.errors ?? [],
	};
}
