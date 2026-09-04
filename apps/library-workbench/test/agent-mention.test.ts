import { describe, expect, it } from "vitest";
import {
	buildMentionCandidatePaths,
	filterMentionOptions,
	isUnderPaperPath,
	listMentionChildren,
	loadRecentMentionPaths,
	mentionParentPath,
	mentionPathDepth,
	mentionPathHasChildren,
	pushRecentMentionPath,
} from "@/lib/agent/mention";

class MemoryStorage {
	private values = new Map<string, string>();

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}

	removeItem(key: string) {
		this.values.delete(key);
	}
}

describe("agent-mention", () => {
	const papers = ["papers/org/alpha", "papers/org/beta"];
	const dirs = [
		"papers",
		"papers/org",
		"papers/org/alpha",
		"papers/org/alpha/source",
		"papers/org/beta",
		"notes",
	];
	const md = [
		"notes/todo.md",
		"papers/org/alpha/NOTES.md",
		"papers/org/beta/PAPER.md",
		"README.md",
	];

	it("builds candidates: papers + non-paper dirs + external md", () => {
		const paths = buildMentionCandidatePaths({
			markdownPaths: md,
			directoryPaths: dirs,
			paperPaths: papers,
		});
		expect(paths).toContain("papers/org/alpha");
		expect(paths).toContain("papers/org");
		expect(paths).toContain("notes");
		expect(paths).toContain("notes/todo.md");
		expect(paths).toContain("README.md");
		// Paper internals omitted
		expect(paths).not.toContain("papers/org/alpha/NOTES.md");
		expect(paths).not.toContain("papers/org/alpha/source");
		expect(paths).not.toContain("papers/org/beta/PAPER.md");
	});

	it("detects paths under paper folders", () => {
		const set = new Set(papers);
		expect(isUnderPaperPath("papers/org/alpha/NOTES.md", set)).toBe(true);
		expect(isUnderPaperPath("papers/org/alpha", set)).toBe(true);
		expect(isUnderPaperPath("notes/todo.md", set)).toBe(false);
	});

	it("empty query prefers recents then shallow tree", () => {
		const candidates = buildMentionCandidatePaths({
			markdownPaths: md,
			directoryPaths: dirs,
			paperPaths: papers,
		});
		const ranked = filterMentionOptions({
			candidates,
			query: "",
			recent: ["notes/todo.md", "papers/org/beta"],
			limit: 5,
		});
		expect(ranked[0]).toBe("notes/todo.md");
		expect(ranked[1]).toBe("papers/org/beta");
		// Remaining are shallow (depth ≤ 2) before deep papers
		expect(ranked.length).toBeLessThanOrEqual(5);
		expect(ranked.every((p) => candidates.includes(p))).toBe(true);
	});

	it("filters by path query and excludes already-attached", () => {
		const candidates = buildMentionCandidatePaths({
			markdownPaths: md,
			directoryPaths: dirs,
			paperPaths: papers,
		});
		const ranked = filterMentionOptions({
			candidates,
			query: "alpha",
			exclude: ["papers/org/alpha"],
			limit: 8,
		});
		expect(ranked).not.toContain("papers/org/alpha");
		// org path still may match if contains "alpha" — only alpha paper excluded
		expect(ranked.every((p) => p.toLowerCase().includes("alpha"))).toBe(true);
	});

	it("matches extra labels (paper titles)", () => {
		const ranked = filterMentionOptions({
			candidates: ["papers/org/alpha", "notes/todo.md"],
			query: "attention",
			labelsByPath: new Map([
				["papers/org/alpha", "Attention Is All You Need · Vaswani"],
			]),
			limit: 6,
		});
		expect(ranked).toEqual(["papers/org/alpha"]);
	});

	it("path depth helper", () => {
		expect(mentionPathDepth("papers")).toBe(1);
		expect(mentionPathDepth("papers/org/alpha")).toBe(3);
		expect(mentionPathDepth("README.md")).toBe(1);
	});

	it("persists recent mention paths per vault", () => {
		const storage = new MemoryStorage();
		expect(loadRecentMentionPaths(storage, "/vault")).toEqual([]);
		pushRecentMentionPath(storage, "/vault", "notes/a.md");
		pushRecentMentionPath(storage, "/vault", "papers/x");
		pushRecentMentionPath(storage, "/vault", "notes/a.md");
		expect(loadRecentMentionPaths(storage, "/vault")).toEqual([
			"notes/a.md",
			"papers/x",
		]);
		expect(loadRecentMentionPaths(storage, "/other")).toEqual([]);
	});

	it("lists direct children for drill-down browse", () => {
		const candidates = buildMentionCandidatePaths({
			markdownPaths: md,
			directoryPaths: dirs,
			paperPaths: papers,
		});
		expect(listMentionChildren(null, candidates).sort()).toEqual(
			["README.md", "notes", "papers"].sort(),
		);
		expect(listMentionChildren("papers", candidates)).toEqual(["papers/org"]);
		expect(listMentionChildren("papers/org", candidates).sort()).toEqual(
			["papers/org/alpha", "papers/org/beta"].sort(),
		);
		expect(listMentionChildren("notes", candidates)).toEqual(["notes/todo.md"]);
	});

	it("paper folders have no drill-down children; org folders do", () => {
		const candidates = buildMentionCandidatePaths({
			markdownPaths: md,
			directoryPaths: dirs,
			paperPaths: papers,
		});
		const paperSet = new Set(papers);
		expect(mentionPathHasChildren("papers/org", candidates, paperSet)).toBe(
			true,
		);
		expect(
			mentionPathHasChildren("papers/org/alpha", candidates, paperSet),
		).toBe(false);
		expect(mentionPathHasChildren("notes", candidates, paperSet)).toBe(true);
	});

	it("browseRoot lists only that folder's children", () => {
		const candidates = buildMentionCandidatePaths({
			markdownPaths: md,
			directoryPaths: dirs,
			paperPaths: papers,
		});
		const ranked = filterMentionOptions({
			candidates,
			query: "",
			browseRoot: "papers/org",
			limit: 8,
		});
		expect(ranked.sort()).toEqual(
			["papers/org/alpha", "papers/org/beta"].sort(),
		);
	});

	it("mentionParentPath walks up segments", () => {
		expect(mentionParentPath("papers/org/alpha")).toBe("papers/org");
		expect(mentionParentPath("papers")).toBe(null);
		expect(mentionParentPath("")).toBe(null);
	});
});
