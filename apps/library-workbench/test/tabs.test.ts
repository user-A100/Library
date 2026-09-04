import { beforeEach, describe, expect, it } from "vitest";
import { LIBRARY_VIRTUAL_PATH } from "@/lib/paper/api";
import {
	createNotesSplitPane,
	createPlaceholderTab,
	type DocTab,
	extractTabsFromLayout,
	insertPlaceholderTab,
	loadPersistedTabs,
	panelPersistParams,
	paperReadingPlacements,
	patchTab,
	readingPairCloseIds,
	remapPathUnder,
	remapTabsUnderPath,
	removeTab,
	removeTabsUnderPath,
	reseedMarkdownTab,
	reseedNotesTab,
	savePersistedTabs,
	syncTabSeedsForPath,
	tabHasNotesSplit,
} from "@/lib/workspace/tabs";

function makeTab(path: string, overrides: Partial<DocTab> = {}): DocTab {
	return { ...createPlaceholderTab(path), ...overrides };
}

describe("createPlaceholderTab", () => {
	it("builds an unloaded placeholder from a normalized id", () => {
		const tab = createPlaceholderTab("/vault/a.md", "pdf");
		expect(tab.id).toBe("/vault/a.md");
		expect(tab.kind).toBe("file");
		expect(tab.title).toBe("a.md");
		expect(tab.mode).toBe("pdf");
		expect(tab.loaded).toBe(false);
	});

	it("special-cases the Library virtual path", () => {
		const tab = createPlaceholderTab(LIBRARY_VIRTUAL_PATH);
		expect(tab.path).toBe(LIBRARY_VIRTUAL_PATH);
		expect(tab.kind).toBe("library");
		expect(tab.title).toBe("Library");
		expect(tab.mode).toBe("markdown");
	});
});

describe("insertPlaceholderTab", () => {
	it("appends a new tab", () => {
		const { tabs, id, exists } = insertPlaceholderTab([], "/vault/a.md");
		expect(exists).toBe(false);
		expect(id).toBe("/vault/a.md");
		expect(tabs).toHaveLength(1);
	});

	it("dedupes by id and returns the original array", () => {
		const start = [makeTab("/vault/a.md")];
		const { tabs, exists } = insertPlaceholderTab(start, "/Vault/A.md");
		expect(exists).toBe(true);
		expect(tabs).toBe(start);
	});
});

describe("patchTab", () => {
	it("merges the patch into the matching tab only", () => {
		const start = [makeTab("/vault/a.md"), makeTab("/vault/b.md")];
		const next = patchTab(start, "/vault/a.md", { loaded: true, title: "A" });
		expect(next[0]?.loaded).toBe(true);
		expect(next[0]?.title).toBe("A");
		expect(next[1]?.loaded).toBe(false);
	});
});

describe("removeTab", () => {
	const start = [
		makeTab("/vault/a.md"),
		makeTab("/vault/b.md"),
		makeTab("/vault/c.md"),
	];

	it("removes by id without computing a neighbor active id", () => {
		const { tabs, removed } = removeTab(start, "/vault/b.md");
		expect(removed?.id).toBe("/vault/b.md");
		expect(tabs.map((t) => t.id)).toEqual(["/vault/a.md", "/vault/c.md"]);
	});

	it("returns empty tabs when the last panel is removed", () => {
		const { tabs, removed } = removeTab(
			[makeTab("/vault/a.md")],
			"/vault/a.md",
		);
		expect(removed?.id).toBe("/vault/a.md");
		expect(tabs).toHaveLength(0);
	});

	it("is a no-op for an unknown id", () => {
		const { tabs, removed } = removeTab(start, "/nope");
		expect(tabs).toBe(start);
		expect(removed).toBeNull();
	});
});

describe("removeTabsUnderPath", () => {
	it("removes tabs at or under the path but keeps Library", () => {
		const start = [
			makeTab(LIBRARY_VIRTUAL_PATH),
			makeTab("/vault/papers/x"),
			makeTab("/vault/papers/x/NOTES.md"),
			makeTab("/vault/other.md"),
		];
		const { tabs, removed } = removeTabsUnderPath(start, "/vault/papers/x");
		expect(tabs.map((t) => t.id)).toEqual([
			LIBRARY_VIRTUAL_PATH,
			"/vault/other.md",
		]);
		expect(removed).toHaveLength(2);
	});

	it("is a no-op when nothing matches", () => {
		const start = [makeTab("/vault/a.md")];
		const { tabs, removed } = removeTabsUnderPath(start, "/vault/z");
		expect(tabs).toBe(start);
		expect(removed).toHaveLength(0);
	});
});

