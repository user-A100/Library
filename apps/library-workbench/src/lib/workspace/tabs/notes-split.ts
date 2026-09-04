import i18n from "@/i18n";
import { isRemoteArxivPath, notesPathForPaper } from "@/lib/paper";
import {
	createPlaceholderTab,
	isCanonicalTabIdForPath,
	normalizeTabPath,
	tabIdForPath,
} from "@/lib/workspace/tabs/model";
import type { DocTab, OpenPlacement } from "@/lib/workspace/tabs/types";

export function tabNotesEligible(tab: DocTab | null): boolean {
	if (!tab) return false;
	return (
		tab.kind !== "library" &&
		!isRemoteArxivPath(tab.path) &&
		Boolean(tab.paperMeta) &&
		(tab.mode === "pdf" || tab.mode === "html")
	);
}

/**
 * Paper body panel (PDF/HTML) — left column of the reading split.
 * Distinct from the NOTES.md markdown panel for the same paper.
 */
export function isPaperContentTab(tab: DocTab | null): boolean {
	return tabNotesEligible(tab);
}

/** Center Markdown mode while a paper is open edits its NOTES.md live. */
export function tabIsPaperNotes(tab: DocTab | null): boolean {
	if (!tab?.paperMeta || tab.mode !== "markdown" || !tab.notesPath) {
		return false;
	}
	const tabPath = normalizeTabPath(tab.path);
	const notesPath = normalizeTabPath(tab.notesPath);
	const paperDir = notesPath.replace(/\/notes\.md$/, "");
	return tabPath === notesPath || tabPath === paperDir;
}

/**
 * Anchor for stacking another paper body as a sibling tab (same dock group),
 * so opening paper B does not create a third column beside PDF|NOTES.
 */
export function findPaperColumnAnchor(
	tabs: DocTab[],
	opts?: { excludeId?: string; preferId?: string | null },
): DocTab | null {
	const candidates = tabs.filter(
		(t) => t.id !== opts?.excludeId && isPaperContentTab(t),
	);
	if (!candidates.length) return null;
	if (opts?.preferId) {
		const preferred = candidates.find((t) => t.id === opts.preferId);
		if (preferred) return preferred;
	}
	// Prefer a paper that already has NOTES open (established reading layout).
	const withNotes = candidates.find((t) => tabHasNotesSplit(tabs, t));
	return withNotes ?? candidates[0] ?? null;
}

/**
 * Anchor for stacking another NOTES panel into the right reading column.
 */
export function findNotesColumnAnchor(
	tabs: DocTab[],
	opts?: { excludeId?: string; preferId?: string | null },
): DocTab | null {
	const candidates = tabs.filter(
		(t) => t.id !== opts?.excludeId && tabIsPaperNotes(t),
	);
	if (!candidates.length) return null;
	if (opts?.preferId) {
		const preferred = candidates.find((t) => t.id === opts.preferId);
		if (preferred) return preferred;
	}
	return candidates[0] ?? null;
}

/**
 * Where to place a newly opened paper body / NOTES companion.
 *
 * Paper bodies use normal dock placement (active group / default) so multi-paper
 * layouts can split freely — they are no longer forced into a single left column.
 * NOTES still prefer an existing notes column when present; otherwise open to the
 * right of the paper (first-paper reading default).
 */
export function paperReadingPlacements(
	tabs: DocTab[],
	opts: {
		paperId: string;
		notesId?: string | null;
		/** Prefer stacking relative to the currently active panel when possible. */
		activeId?: string | null;
		/** Explicit placement from file-tree drop etc. wins for the paper body. */
		forcedPaperPlacement?: OpenPlacement;
	},
): {
	paper: OpenPlacement;
	notes: OpenPlacement;
} {
	const notesAnchor = opts.notesId
		? findNotesColumnAnchor(tabs, {
				excludeId: opts.notesId,
				preferId: opts.activeId,
			})
		: null;
	const notes: OpenPlacement = notesAnchor
		? { direction: "within", referencePanelId: notesAnchor.id }
		: { direction: "right", referencePanelId: opts.paperId };

	if (opts.forcedPaperPlacement) {
		return {
			paper: opts.forcedPaperPlacement,
			notes,
		};
	}

	// null → dockview activates existing / adds to the active group (free layout).
	return { paper: null, notes };
}

