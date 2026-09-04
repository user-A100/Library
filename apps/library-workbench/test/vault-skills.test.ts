import { describe, expect, it } from "vitest";
import { seededSkillIdsFromCreated } from "@/lib/vault";

describe("seededSkillIdsFromCreated", () => {
	it("extracts unique skill package ids from created paths", () => {
		const ids = seededSkillIdsFromCreated([
			"papers/",
			".agents/skills/README.md",
			".agents/skills/LICENSE-Supervisor-Skills.txt",
			".agents/skills/deep-research/SKILL.md",
			".agents/skills/deep-research/references/quality-gates.md",
			".agents/skills/idea-evaluator/SKILL.md",
			".agents/skills/paper-reader/SKILL.md",
		]);
		expect(ids).toEqual(["deep-research", "idea-evaluator", "paper-reader"]);
	});

	it("returns empty when no skill packages were created", () => {
		expect(
			seededSkillIdsFromCreated([
				"AGENTS.md",
				".agents/README.md",
				".agents/skills/README.md",
			]),
		).toEqual([]);
	});

	it("normalizes backslashes", () => {
		expect(
			seededSkillIdsFromCreated([".agents\\skills\\agentero-cli\\SKILL.md"]),
		).toEqual(["agentero-cli"]);
	});
});
