"use client";

import { MarkdownPlugin } from "@platejs/markdown";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { RangeApi, type RangeRef } from "platejs";
import type { PlateEditor } from "platejs/react";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import i18n from "@/i18n";
import {
	copyTextToClipboard,
	readTextFromClipboard,
} from "@/lib/core/clipboard";
import { errorMessage, notifyError, notifyWarning } from "@/lib/core/notify";
import {
	hasSelectedBlocks,
	isEditorClipboardTarget,
	serializeSelectedBlocksAsMarkdown,
} from "@/lib/markdown/block-selection";
import { prepareMarkdownForDeserialize } from "@/lib/markdown/deserialize";
import {
	type EditorLinkTemplateKind,
	insertEditorLinkTemplate,
} from "@/lib/markdown/editor-context-menu";
import {
	captureMarkdownSelectionBookmark,
	prepareMarkdownFormat,
	replaceMarkdownEditorValue,
} from "@/lib/markdown/editor-format";
import { formatMarkdownSource } from "@/lib/markdown/format";
import type { WikiRenameHeadingRequest } from "@/lib/wiki";
import {
	canRenameWikiHeading,
	currentWikiHeadingOrdinal,
	savedWikiHeadingAt,
	type WikiHeadingAnchor,
} from "@/lib/wiki/heading-rename";

type UseEditorContextMenuOptions = {
	editor: PlateEditor;
	editorContainerRef: RefObject<HTMLDivElement | null>;
	readOnly?: boolean;
	/** Current document as Markdown; used for the stale guard when formatting. */
	serialize: () => string;
	savedRef: RefObject<string>;
	dirtyRef: RefObject<boolean>;
	filePathRef: RefObject<string | null>;
	onRenameHeading?: (
		path: string,
		request: Omit<WikiRenameHeadingRequest, "path">,
	) => Promise<void>;
	/** Re-anchor the `[[` menu after the wikilink link template is inserted. */
	scheduleCompletionProbe: () => void;
};

export type EditorContextMenu = {
	/** True when the right-click happened over a non-collapsed selection. */
	selectionExpanded: boolean;
	onContextMenu: () => void;
	onOpenChange: (open: boolean) => void;
	copy: () => Promise<void>;
	cut: () => Promise<void>;
	paste: () => Promise<void>;
	insertLink: (kind: EditorLinkTemplateKind) => void;
	formatMarkdown: () => Promise<void>;
	formatting: boolean;
	/** Non-null only when the caret sits on a heading that may be renamed. */
	headingContext: WikiHeadingAnchor | null;
	renameOpen: boolean;
	setRenameOpen: (open: boolean) => void;
	renameBusy: boolean;
	confirmRename: (newText: string) => Promise<void>;
};

/**
 * The editor right-click menu and the heading-rename dialog it opens.
 *
 * Right-click does not move the caret, so the selection at open time is pinned
 * in a `RangeRef` and taken exactly once by whichever action runs. Actions
 * re-focus the editor at that selection because the menu stole focus.
 */
