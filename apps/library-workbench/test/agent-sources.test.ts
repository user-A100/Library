import { describe, expect, it } from "vitest";

import { normalizeAgentSourcePath } from "@/lib/agent/sources";

describe("normalizeAgentSourcePath", () => {
	it("strips matching single/double/backtick quotes", () => {
		expect(normalizeAgentSourcePath("'papers/a/NOTES.md'")).toBe(
			"papers/a/NOTES.md",
		);
		expect(normalizeAgentSourcePath('"papers/b/PAPER.md"')).toBe(
			"papers/b/PAPER.md",
		);
		expect(normalizeAgentSourcePath("`papers/c/source/main.tex`")).toBe(
			"papers/c/source/main.tex",
		);
	});

	it("strips list markers and unmatched trailing quotes", () => {
		expect(normalizeAgentSourcePath("- papers/e/NOTES.md'")).toBe(
			"papers/e/NOTES.md",
		);
		expect(normalizeAgentSourcePath("• 'papers/f/NOTES.md'")).toBe(
			"papers/f/NOTES.md",
		);
	});

	it("unwraps wikilinks with optional alias", () => {
		expect(normalizeAgentSourcePath("[[papers/d/NOTES.md|title]]")).toBe(
			"papers/d/NOTES.md",
		);
	});

	it("extracts path from backtick + Chinese parenthetical notes", () => {
		expect(
			normalizeAgentSourcePath(
				"`papers/Towards-Long-Horizon-Agent/PAPER.md`（§2.3，Eq. 2 与 Figure 4 上下文）",
			),
		).toBe("papers/Towards-Long-Horizon-Agent/PAPER.md");
		expect(
			normalizeAgentSourcePath(
				"`papers/Towards-Long-Horizon-Agent/NOTES.md`（Experiments / Figure 4 解读）",
			),
		).toBe("papers/Towards-Long-Horizon-Agent/NOTES.md");
	});

	it("extracts path after Chinese label prefix", () => {
		expect(
			normalizeAgentSourcePath(
				"用户批注截图：`assets/image-38fac94f-4577-46b6-af56-bb4465f2bc13.png`",
			),
		).toBe("assets/image-38fac94f-4577-46b6-af56-bb4465f2bc13.png");
	});
});
