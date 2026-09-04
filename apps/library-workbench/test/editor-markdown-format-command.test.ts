import { createPlateEditor } from "platejs/react";
import { describe, expect, it } from "vitest";

import {
	captureMarkdownSelectionBookmark,
	prepareMarkdownFormat,
	replaceMarkdownEditorValue,
	restoreMarkdownSelectionBookmark,
} from "@/lib/markdown/editor-format";

describe("Markdown format editor transaction", () => {
	it("restores a caret by text context after block structure changes", () => {
		const before = [
			{
				type: "p",
				children: [{ text: "Alpha cursor omega" }],
			},
		];
		const selection = {
			anchor: { path: [0, 0], offset: 12 },
			focus: { path: [0, 0], offset: 12 },
		};
		const bookmark = captureMarkdownSelectionBookmark(before, selection);
		const after = [
			{ type: "h1", children: [{ text: "Title" }] },
			{ type: "p", children: [{ text: "Alpha cursor omega" }] },
		];

		expect(restoreMarkdownSelectionBookmark(after, bookmark)).toEqual({
			anchor: { path: [1, 0], offset: 12 },
			focus: { path: [1, 0], offset: 12 },
		});
	});

	it("replaces the document as one undo batch", () => {
		const before = [
			{ type: "p", children: [{ text: "First" }] },
			{ type: "p", children: [{ text: "Second" }] },
		];
		const editor = createPlateEditor({ value: before });
		editor.tf.select({
			anchor: { path: [1, 0], offset: 3 },
			focus: { path: [1, 0], offset: 3 },
		});
		const bookmark = captureMarkdownSelectionBookmark(
			editor.children,
			editor.selection,
		);
		const after = [
			{ type: "h1", children: [{ text: "First" }] },
			{ type: "p", children: [{ text: "Second" }] },
		];

		const restored = replaceMarkdownEditorValue(editor, after, bookmark);

		expect(editor.children).toEqual(after);
		expect(restored).toEqual({
			anchor: { path: [1, 0], offset: 3 },
			focus: { path: [1, 0], offset: 3 },
		});
		expect(editor.history.undos).toHaveLength(1);

		editor.tf.undo();

		expect(editor.children).toEqual(before);
	});

	it("rejects a completed format result after the source changes", async () => {
		let releaseFormat: ((value: string) => void) | undefined;
		const formatSource = () =>
			new Promise<string>((resolve) => {
				releaseFormat = resolve;
			});
		let current = "-   one\n";
		const pending = prepareMarkdownFormat({
			currentSource: () => current,
			deserialize: () => {
				throw new Error("stale output must not be deserialized");
			},
			formatSource,
			snapshot: current,
		});

		current = "-   one\n- new input\n";
		releaseFormat?.("- one\n");

		await expect(pending).resolves.toEqual({ status: "stale" });
	});

	it("preserves frontmatter bytes while preparing a body replacement", async () => {
		const source = "---\ntitle:  Exact spacing\n---\n\n-   one\n";
		const prepared = await prepareMarkdownFormat({
			currentSource: () => source,
			deserialize: (body) => body,
			formatSource: async () => "---\ntitle: Exact spacing\n---\n\n- one\n",
			snapshot: source,
		});

		expect(prepared).toEqual({
			status: "ready",
			markdown: "---\ntitle:  Exact spacing\n---\n\n- one\n",
			value: "\n- one\n",
		});
	});
});