describe("remapTabsUnderPath", () => {
	it("keeps moved tabs mounted and updates nested paths", () => {
		const start = [
			makeTab("/vault/papers/nlp/paper", {
				paperMeta: { path: "papers/nlp/paper" } as DocTab["paperMeta"],
				notesPath: "/vault/papers/nlp/paper/NOTES.md",
			}),
			makeTab("/vault/notes/other.md"),
		];
		const next = remapTabsUnderPath(
			start,
			"/vault/papers/nlp",
			"/vault/papers/archive/nlp",
			"papers/nlp",
			"papers/archive/nlp",
		);
		expect(next[0]?.id).toBe("/vault/papers/archive/nlp/paper");
		expect(next[0]?.notesPath).toBe("/vault/papers/archive/nlp/paper/NOTES.md");
		expect(next[0]?.paperMeta?.path).toBe("papers/archive/nlp/paper");
		expect(next[1]).toBe(start[1]);
	});

	it("leaves unrelated and virtual paths unchanged", () => {
		expect(remapPathUnder(LIBRARY_VIRTUAL_PATH, "/vault/a", "/vault/b")).toBe(
			LIBRARY_VIRTUAL_PATH,
		);
		expect(remapPathUnder("/vault/c.md", "/vault/a", "/vault/b")).toBe(
			"/vault/c.md",
		);
	});
});
describe("reseed helpers", () => {
	it("reseedNotesTab bumps notesKey and clears notesDirty", () => {
		const start = [
			makeTab("/vault/papers/x", { notesKey: 2, notesDirty: true }),
		];
		const next = reseedNotesTab(start, "/vault/papers/x", "hello");
		expect(next[0]?.notesSeed).toBe("hello");
		expect(next[0]?.notesKey).toBe(3);
		expect(next[0]?.notesDirty).toBe(false);
	});

	it("reseedMarkdownTab bumps seedKey and clears markdownDirty", () => {
		const start = [makeTab("/vault/a.md", { seedKey: 5, markdownDirty: true })];
		const next = reseedMarkdownTab(start, "/vault/a.md", "world");
		expect(next[0]?.markdownSeed).toBe("world");
		expect(next[0]?.seedKey).toBe(6);
		expect(next[0]?.markdownDirty).toBe(false);
	});
});

describe("syncTabSeedsForPath", () => {
	it("updates notesSeed when the notes path matches", () => {
		const start = [
			makeTab("/vault/papers/x", { notesPath: "/vault/papers/x/NOTES.md" }),
		];
		const next = syncTabSeedsForPath(start, "/vault/papers/x/notes.md", "n");
		expect(next[0]?.notesSeed).toBe("n");
	});

	it("updates markdownSeed when the tab path matches", () => {
		const start = [makeTab("/vault/a.md")];
		const next = syncTabSeedsForPath(start, "/VAULT/A.MD", "m");
		expect(next[0]?.markdownSeed).toBe("m");
	});
});

