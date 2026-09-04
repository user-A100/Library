/**
 * Paper import actions: magic-wand identifier lookup and local-PDF import.
 * Heavy work (including PDF metadata recognition) runs as background tasks.
 */

import i18n from "@/i18n";
import { track } from "@/lib/activity";
import {
	cancelBackgroundTask,
	enqueueBackgroundTask,
	isBackgroundTaskCancelledError,
} from "@/lib/core/background-tasks";
import { errorText } from "@/lib/core/error";
import { invokeApi } from "@/lib/core/ipc";
import { logger } from "@/lib/core/logger";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/core/notify";
import { currentLookupParentDir } from "@/lib/paper/library-actions";
import {
	libraryStore,
	setCitingScanDraft,
	setLibraryIoBusy,
} from "@/lib/paper/library-store";
import {
	addPapersByIdentifiers,
	discardSkillDiscovery,
	importLocalPdfs,
	installDiscoveredSkills,
	type LocalPdfImportEntry,
	type LookupBatchAddResult,
	looksLikeTitleSearchQuery,
	type PaperSearchCandidate,
} from "@/lib/paper/lookup";
import { enqueuePaperLayoutAnalysis } from "@/lib/pdf/layout";
import { getSettings } from "@/lib/settings/react-store";
import {
	cleanupImportTempPaths,
	isImportTempPath,
} from "@/lib/shell/external-file-drop";
import {
	addPaperSearchDraft,
	bumpLookupOpenSignal,
	clearPaperSearchDraft,
	layout,
	setSkillImportDraft,
	settlePaperSearchDraft,
	shiftPaperSearchDraft,
	uiStore,
} from "@/lib/shell/ui-store";
import { joinVaultPath } from "@/lib/vault";
import { getVaultPath, refreshTree } from "@/lib/vault/store";
import { toVaultRelative } from "@/lib/wiki";

/** ⇧⌘I — expand the left rail (popover owns focus) and open the wand. */
export function openMagicWand(): void {
	if (!getVaultPath()) {
		notifyError(i18n.t("sidebar:lookup.needsVault"));
		return;
	}
	if (uiStore.getState().sidebarCollapsed) {
		layout()?.setLeftCollapsed(false);
	}
	bumpLookupOpenSignal();
}

export type LookupSubmitOptions = {
	/** Vault-relative destination, e.g. `papers` or `papers/nlp`. Defaults to the current tree selection. */
	parentDir?: string;
	/** Run after one input has finished importing (store refresh is debounced via paper:imported). */
	onComplete?: (result: LookupBatchAddResult) => void | Promise<void>;
};

/** In-flight title-search tasks; closing the picker card cancels them. */
const pendingSearchTaskIds = new Set<string>();

