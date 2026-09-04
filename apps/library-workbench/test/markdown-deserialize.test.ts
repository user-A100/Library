import { MarkdownPlugin } from "@platejs/markdown";
import { createSlateEditor, createSlatePlugin, KEYS } from "platejs";
import { describe, expect, it } from "vitest";

import { prepareMarkdownForDeserialize } from "@/lib/markdown/deserialize";

const ParagraphPlugin = createSlatePlugin({
	key: KEYS.p,
	node: { isElement: true },
});

describe("prepareMarkdownForDeserialize", () => {
	it("escapes an unclosed block-math fence", () => {
		const source = "before\n$$\nbad _ {\n\nafter\n# heading";

		expect(prepareMarkdownForDeserialize(source)).toBe(
			"before\n\\$$\nbad _ {\n\nafter\n# heading",
		);
	});

	it("only repairs the unmatched fence", () => {
		const source = "$$\nvalid\n$$\n\n$$\nunclosed";

		expect(prepareMarkdownForDeserialize(source)).toBe(
			"$$\nvalid\n$$\n\n\\$$\nunclosed",
		);
	});

	it("leaves paired fences and inline math unchanged", () => {
		const source = "inline $x$ and\n$$\nE=mc^2\n$$";

		expect(prepareMarkdownForDeserialize(source)).toBe(source);
	});

	it("ignores math-looking lines inside fenced code", () => {
		const source = "```\n$$\nnot math\n```\n\n$$\nunclosed";

		expect(prepareMarkdownForDeserialize(source)).toBe(
			"```\n$$\nnot math\n```\n\n\\$$\nunclosed",
		);
	});

	it("ignores indented code that looks like a math fence", () => {
		const source = "    $$\n    not math";

		expect(prepareMarkdownForDeserialize(source)).toBe(source);
	});

	it("keeps Markdown after an invalid unclosed equation parseable", () => {
		const editor = createSlateEditor({
			plugins: [ParagraphPlugin, MarkdownPlugin],
			value: [{ type: "p", children: [{ text: "" }] }],
		});
		const source = "before\n$$\nbad _ {\n\nafter\n# heading";
		const value = editor
			.getApi(MarkdownPlugin)
			.markdown.deserialize(prepareMarkdownForDeserialize(source));

		expect(value).toMatchObject([
			{ type: "p", children: [{ text: "before\n$$\nbad _ {" }] },
			{ type: "p", children: [{ text: "after" }] },
			{ type: "h1", children: [{ text: "heading" }] },
		]);
	});
});
