import { describe, expect, it } from "vitest";
import { joinPath } from "@/lib/core/path";
import { joinVaultPath } from "@/lib/vault";

describe("joinPath", () => {
	it("joins POSIX roots with forward slashes", () => {
		expect(joinPath("/Users/me/vault", "notes/a.md")).toBe(
			"/Users/me/vault/notes/a.md",
		);
		expect(joinPath("/Users/me/vault/", "notes/a.md")).toBe(
			"/Users/me/vault/notes/a.md",
		);
	});

	it("keeps Windows roots on backslashes for multi-segment rel paths", () => {
		// Regression for #181: mixed C:\\vault/notes/x.md breaks under \\\\?\\ opens.
		expect(
			joinPath(
				"C:\\Users\\hiclary\\Desktop\\wenxian",
				"notes/zh-CN/02 Agent 与 Skill.md",
			),
		).toBe(
			"C:\\Users\\hiclary\\Desktop\\wenxian\\notes\\zh-CN\\02 Agent 与 Skill.md",
		);
		expect(
			joinPath("C:\\Users\\hiclary\\Desktop\\wenxian\\", "notes/a.md"),
		).toBe("C:\\Users\\hiclary\\Desktop\\wenxian\\notes\\a.md");
	});

	it("rewrites child backslashes when the parent is POSIX", () => {
		expect(joinPath("/vault", "notes\\a.md")).toBe("/vault/notes/a.md");
	});

	it("returns the parent when the child is empty", () => {
		expect(joinPath("C:\\vault", "")).toBe("C:\\vault");
		expect(joinPath("C:\\vault\\", "/")).toBe("C:\\vault");
	});
});

describe("joinVaultPath", () => {
	it("matches joinPath for wiki open targets", () => {
		expect(
			joinVaultPath("C:\\Users\\me\\vault", "notes/zh-CN/02 Agent 与 Skill.md"),
		).toBe("C:\\Users\\me\\vault\\notes\\zh-CN\\02 Agent 与 Skill.md");
	});
});
