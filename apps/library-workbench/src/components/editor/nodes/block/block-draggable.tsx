"use client";

import { DndPlugin, useDraggable, useDropLine } from "@platejs/dnd";
import { expandListItemsWithChildren } from "@platejs/list";
import {
	BlockSelectionPlugin,
	useBlockSelected,
} from "@platejs/selection/react";
import { getPluginByType, type TElement } from "platejs";
import {
	MemoizedChildren,
	type PlateEditor,
	type PlateElementProps,
	type RenderNodeWrapper,
	useEditorRef,
	usePluginOption,
	usePluginOptions,
} from "platejs/react";
import * as React from "react";

import { setBlockDragAnchor } from "@/components/editor/nodes/block/block-drag-preview";
import { BlockHandleMenu } from "@/components/editor/nodes/block/block-handle-menu";
import { cn } from "@/lib/core/utils";
import { isBlankParagraph } from "@/lib/markdown/block-selection";

/**
 * Mirrors the two global drag/marquee flags onto the editable root as data
 * attributes so per-block styling can read them through CSS.
 *
 * Every block used to subscribe to these itself, which meant drag start/end and
 * marquee start/end re-rendered all N block wrappers. One subscriber plus a
 * descendant selector costs nothing per block.
 *
 * `useLayoutEffect`, not `useEffect`: `isSelectionAreaVisible` flips once the
 * marquee passes its 4px start threshold, and a frame-late attribute would flash
 * a drag handle under the pointer right as the marquee begins.
 */
export function BlockDragStateBridge() {
	const editor = useEditorRef();
	const isDragging = usePluginOption(DndPlugin, "isDragging");
	const isSelectionAreaVisible = usePluginOption(
		BlockSelectionPlugin,
		"isSelectionAreaVisible",
	);

	React.useLayoutEffect(() => {
		const root = editor.api.toDOMNode(editor);
		if (!root) return;
		root.toggleAttribute("data-dnd-dragging", Boolean(isDragging));
		root.toggleAttribute(
			"data-dnd-selection-area",
			Boolean(isSelectionAreaVisible),
		);
	}, [editor, isDragging, isSelectionAreaVisible]);

	return null;
}

export const BlockDraggable: RenderNodeWrapper = (props) => {
	const { editor, path } = props;
	if (editor.dom.readOnly) return;
	if (path.length !== 1) return;
	return (childProps: PlateElementProps) => <Draggable {...childProps} />;
};

function Draggable(props: PlateElementProps) {
	const { children, editor, element } = props;
	const blockSelectionApi = editor.getApi(BlockSelectionPlugin).blockSelection;

	const { isDragging, nodeRef, handleRef } = useDraggable({
		element,
		onDropHandler: (_, { dragItem }) => {
			const id = (dragItem as { id: string[] | string }).id;
			blockSelectionApi.add(id);
			return false;
		},
	});

	const [dragButtonTop, setDragButtonTop] = React.useState(0);
	const [menuOpen, setMenuOpen] = React.useState(false);
	const isBlockSelected = useBlockSelected();
	const isBlank = isBlankParagraph(element);
	const isContainer = Boolean(
		getPluginByType(editor, element.type)?.node.isContainer,
	);
	// useDraggable().isDragging is only true on the handle's node. Dim every id in
	// draggingId so a multi-block drag fades the whole set. The selector must
	// return a boolean: usePluginOptions bails out on Object.is, so non-dragged
	// blocks do not re-render when the option changes.
	const isNodeDragging = usePluginOptions(
		DndPlugin,
		(state) =>
			Boolean(state.isDragging) &&
			isIdInDraggingSet(element.id, state.draggingId),
	);
	// Headings reset their top margin at the document start (heading-node.tsx),
	// so the handle offset differs there for the same element type.
	const isDocumentStart =
		Array.isArray(props.path) && props.path.length === 1 && props.path[0] === 0;

	const prepareDrag = React.useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			window.getSelection()?.removeAllRanges();

			const blockSelection = editor
				.getApi(BlockSelectionPlugin)
				.blockSelection.getNodes({ sort: true });
			let selectionNodes =
				blockSelection.length > 0
					? blockSelection
					: editor.api.blocks({ mode: "highest" });
			if (!selectionNodes.some(([node]) => node.id === element.id)) {
				const path = editor.api.findPath(element);
				if (!path) return;
				selectionNodes = [[element, path]];
			}
			const blocks = expandListItemsWithChildren(editor, selectionNodes).map(
				([node]) => node,
			);
			const ids = blocks
				.map((block) => block.id)
				.filter((id): id is string => typeof id === "string");
			// Same contract as Plate playground BlockDraggable: draggingId is the
			// full id list; item() then drags every id, not just the handle's node.
			editor.setOption(DndPlugin, "draggingId", ids);
			editor.getApi(BlockSelectionPlugin).blockSelection.set(ids);

			const first = blocks[0] ?? element;
			const firstRect = editor.api.toDOMNode(first)?.getBoundingClientRect();
			const widths = blocks.map(
				(block) =>
					editor.api.toDOMNode(block)?.getBoundingClientRect().width ?? 0,
			);
			if (firstRect) {
				setBlockDragAnchor({
					offsetX: event.clientX - firstRect.left,
					offsetY: event.clientY - firstRect.top,
					width: Math.max(firstRect.width, ...widths),
				});
			}

			// Official kit only blurs for a caret-originated single-block drag.
			if (blockSelection.length === 0) {
				editor.tf.blur();
				editor.tf.collapse();
			}
		},
		[editor, element],
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover only positions the handle
		<div
			className={cn(
				"relative",
				isNodeDragging && "select-none opacity-50",
				isContainer ? "group/container" : "group",
				!isBlank && (menuOpen || isBlockSelected) && "rounded-md bg-muted/40",
			)}
			onMouseEnter={() => {
				if (isDragging) return;
				setDragButtonTop(calcDragButtonTop(editor, element, isDocumentStart));
			}}
		>
			{isBlank ? null : (
				<Gutter
					isContainer={isContainer}
					forceVisible={menuOpen || isBlockSelected}
				>
					<div className="slate-blockToolbarWrapper flex h-[1.5em]">
						<div className="slate-blockToolbar pointer-events-auto relative mr-1 flex w-[1.125rem] items-center">
							<BlockHandleMenu
								element={element}
								handleRef={handleRef}
								isDragging={Boolean(isDragging)}
								onMenuOpenChange={setMenuOpen}
								onPrepareDrag={prepareDrag}
								style={{ top: `${dragButtonTop + 3}px` }}
							/>
						</div>
					</div>
				</Gutter>
			)}

			{/* biome-ignore lint/a11y/noStaticElementInteractions: right-click selects the block */}
			<div
				ref={nodeRef}
				className="slate-blockWrapper flow-root"
				onContextMenu={(event) =>
					editor
						.getApi(BlockSelectionPlugin)
						.blockSelection.addOnContextMenu({ element, event })
				}
			>
				<MemoizedChildren>{children}</MemoizedChildren>
				<DropLine />
			</div>
		</div>
	);
}