describe("extractTabsFromLayout", () => {
	it("reads path/mode from panel params and active from grid", () => {
		const layout = {
			grid: {
				root: {
					type: "leaf",
					data: {
						id: "g1",
						views: ["/vault/a.md", "/vault/b.md"],
						activeView: "/vault/b.md",
					},
				},
				height: 100,
				width: 100,
				orientation: "HORIZONTAL",
			},
			panels: {
				"/vault/a.md": {
					id: "/vault/a.md",
					params: {
						panelId: "/vault/a.md",
						path: "/vault/a.md",
						mode: "markdown",
					},
				},
				"/vault/b.md": {
					id: "/vault/b.md",
					params: { panelId: "/vault/b.md", path: "/vault/b.md", mode: "pdf" },
				},
			},
			activeGroup: "g1",
		};
		const extracted = extractTabsFromLayout(layout);
		expect(extracted.tabs).toEqual([
			{ id: "/vault/a.md", path: "/vault/a.md", mode: "markdown" },
			{ id: "/vault/b.md", path: "/vault/b.md", mode: "pdf" },
		]);
		expect(extracted.activeId).toBe("/vault/b.md");
	});

	it("preserves duplicate pane ids for the same path", () => {
		const layout = {
			grid: {
				root: {
					type: "branch",
					data: [
						{
							type: "leaf",
							data: {
								id: "g1",
								views: ["/vault/a.md"],
								activeView: "/vault/a.md",
							},
						},
						{
							type: "leaf",
							data: {
								id: "g2",
								views: ["/vault/a.md::pane-2"],
								activeView: "/vault/a.md::pane-2",
							},
						},
					],
				},
			},
			panels: {
				"/vault/a.md": {
					id: "/vault/a.md",
					params: {
						panelId: "/vault/a.md",
						path: "/vault/a.md",
						mode: "markdown",
					},
				},
				"/vault/a.md::pane-2": {
					id: "/vault/a.md::pane-2",
					params: {
						panelId: "/vault/a.md::pane-2",
						path: "/vault/a.md",
						mode: "markdown",
					},
				},
			},
			activeGroup: "g2",
		};
		const extracted = extractTabsFromLayout(layout);
		expect(extracted.tabs).toEqual([
			{ id: "/vault/a.md", path: "/vault/a.md", mode: "markdown" },
			{
				id: "/vault/a.md::pane-2",
				path: "/vault/a.md",
				mode: "markdown",
			},
		]);
		expect(extracted.activeId).toBe("/vault/a.md::pane-2");
	});

	it("falls back to panel id as path when params are missing", () => {
		const layout = {
			panels: {
				"/vault/x.md": { id: "/vault/x.md" },
			},
		};
		const extracted = extractTabsFromLayout(layout);
		expect(extracted.tabs).toEqual([
			{ id: "/vault/x.md", path: "/vault/x.md", mode: "markdown" },
		]);
	});

	it("carries persisted titles for restore before hydration (#410)", () => {
		const layout = {
			panels: {
				"/vault/papers/x": {
					id: "/vault/papers/x",
					params: {
						panelId: "/vault/papers/x",
						path: "/vault/papers/x",
						mode: "pdf",
						title: "Attention Is All You Need",
					},
				},
			},
		};
		const extracted = extractTabsFromLayout(layout);
		expect(extracted.tabs).toEqual([
			{
				id: "/vault/papers/x",
				path: "/vault/papers/x",
				mode: "pdf",
				title: "Attention Is All You Need",
			},
		]);
	});
});

describe("panelPersistParams", () => {
	it("round-trips the display title into layout params", () => {
		const tab = makeTab("/vault/papers/x", {
			kind: "paper",
			title: "Attention Is All You Need",
		});
		expect(panelPersistParams(tab)).toEqual({
			panelId: "/vault/papers/x",
			path: "/vault/papers/x",
			mode: "markdown",
			title: "Attention Is All You Need",
		});
	});
});

describe("tab session persistence", () => {
	beforeEach(() => {
		const store = new Map<string, string>();
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (k: string) => store.get(k) ?? null,
				setItem: (k: string, v: string) => store.set(k, v),
				removeItem: (k: string) => store.delete(k),
			},
		});
	});

	it("round-trips layout-only storage", () => {
		const layout = {
			grid: {
				root: {
					type: "leaf",
					data: {
						id: "g1",
						views: ["/vault/a.md", "/vault/b.md"],
						activeView: "/vault/b.md",
					},
				},
				height: 1,
				width: 1,
				orientation: "HORIZONTAL",
			},
			panels: {
				"/vault/a.md": {
					id: "/vault/a.md",
					params: {
						panelId: "/vault/a.md",
						path: "/vault/a.md",
						mode: "markdown",
					},
				},
				"/vault/b.md": {
					id: "/vault/b.md",
					params: { panelId: "/vault/b.md", path: "/vault/b.md", mode: "pdf" },
				},
			},
			activeGroup: "g1",
		};
		savePersistedTabs(layout);
		const loaded = loadPersistedTabs();
		expect(loaded?.layout).toEqual(layout);
		expect(loaded?.tabs).toEqual([
			{ id: "/vault/a.md", path: "/vault/a.md", mode: "markdown" },
			{ id: "/vault/b.md", path: "/vault/b.md", mode: "pdf" },
		]);
		expect(loaded?.activeId).toBe("/vault/b.md");
	});

	it("still loads legacy tabs[] + activeIndex without layout", () => {
		localStorage.setItem(
			"agentero-open-tabs",
			JSON.stringify({
				tabs: [
					{ path: "/vault/a.md", mode: "markdown" },
					{ path: "/vault/b.md", mode: "pdf" },
				],
				activeIndex: 1,
			}),
		);
		const loaded = loadPersistedTabs();
		expect(loaded?.tabs).toEqual([
			{ path: "/vault/a.md", mode: "markdown" },
			{ path: "/vault/b.md", mode: "pdf" },
		]);
		expect(loaded?.activeId).toBe("/vault/b.md");
		expect(loaded?.layout).toBeNull();
	});

	it("clears storage when layout is empty", () => {
		savePersistedTabs({
			panels: {
				"/vault/a.md": {
					id: "/vault/a.md",
					params: {
						panelId: "/vault/a.md",
						path: "/vault/a.md",
						mode: "markdown",
					},
				},
			},
		});
		savePersistedTabs(null);
		expect(loadPersistedTabs()).toBeNull();
		savePersistedTabs({ panels: {} });
		expect(loadPersistedTabs()).toBeNull();
	});
});