export function useEditorContextMenu({
	editor,
	editorContainerRef,
	readOnly,
	serialize,
	savedRef,
	dirtyRef,
	filePathRef,
	onRenameHeading,
	scheduleCompletionProbe,
}: UseEditorContextMenuOptions): EditorContextMenu {
	const selectionRef = useRef<RangeRef | null>(null);
	const [selectionExpanded, setSelectionExpanded] = useState(false);
	const [blockSelectionActive, setBlockSelectionActive] = useState(false);
	const [headingContext, setHeadingContext] =
		useState<WikiHeadingAnchor | null>(null);
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameBusy, setRenameBusy] = useState(false);
	const [formatting, setFormatting] = useState(false);

	useEffect(
		() => () => {
			selectionRef.current?.unref();
			selectionRef.current = null;
		},
		[],
	);

	const currentHeadingAnchor = useCallback((): WikiHeadingAnchor | null => {
		const selection = editor.selection;
		if (!selection) return null;
		const headings: Array<{ level: number; path: number[] }> = [];
		for (const [node, path] of editor.api.nodes({ at: [] })) {
			const type = (node as { type?: unknown }).type;
			if (typeof type !== "string" || !/^h[1-6]$/.test(type)) continue;
			headings.push({ path, level: Number(type.slice(1)) });
		}
		const ordinal = currentWikiHeadingOrdinal(
			headings.map((heading) => heading.path),
			selection.focus.path,
		);
		if (ordinal === null) return null;
		const heading = headings[ordinal];
		return heading
			? savedWikiHeadingAt(savedRef.current, ordinal, heading.level)
			: null;
	}, [editor, savedRef]);

	const refreshBlockSelection = useCallback(() => {
		setBlockSelectionActive(hasSelectedBlocks(editor));
	}, [editor]);

	useEffect(() => {
		const onCopyOrCut = (event: ClipboardEvent) => {
			if (event.defaultPrevented) return;
			if (!isEditorClipboardTarget(event.target, editorContainerRef.current)) {
				return;
			}
			if (!hasSelectedBlocks(editor)) return;
			const markdown = serializeSelectedBlocksAsMarkdown(editor);
			if (!markdown) return;
			event.preventDefault();
			event.stopPropagation();
			event.clipboardData?.setData("text/plain", markdown);
			if (event.type === "cut" && !readOnly) {
				editor.getTransforms(BlockSelectionPlugin).blockSelection.removeNodes();
			}
		};
		document.addEventListener("copy", onCopyOrCut, true);
		document.addEventListener("cut", onCopyOrCut, true);
		return () => {
			document.removeEventListener("copy", onCopyOrCut, true);
			document.removeEventListener("cut", onCopyOrCut, true);
		};
	}, [editor, editorContainerRef, readOnly]);

	const onContextMenu = useCallback(() => {
		selectionRef.current?.unref();
		const selection = editor.selection;
		selectionRef.current = selection
			? editor.api.rangeRef(selection, { affinity: "forward" })
			: null;
		setSelectionExpanded(
			Boolean(selection && !RangeApi.isCollapsed(selection)),
		);
		refreshBlockSelection();
		window.setTimeout(refreshBlockSelection, 0);
		const heading = currentHeadingAnchor();
		setHeadingContext(
			canRenameWikiHeading({
				dirty: dirtyRef.current,
				filePath: filePathRef.current,
				hasHandler: Boolean(onRenameHeading),
				heading,
				readOnly,
			})
				? heading
				: null,
		);
	}, [
		currentHeadingAnchor,
		dirtyRef,
		editor,
		filePathRef,
		onRenameHeading,
		readOnly,
		refreshBlockSelection,
	]);

	const onOpenChange = useCallback((open: boolean) => {
		if (open) return;
		const pinned = selectionRef.current;
		window.setTimeout(() => {
			if (selectionRef.current !== pinned) return;
			pinned?.unref();
			selectionRef.current = null;
		}, 0);
	}, []);

	const takeSelection = useCallback(() => {
		const pinned = selectionRef.current;
		selectionRef.current = null;
		return pinned?.unref() ?? editor.selection;
	}, [editor]);

	const focusEditorAt = useCallback(
		(selection: NonNullable<typeof editor.selection>) => {
			if (!editorContainerRef.current?.isConnected) return;
			editor.tf.focus({ at: selection });
		},
		[editor, editorContainerRef],
	);

	const copy = useCallback(async () => {
		if (hasSelectedBlocks(editor)) {
			const markdown = serializeSelectedBlocksAsMarkdown(editor);
			if (!markdown) return;
			await copyTextToClipboard(markdown, {
				errorMessage: i18n.t("editor:contextMenu.copyFailed"),
			});
			return;
		}
		const selection = takeSelection();
		if (!selection || RangeApi.isCollapsed(selection)) return;
		const text = editor.api.string(selection);
		await copyTextToClipboard(text, {
			errorMessage: i18n.t("editor:contextMenu.copyFailed"),
		});
	}, [editor, takeSelection]);

	const cut = useCallback(async () => {
		if (readOnly) return;
		if (hasSelectedBlocks(editor)) {
			const markdown = serializeSelectedBlocksAsMarkdown(editor);
			if (!markdown) return;
			const copied = await copyTextToClipboard(markdown, {
				errorMessage: i18n.t("editor:contextMenu.copyFailed"),
			});
			if (!copied || !editorContainerRef.current?.isConnected) return;
			editor.getTransforms(BlockSelectionPlugin).blockSelection.removeNodes();
			return;
		}
		const selection = takeSelection();
		if (!selection || RangeApi.isCollapsed(selection)) return;
		const text = editor.api.string(selection);
		const copied = await copyTextToClipboard(text, {
			errorMessage: i18n.t("editor:contextMenu.copyFailed"),
		});
		if (!copied || !editorContainerRef.current?.isConnected) return;
		editor.tf.focus({ at: selection });
		editor.tf.deleteFragment();
	}, [editor, editorContainerRef, readOnly, takeSelection]);

	const paste = useCallback(async () => {
		if (readOnly) return;
		const selection = takeSelection();
		if (!selection) return;
		const text = await readTextFromClipboard({
			errorMessage: i18n.t("editor:contextMenu.pasteFailed"),
		});
		if (text === null || !editorContainerRef.current?.isConnected) return;
		editor.tf.focus({ at: selection });
		if (typeof DataTransfer === "function") {
			const data = new DataTransfer();
			data.setData("text/plain", text);
			editor.tf.insertData(data);
		} else {
			editor.tf.insertText(text);
		}
		editor.tf.focus({ at: editor.selection ?? selection });
	}, [editor, editorContainerRef, readOnly, takeSelection]);

	const insertLink = useCallback(
		(kind: EditorLinkTemplateKind) => {
			if (readOnly) return;
			const selection = takeSelection();
			if (!selection || !editorContainerRef.current?.isConnected) return;
			const template = insertEditorLinkTemplate(editor, kind, selection);
			// External link opens the edit popover; focusing the editor would
			// immediately dismiss it (same race as slash confirm).
			if (kind !== "external") {
				editor.tf.focus({ at: editor.selection ?? selection });
			}
			if (template.wikiLinkDraft) {
				scheduleCompletionProbe();
			}
		},
		[
			editor,
			editorContainerRef,
			readOnly,
			scheduleCompletionProbe,
			takeSelection,
		],
	);

	const formatMarkdown = useCallback(async () => {
		if (readOnly || formatting) return;
		const selection = takeSelection();
		const bookmark = captureMarkdownSelectionBookmark(
			editor.children,
			selection ?? editor.selection,
		);
		const snapshot = serialize();
		setFormatting(true);
		try {
			const prepared = await prepareMarkdownFormat({
				currentSource: serialize,
				deserialize: (body) =>
					editor
						.getApi(MarkdownPlugin)
						.markdown.deserialize(prepareMarkdownForDeserialize(body)),
				formatSource: formatMarkdownSource,
				snapshot,
			});
			if (prepared.status === "stale") {
				notifyWarning(i18n.t("editor:contextMenu.formatStale"));
				return;
			}
			if (prepared.status === "unchanged") {
				if (selection) focusEditorAt(selection);
				else editor.tf.focus();
				return;
			}
			const nextSelection = replaceMarkdownEditorValue(
				editor,
				prepared.value,
				bookmark,
			);
			window.requestAnimationFrame(() => {
				if (!editorContainerRef.current?.isConnected) return;
				if (nextSelection) editor.tf.focus({ at: nextSelection });
				else editor.tf.focus({ edge: "end" });
			});
		} catch (error) {
			notifyError(i18n.t("editor:contextMenu.formatFailed"), {
				description: errorMessage(error),
			});
			if (selection && editorContainerRef.current?.isConnected) {
				focusEditorAt(selection);
			}
		} finally {
			setFormatting(false);
		}
	}, [
		editor,
		editorContainerRef,
		focusEditorAt,
		formatting,
		readOnly,
		serialize,
		takeSelection,
	]);

	const confirmRename = useCallback(
		async (newText: string) => {
			const path = filePathRef.current;
			const heading = headingContext;
			if (
				!path ||
				!heading ||
				!onRenameHeading ||
				readOnly ||
				dirtyRef.current
			) {
				return;
			}
			setRenameBusy(true);
			try {
				await onRenameHeading(path, {
					headingPath: heading.path,
					headingLine: heading.line,
					expectedContent: savedRef.current,
					newText,
				});
				setRenameOpen(false);
				setHeadingContext(null);
			} catch {
				// App owns the translated error toast. Keep the dialog open so the
				// user can retry after resolving dirty/stale source state.
			} finally {
				setRenameBusy(false);
			}
		},
		[
			dirtyRef,
			filePathRef,
			headingContext,
			onRenameHeading,
			readOnly,
			savedRef,
		],
	);

	return {
		selectionExpanded: selectionExpanded || blockSelectionActive,
		onContextMenu,
		onOpenChange,
		copy,
		cut,
		paste,
		insertLink,
		formatMarkdown,
		formatting,
		headingContext,
		renameOpen,
		setRenameOpen,
		renameBusy,
		confirmRename,
	};
}