function Gutter({
	children,
	forceVisible,
	isContainer,
}: {
	children: React.ReactNode;
	forceVisible: boolean;
	isContainer: boolean;
}) {
	return (
		<div
			className={cn(
				"slate-gutterLeft",
				"-translate-x-full absolute top-0 z-50 flex h-full cursor-grab opacity-0",
				isContainer
					? "group-hover/container:opacity-100"
					: "group-hover:opacity-100",
				forceVisible && "opacity-100",
				// Marquee in progress: hide the handle so it never appears under the
				// pointer. Attribute comes from BlockDragStateBridge.
				!forceVisible && "[[data-dnd-selection-area]_&]:hidden",
			)}
			contentEditable={false}
		>
			{children}
		</div>
	);
}

const DropLine = React.memo(function DropLine() {
	const { dropLine } = useDropLine();
	if (!dropLine) return null;

	return (
		<div
			className={cn(
				"slate-dropLine pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-foreground/40",
				dropLine === "top" && "-top-px",
				dropLine === "bottom" && "-bottom-px",
			)}
		/>
	);
});

function isIdInDraggingSet(
	id: unknown,
	draggingId: string | string[] | null | undefined,
): boolean {
	if (typeof id !== "string" || draggingId == null) return false;
	return Array.isArray(draggingId)
		? draggingId.includes(id)
		: draggingId === id;
}

/**
 * Block top margins are fixed rem keyed by element type, plus the document-start
 * heading reset — so one measurement serves every block of the same shape.
 *
 * This matters because the caller is the block's `mouseenter`, which also fires
 * for every block that scrolls past a resting pointer (and when typing reflows
 * the document under one). Measuring there forced a style recalc per block.
 */
const dragButtonTopCache = new Map<string, number>();

const calcDragButtonTop = (
	editor: PlateEditor,
	element: TElement,
	isDocumentStart: boolean,
): number => {
	// uiScale is applied as an inline root font-size, so reading it back is a
	// CSSOM lookup rather than a layout read.
	const key = `${document.documentElement.style.fontSize}|${element.type}|${isDocumentStart}`;
	const cached = dragButtonTopCache.get(key);
	if (cached !== undefined) return cached;
	const child = editor.api.toDOMNode(element);
	if (!child) return 0;
	const marginTop = Number.parseFloat(window.getComputedStyle(child).marginTop);
	const top = Number.isFinite(marginTop) ? marginTop : 0;
	dragButtonTopCache.set(key, top);
	return top;
};