export async function lookupSubmit(
	texts: string[],
	opts: LookupSubmitOptions = {},
): Promise<void> {
	const vaultPath = getVaultPath();
	if (!vaultPath) {
		throw new Error(i18n.t("sidebar:lookup.needsVault"));
	}
	if (texts.length === 0) return;
	const settings = getSettings();
	const parentDir = opts.parentDir ?? currentLookupParentDir();

	const promises: Promise<void>[] = [];
	for (const text of texts) {
		const input = text.trim();
		if (!input) continue;
		// Open the picker immediately with shimmer when input looks like a title
		// (#438). settlePaperSearchDraft no-ops if the user already cancelled.
		const expectTitleSearch = looksLikeTitleSearchQuery(input);
		if (expectTitleSearch) {
			addPaperSearchDraft([
				{ query: input, candidates: [], parentDir, pending: true },
			]);
		}
		let searchTaskId: string | null = null;
		promises.push(
			enqueueBackgroundTask(
				{
					kind: "lookup",
					title: i18n.t("app:tasks.lookupImport"),
					detail: input.slice(0, 80),
				},
				async ({ id, setDetail }) => {
					setDetail(i18n.t("app:tasks.lookupFetching", { id: input }));
					const result = await addPapersByIdentifiers({
						vaultRoot: vaultPath,
						parentDir,
						texts: [input],
						settings,
						progressTaskId: id,
					});

					// Tree / wiki / library refresh runs via the paper:imported handler.
					if (result.skillCandidates.length > 0) {
						setSkillImportDraft(result.skillCandidates);
						setDetail(
							i18n.t("sidebar:lookup.skillCandidatesFound", {
								count: result.skillCandidates.reduce(
									(total: number, discovery) =>
										total + discovery.candidates.length,
									0,
								),
							}),
						);
					}

					if (expectTitleSearch) {
						const matched =
							result.searchCandidates.find((group) => group.query === input) ??
							result.searchCandidates[0] ??
							null;
						settlePaperSearchDraft(
							input,
							matched ? { ...matched, parentDir, pending: false } : null,
						);
						if (matched) {
							setDetail(
								i18n.t("sidebar:lookup.searchCandidatesFound", {
									count: matched.candidates.length,
								}),
							);
						}
					} else if (result.searchCandidates.length > 0) {
						addPaperSearchDraft(
							result.searchCandidates.map((group) => ({ ...group, parentDir })),
						);
						setDetail(
							i18n.t("sidebar:lookup.searchCandidatesFound", {
								count: result.searchCandidates.reduce(
									(total: number, group) => total + group.candidates.length,
									0,
								),
							}),
						);
					}

					for (const paper of result.imported) {
						const rel = (paper.path || "")
							.replace(/\\/g, "/")
							.replace(/^\/+|\/+$/g, "");
						if (rel) {
							track("paper.import", {
								path: rel,
								extra: { source: inferLookupSource(input) },
							});
						}
					}
					// Papers that already have a PDF after import: start layout now.
					// Those still downloading enqueue layout after download completes.
					for (const paper of result.imported) {
						const abs = paper.paperDir
							? paper.paperDir.replace(/[\\/]+$/, "")
							: joinVaultPath(
									vaultPath,
									(paper.path || "")
										.replace(/\\/g, "/")
										.replace(/^\/+|\/+$/g, ""),
								);
						if (abs) {
							const rel = toVaultRelative(vaultPath, abs)
								.replace(/\\/g, "/")
								.replace(/^\/+|\/+$/g, "");
							void invokeApi(
								"job_layout_analyze_enqueue",
								{
									args: {
										vaultPath,
										path: rel,
										force: false,
									},
								},
								{ fallback: "layout analysis enqueue failed" },
							);
						}
					}

					if (result.errors.length > 0) {
						notifyError(result.errors.join("; "));
					}
					await opts.onComplete?.(result);

					// Enqueue a DownloadAssets job for each newly imported paper that
					// still lacks assets. Uses the CapsCache-backed query (§8.4) instead
					// of the frontend tree walk; the runner is idempotent and backfills
					// PAPER.md + layout.
					const newPaths = result.imported
						.map((r) =>
							(r.path || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
						)
						.filter(Boolean);
					if (newPaths.length > 0) {
						let needingAssets: string[] = [];
						try {
							needingAssets = await invokeApi<string[]>(
								"job_papers_needing_assets",
								{ args: { vaultPath } },
								{ fallback: "collect papers needing assets failed" },
							);
						} catch (e) {
							logger.warn("post-import asset check failed", {
								error: errorText(e),
							});
						}
						const needingSet = new Set(
							needingAssets.map((p) =>
								p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
							),
						);
						for (const rel of newPaths) {
							if (!needingSet.has(rel)) continue;
							void invokeApi(
								"job_download_assets_enqueue",
								{
									args: { vaultPath, path: rel, lane: "normal", force: false },
								},
								{ fallback: "download enqueue failed" },
							).catch((e) =>
								logger.warn("post-import download enqueue failed", {
									rel,
									error: errorText(e),
								}),
							);
						}
					}
				},
				{
					concurrency: settings.batchImportConcurrency,
					onTaskId: (taskId) => {
						if (!expectTitleSearch) return;
						searchTaskId = taskId;
						pendingSearchTaskIds.add(taskId);
					},
				},
			)
				.catch((e) => {
					if (isBackgroundTaskCancelledError(e)) return;
					notifyError(`${input}: ${errorText(e)}`);
				})
				.finally(() => {
					if (searchTaskId !== null) pendingSearchTaskIds.delete(searchTaskId);
				}),
		);
	}
	await Promise.all(promises);
}

/** Picked a title-search candidate → import it as a normal identifier. */
export async function confirmPaperSearchImport(
	candidate: PaperSearchCandidate,
	parentDir: string,
): Promise<void> {
	shiftPaperSearchDraft();
	await lookupSubmit([candidate.identifier], { parentDir });
}

export function cancelPaperSearchImport(): void {
	// Closing the picker also ends the searches behind it: cancel each task so
	// its card stops immediately and the host skips the remaining queries.
	for (const taskId of pendingSearchTaskIds) cancelBackgroundTask(taskId);
	pendingSearchTaskIds.clear();
	clearPaperSearchDraft();
}

export async function confirmSkillImport(
	selections: Array<{ discoveryId: string; selectedNames: string[] }>,
): Promise<void> {
	const vaultPath = getVaultPath();
	if (!vaultPath) return;
	setSkillImportDraft(null);
	try {
		const result = await enqueueBackgroundTask(
			{
				kind: "import",
				title: i18n.t("sidebar:lookup.skillImportTask"),
				detail: i18n.t("sidebar:lookup.skillImporting"),
			},
			async () => {
				const installed = [];
				for (const selection of selections) {
					if (selection.selectedNames.length === 0) continue;
					installed.push(
						...(await installDiscoveredSkills({
							vaultRoot: vaultPath,
							discoveryId: selection.discoveryId,
							selectedNames: selection.selectedNames,
						})),
					);
				}
				await refreshTree(vaultPath);
				return installed;
			},
		);
		const installed = result.filter((item) => !item.skipped);
		const installedCount = installed.length;
		const skippedCount = result.length - installedCount;
		if (installedCount > 0) {
			track("skill.install", {
				extra: {
					sourceKind: "github",
					installed: installed.map((item) => item.name),
					skipped: skippedCount,
				},
			});
		}
		notifySuccess(
			i18n.t("sidebar:lookup.skillImportDone", {
				installed: installedCount,
				skipped: skippedCount,
			}),
		);
	} catch (e) {
		notifyError(errorText(e));
	}
}

function inferLookupSource(raw: string): string {
	const text = raw.trim();
	if (/npx\s+skills|github\.com|skills\.sh/i.test(text)) return "skill";
	if (/arxiv\.org|^\d{4}\.\d{4,5}(v\d+)?$/i.test(text)) return "arxiv";
	if (/^10\.\d{4,}/.test(text) || /^doi:/i.test(text)) return "doi";
	if (/^https?:\/\//i.test(text)) return "url";
	return "id";
}

export function cancelSkillImport(): void {
	const draft = uiStore.getState().skillImportDraft;
	setSkillImportDraft(null);
	for (const discovery of draft ?? []) {
		void discardSkillDiscovery(discovery.discoveryId);
	}
}

/** Import the checked reverse-citation candidates via the batch importer. */
export async function confirmCitingImport(
	identifiers: string[],
): Promise<void> {
	setCitingScanDraft(null);
	if (identifiers.length === 0) return;
	await lookupSubmit(identifiers, { parentDir: currentLookupParentDir() });
}

/** Nothing is staged for citing candidates, so closing is enough. */
export function cancelCitingImport(): void {
	setCitingScanDraft(null);
}

/**
 * Import local PDF file(s) → paper folders + catalog + PAPER.md.
 * - No args: native PDF picker (magic wand).
 * - `entries` + optional `parentDir`: OS-drop import.
 */
export async function importLocalPdf(opts?: {
	entries?: LocalPdfImportEntry[];
	parentDir?: string;
}): Promise<void> {
	const vaultPath = getVaultPath();
	if (!vaultPath || libraryStore.getState().ioBusy) return;
	// Paths under ~/.agentero/import-tmp from path-less WKWebView drops.
	const stagingPaths = (opts?.entries ?? [])
		.map((e) => e.filePath)
		.filter(isImportTempPath);
	setLibraryIoBusy("import-pdf");
	try {
		const result = await enqueueBackgroundTask(
			{ kind: "import", title: i18n.t("app:tasks.importPdf") },
			async ({ id, setDetail }) => {
				const r = await importLocalPdfs({
					vaultRoot: vaultPath,
					parentDir: opts?.parentDir ?? currentLookupParentDir(),
					entries: opts?.entries,
					progressTaskId: id,
					settings: getSettings(),
				});
				if (!r) return null;
				const merged = r.papers.filter((p) => p.status === "deduped");
				const created = r.papers.length - merged.length;
				setDetail(
					created > 0
						? i18n.t("sidebar:papersLibrary.importPdfDone", { count: created })
						: merged.length === 1
							? i18n.t("sidebar:papersLibrary.importPdfMerged", {
									title: merged[0].title,
								})
							: i18n.t("sidebar:papersLibrary.importPdfMergedMany", {
									count: merged.length,
								}),
				);
				// Tree / wiki / library refresh runs via the paper:imported handler.
				return r;
			},
		);
		if (result) {
			for (const paper of result.papers) {
				if (paper.recognizePending) {
					// The RecognizeMetadata runner owns the follow-ups so they
					// run against the paper's final (post-rename) path.
					continue;
				}
				if (paper.paperDir) {
					enqueuePaperLayoutAnalysis({
						paperAbsPath: paper.paperDir.replace(/[\\/]+$/, ""),
						paperLabel: paper.title?.trim() || paper.path,
					});
				}
			}
			const merged = result.papers.filter((p) => p.status === "deduped");
			if (merged.length === 1) {
				notifySuccess(
					i18n.t("sidebar:papersLibrary.importPdfMerged", {
						title: merged[0].title,
					}),
				);
			} else if (merged.length > 1) {
				notifySuccess(
					i18n.t("sidebar:papersLibrary.importPdfMergedMany", {
						count: merged.length,
					}),
				);
			}
			if (result.errors.length) {
				const created = result.papers.length - merged.length;
				const doneText =
					created > 0
						? `${i18n.t("sidebar:papersLibrary.importPdfDone", { count: created })}; `
						: "";
				notifyWarning(`${doneText}${result.errors.slice(0, 2).join("; ")}`);
			}
		}
	} catch (e) {
		if (isBackgroundTaskCancelledError(e)) return;
		notifyError(errorText(e));
	} finally {
		setLibraryIoBusy(null);
		void cleanupImportTempPaths(stagingPaths);
	}
}

/**
 * OS PDF drop onto a papers/ folder or the Library → instant import with
 * placeholder (filename-derived) metadata; a RecognizeMetadata job then
 * resolves identifiers in the background and renames the folder. The user
 * can always correct via Edit Metadata.
 */
export function dropLocalPdfs(
	items: Array<{ path: string; sourceName: string }>,
	parentDir: string,
): void {
	if (!items.length) return;
	const paths = items.map((i) => i.path);
	if (!getVaultPath()) {
		notifyWarning(i18n.t("app:errors.dropPdfNeedsVault"));
		void cleanupImportTempPaths(paths);
		return;
	}
	if (libraryStore.getState().ioBusy) {
		void cleanupImportTempPaths(paths);
		return;
	}
	void importLocalPdf({
		entries: paths.map((filePath) => ({ filePath })),
		parentDir: parentDir || "papers",
	});
}
