import { describe, expect, it } from "vitest";
import { formatShortcut, resolveShortcutId } from "@/lib/shell/shortcuts";

function keyEvent(init: {
	key: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}): KeyboardEvent {
	return {
		key: init.key,
		metaKey: init.metaKey ?? false,
		ctrlKey: init.ctrlKey ?? false,
		altKey: init.altKey ?? false,
		shiftKey: init.shiftKey ?? false,
	} as KeyboardEvent;
}

describe("shell shortcuts", () => {
	it("resolves Obsidian-style split pane shortcut", () => {
		expect(
			resolveShortcutId(keyEvent({ key: "\\", metaKey: true }), {
				settingsOpen: false,
			}),
		).toBe("splitPane");
		expect(
			resolveShortcutId(keyEvent({ key: "\\", ctrlKey: true }), {
				settingsOpen: false,
			}),
		).toBe("splitPane");
	});

	it("renders the split pane chord", () => {
		expect(formatShortcut({ key: "\\", meta: true })).toContain("\\");
	});

	it("separates reopen tab from the terminal chord", () => {
		expect(
			resolveShortcutId(keyEvent({ key: "t", metaKey: true, shiftKey: true }), {
				settingsOpen: false,
			}),
		).toBe("reopenTab");
		expect(
			resolveShortcutId(keyEvent({ key: "t", metaKey: true, altKey: true }), {
				settingsOpen: false,
			}),
		).toBe("openInTerminal");
	});

	it("claims ⇧⌘A but leaves ⌘A to native select-all", () => {
		expect(
			resolveShortcutId(keyEvent({ key: "a", metaKey: true, shiftKey: true }), {
				settingsOpen: false,
			}),
		).toBe("addSelectionToChat");
		expect(
			resolveShortcutId(keyEvent({ key: "a", metaKey: true }), {
				settingsOpen: false,
			}),
		).toBeNull();
	});
});