export function createNotesSplitPane(tab: DocTab): DocTab | null {
	if (!tab.notesPath || !tab.paperMeta) return null;
	return {
		...createPlaceholderTab(tab.notesPath, "markdown"),
		kind: "file",
		title: i18n.t("app:labels.notes"),
		paperMeta: tab.paperMeta,
		notesPath: tab.notesPath,
		notesSeed: tab.notesSeed,
		loaded: true,
	};
}

/** Whether NOTES.md for this paper is already open as a panel. */
export function tabHasNotesSplit(
	tabs: DocTab[],
	paperTab: DocTab | null,
): boolean {
	if (!paperTab?.notesPath) return false;
	const notesId = tabIdForPath(paperTab.notesPath);
	return tabs.some((t) => t.id === notesId);
}

/**
 * Open NOTES companion of a paper body (PDF/HTML). Null when the tab is not
 * a paper body or its NOTES panel is not open.
 */
export function findReadingCompanion(
	tabs: DocTab[],
	tab: DocTab | null,
): DocTab | null {
	if (!tab || !isPaperContentTab(tab) || !tab.notesPath) return null;
	if (!isCanonicalTabIdForPath(tab.id, tab.path)) return null;
	const notesId = tabIdForPath(tab.notesPath);
	return tabs.find((t) => t.id === notesId) ?? null;
}

/**
 * Panel ids to close together: closing a paper body (PDF/HTML) also closes
 * its open NOTES panel, but closing NOTES leaves the body open.
 */
export function readingPairCloseIds(tabs: DocTab[], id: string): string[] {
	const tab = tabs.find((t) => t.id === id) ?? null;
	const companion = findReadingCompanion(tabs, tab);
	if (!companion || companion.id === id) return [id];
	// Companion first so body/NOTES order is stable for tests and revoke order.
	return [companion.id, id];
}

/** Reseed an open paper tab's NOTES editor (bumps notesKey to reload in place). */
export function reseedNotesTab(
	prev: DocTab[],
	paperDir: string,
	content: string,
): DocTab[] {
	const id = tabIdForPath(paperDir);
	const notesId = tabIdForPath(notesPathForPaper(paperDir));
	return prev.map((t) => {
		if (t.id === id || t.id === notesId) {
			return {
				...t,
				notesSeed: content,
				notesDirty: false,
				notesKey: t.notesKey + 1,
			};
		}
		return t;
	});
}

/** Reseed an open plain-Markdown tab (bumps seedKey to reload in place). */
export function reseedMarkdownTab(
	prev: DocTab[],
	absPath: string,
	content: string,
): DocTab[] {
	const key = normalizeTabPath(absPath);
	return prev.map((t) => {
		if (normalizeTabPath(t.path) === key) {
			return {
				...t,
				markdownSeed: content,
				markdownDirty: false,
				seedKey: t.seedKey + 1,
			};
		}
		return t;
	});
}

/** Keep the seed of the tab(s) owning `path` in sync after a disk write. */
export function syncTabSeedsForPath(
	prev: DocTab[],
	path: string,
	content: string,
): DocTab[] {
	const key = path.replace(/\\/g, "/").toLowerCase();
	const pathId = tabIdForPath(path);
	return prev.map((tab) => {
		const notesKey = tab.notesPath?.replace(/\\/g, "/").toLowerCase();
		if (notesKey === key) {
			return { ...tab, notesSeed: content };
		}
		if (
			tab.id === pathId ||
			normalizeTabPath(tab.path) === normalizeTabPath(path)
		) {
			const isNotes = Boolean(
				tab.notesPath &&
					normalizeTabPath(tab.path) === normalizeTabPath(tab.notesPath),
			);
			return {
				...tab,
				...(isNotes || notesKey === key
					? { notesSeed: content }
					: { markdownSeed: content }),
			};
		}
		return tab;
	});
}
