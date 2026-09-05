import { describe, expect, it } from "vitest";
import { buildPlazaAssistantPrompt } from "./prompt";
import type { PlazaListing } from "./types";

const listing: PlazaListing = {
	sourceId: "skills",
	id: "a/b",
	title: "a/b",
	summary: "Nature 文风绘图",
	kind: "skill",
	importPayload: { kind: "skill", url: "https://github.com/a/b" },
};

describe("buildPlazaAssistantPrompt", () => {
	it("embeds the question, a numbered item list as JSON, and the output contract", () => {
		const p = buildPlazaAssistantPrompt({
			sourceLabel: "Skill Store",
			question: "找 nature 风格的 skill",
			listings: [listing],
		});
		expect(p).toContain("Skill Store");
		expect(p).toContain("找 nature 风格的 skill");
		expect(p).toContain('"index": 1');
		expect(p).toContain("recommendations");
		expect(p).toMatch(/```json/);
	});

	it("states the included count when listings exceed the cap", () => {
		const many = Array.from({ length: 60 }, (_, i) => ({
			...listing,
			id: `r${i}`,
			title: `r${i}`,
		}));
		const p = buildPlazaAssistantPrompt({
			sourceLabel: "X",
			question: "q",
			listings: many,
		});
		expect(p).toContain("50 of 60");
	});
});