describe("flat workspace helpers", () => {
	it("createNotesSplitPane reuses notesSeed", () => {
		const tab = makeTab("/vault/p", {
			kind: "paper",
			mode: "pdf",
			notesPath: "/vault/p/NOTES.md",
			notesSeed: "# hi",
			paperMeta: { path: "p", title: "P" } as DocTab["paperMeta"],
		});
		const pane = createNotesSplitPane(tab);
		expect(pane?.notesSeed).toBe("# hi");
		expect(pane?.path).toBe("/vault/p/NOTES.md");
		expect(pane?.title).toBe("Notes");
	});

	it("tabHasNotesSplit finds NOTES among open panels", () => {
		const paper = makeTab("/vault/p", {
			kind: "paper",
			mode: "pdf",
			notesPath: "/vault/p/NOTES.md",
			paperMeta: { path: "p", title: "P" } as DocTab["paperMeta"],
		});
		const notes = createNotesSplitPane(paper);
		expect(notes).not.toBeNull();
		if (!notes) return;
		expect(tabHasNotesSplit([paper], paper)).toBe(false);
		expect(tabHasNotesSplit([paper, notes], paper)).toBe(true);
	});

	it("paperReadingPlacements stacks NOTES into existing notes column only", () => {
		const paperA = makeTab("/vault/a", {
			kind: "paper",
			mode: "pdf",
			notesPath: "/vault/a/NOTES.md",
			paperMeta: { path: "a", title: "A" } as DocTab["paperMeta"],
		});
		const notesA = createNotesSplitPane(paperA);
		expect(notesA).not.toBeNull();
		if (!notesA) return;

		const place = paperReadingPlacements([paperA, notesA], {
			paperId: "paper-b",
			notesId: "notes-b",
		});
		// Paper body is free (active group / default) — not forced into paper column.
		expect(place.paper).toBeNull();
		expect(place.notes).toEqual({
			direction: "within",
			referencePanelId: notesA.id,
		});
	});

	it("paperReadingPlacements first paper uses right split for NOTES", () => {
		const place = paperReadingPlacements([], {
			paperId: "paper-a",
			notesId: "notes-a",
		});
		expect(place.paper).toBeNull();
		expect(place.notes).toEqual({
			direction: "right",
			referencePanelId: "paper-a",
		});
	});

	it("readingPairCloseIds pairs body→NOTES but not NOTES→body", () => {
		const paper = makeTab("/vault/p", {
			kind: "paper",
			mode: "pdf",
			notesPath: "/vault/p/NOTES.md",
			paperMeta: { path: "p", title: "P" } as DocTab["paperMeta"],
		});
		const notes = createNotesSplitPane(paper);
		expect(notes).not.toBeNull();
		if (!notes) return;
		const open = [paper, notes];
		expect(readingPairCloseIds(open, paper.id).sort()).toEqual(
			[paper.id, notes.id].sort(),
		);
		expect(readingPairCloseIds(open, notes.id)).toEqual([notes.id]);
		expect(readingPairCloseIds([paper], paper.id)).toEqual([paper.id]);
		expect(readingPairCloseIds([notes], notes.id)).toEqual([notes.id]);
	});
});
