/**
 * Comment rail: one persistent card per annotated highlight / visual note,
 * pinned just outside the page's right edge (`left: 100%` inside the
 * overflow-visible page container, same trick as PageTranslateTab). Cards
 * stack vertically with collision avoidance and clamp into the page height.
 *
 * Click a card to edit the note in place (Notion-style): the body becomes a
 * textarea, ⌘/Ctrl+Enter or blur saves, Escape cancels. No floating editor.
 */

import { Crop, Link2, MessageSquarePlus, Trash2 } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PageAnnotationComment } from "@/components/viewer/pdf/types";
import { useImeGuard } from "@/hooks/use-ime-guard";
import { cn } from "@/lib/core/utils";
import { swatchColorClass } from "@/lib/pdf/highlight/palette";

/** Card width in CSS px — also the gutter width reserved on the viewport. */
export const COMMENT_CARD_WIDTH_PX = 224;
/** Horizontal gap between the page edge and the rail. */
export const COMMENT_CARD_GAP_PX = 8;
/** Extra px so ring + shadow aren't clipped by the viewport overflow. */
const COMMENT_RAIL_BLEED_PX = 4;
/** Viewport right padding that keeps the rail clear of horizontal scroll. */
export const COMMENT_RAIL_WIDTH_PX =
	COMMENT_CARD_WIDTH_PX + COMMENT_CARD_GAP_PX + COMMENT_RAIL_BLEED_PX;

const CARD_GAP_PX = 8;
/** text-xs leading-relaxed ≈ 12px × 1.625. */
const CARD_LINE_HEIGHT_PX = 20;
/** Conservative chars per line at w-56 with padding (CJK-heavy notes). */
const CARD_CHARS_PER_LINE = 15;
/** Padding + color-dot row + blockquote/comment margins. */
const CARD_BASE_HEIGHT_PX = 54;
/** View-mode clamp for the note body. */
const VIEW_COMMENT_LINES = 3;
/** View-mode clamp for the inline visual-mark conversation preview. */
const VIEW_CONVERSATION_PREVIEW_LINES = 3;
/** In-place editor: min rows so an empty new note has room to type. */
const EDIT_MIN_COMMENT_LINES = 3;
/** In-place editor: layout estimate cap; textarea scrolls past this. */
const EDIT_MAX_COMMENT_LINES = 12;

type CommentCardsLayerProps = {
	/** Comments for this page only. */
	items: PageAnnotationComment[];
	/** Rendered page height in px (zoom-aware). */
	pageHeightPx: number;
	/** Id of the card currently being edited in place; null when idle. */
	editingId: string | null;
	/** Resolvable wiki target; copy buttons only render when set. */
	wikiTarget: string | null;
	/** Id of the card currently being hovered; null when idle. */
	hoveredId: string | null;
	onOpen: (comment: PageAnnotationComment) => void;
	onSave: (comment: PageAnnotationComment, text: string) => void;
	onCancel: () => void;
	onDelete: (comment: PageAnnotationComment) => void;
	onCopyLink: (comment: PageAnnotationComment) => void;
	onCopyEmbed: (comment: PageAnnotationComment) => void;
	/** Add this visual mark's crop to the Agent sidebar composer (#396). */
	onAddToChat: (comment: PageAnnotationComment) => void;
	onHover: (comment: PageAnnotationComment) => void;
	onLeave: () => void;
};

export type CommentCardPlacement = {
	id: string;
	topPx: number;
	heightPx: number;
};

/** Visual line count after clamping (comment: view 3 / edit 12). */
function clampedLines(text: string, max: number): number {
	let lines = 0;
	for (const raw of text.split("\n")) {
		lines += Math.max(1, Math.ceil(raw.length / CARD_CHARS_PER_LINE));
		if (lines >= max) return max;
	}
	return Math.max(1, lines);
}

/** Conservative card height estimate from clamped comment + conversation lines. */
export function estimateCommentCardHeight(
	item: PageAnnotationComment,
	editing = false,
): number {
	const commentLines = editing
		? Math.max(
				EDIT_MIN_COMMENT_LINES,
				clampedLines(item.comment, EDIT_MAX_COMMENT_LINES),
			)
		: clampedLines(item.comment, VIEW_COMMENT_LINES);
	const conversationPreviewLines =
		!editing && item.messages && item.messages.length > 0
			? Math.min(
					VIEW_CONVERSATION_PREVIEW_LINES,
					item.messages.reduce(
						(sum, m) => sum + clampedLines(m.content, VIEW_COMMENT_LINES),
						0,
					),
				)
			: 0;
	return (
		CARD_BASE_HEIGHT_PX +
		commentLines * CARD_LINE_HEIGHT_PX +
		conversationPreviewLines * CARD_LINE_HEIGHT_PX
	);
}

/**
 * Anchor each card at its highlight height, then nudge overlapping cards
 * downward (never sideways) and clamp the whole stack into the page height.
 */
export function layoutCommentCards(
	items: PageAnnotationComment[],
	pageHeightPx: number,
	editingId?: string | null,
): CommentCardPlacement[] {
	const sorted = [...items].sort(
		(a, b) => a.anchorY - b.anchorY || a.id.localeCompare(b.id),
	);
	const laid: CommentCardPlacement[] = [];

	for (const item of sorted) {
		const heightPx = estimateCommentCardHeight(item, item.id === editingId);
		const anchorTop = item.anchorY * pageHeightPx;
		const prev = laid[laid.length - 1];
		const topPx = Math.max(
			anchorTop,
			prev ? prev.topPx + prev.heightPx + CARD_GAP_PX : 0,
		);
		laid.push({ id: item.id, topPx, heightPx });
	}

	// Clamp the stack into the page: shift cards up bottom-first, keeping the
	// avoidance gap between neighbours.
	for (let i = laid.length - 1; i >= 0; i -= 1) {
		const card = laid[i];
		const next = laid[i + 1];
		const maxTop = next
			? next.topPx - CARD_GAP_PX - card.heightPx
			: pageHeightPx - card.heightPx;
		card.topPx = Math.max(0, Math.min(card.topPx, maxTop));
	}

	return laid;
}

function autosizeTextarea(el: HTMLTextAreaElement | null) {
	if (!el) return;
	el.style.height = "0px";
	el.style.height = `${Math.max(el.scrollHeight, CARD_LINE_HEIGHT_PX * EDIT_MIN_COMMENT_LINES)}px`;
}

type CommentCardProps = {
	item: PageAnnotationComment;
	topPx: number;
	heightPx: number;
	editing: boolean;
	wikiTarget: string | null;
	hovered: boolean;
	onOpen: (comment: PageAnnotationComment) => void;
	onSave: (comment: PageAnnotationComment, text: string) => void;
	onCancel: () => void;
	onDelete: (comment: PageAnnotationComment) => void;
	onCopyLink: (comment: PageAnnotationComment) => void;
	onCopyEmbed: (comment: PageAnnotationComment) => void;
	onAddToChat: (comment: PageAnnotationComment) => void;
	onHover: (comment: PageAnnotationComment) => void;
	onLeave: () => void;
};

const CommentCard = memo(function CommentCard({
	item,
	topPx,
	heightPx,
	editing,
	wikiTarget,
	hovered,
	onOpen,
	onSave,
	onCancel,
	onDelete,
	onCopyLink,
	onCopyEmbed,
	onAddToChat,
	onHover,
	onLeave,
}: CommentCardProps) {
	const { t } = useTranslation("viewer");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const cancelledRef = useRef(false);
	const itemRef = useRef(item);
	itemRef.current = item;
	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;
	const draftRef = useRef(item.comment);
	const commentSeedRef = useRef(item.comment);
	commentSeedRef.current = item.comment;
	const { isBlockedByIme, compositionProps } = useImeGuard();

	useEffect(() => {
		if (!editing) return;
		cancelledRef.current = false;
		draftRef.current = commentSeedRef.current;
		const el = textareaRef.current;
		if (!el) return;
		el.focus();
		const len = el.value.length;
		el.setSelectionRange(len, len);
		autosizeTextarea(el);
	}, [editing]);

	// Page virtualization unmounts the card if the user scrolls away — treat
	// dirty drafts like blur and commit. Skip no-op saves so React StrictMode's
	// fake unmount doesn't close a freshly opened editor.
	useEffect(() => {
		if (!editing) return;
		return () => {
			if (cancelledRef.current) return;
			if (draftRef.current === commentSeedRef.current) return;
			onSaveRef.current(itemRef.current, draftRef.current);
		};
	}, [editing]);

	const commit = (text: string) => {
		cancelledRef.current = true;
		draftRef.current = text;
		onSave(item, text);
	};

	const cancel = () => {
		cancelledRef.current = true;
		onCancel();
	};

	return (
		<div
			className={cn(
				"group pointer-events-auto absolute select-none rounded-lg bg-background/95 shadow-sm ring-1 backdrop-blur-sm transition-all duration-200 ease-out hover:z-[7] hover:scale-[1.02] hover:shadow-md hover:!h-auto",
				editing
					? "z-[6] ring-2 ring-ring/50"
					: hovered
						? "z-[6] ring-2 ring-primary/40 shadow-md"
						: "ring-border/60",
			)}
			style={{
				left: `calc(100% + ${COMMENT_CARD_GAP_PX}px)`,
				top: topPx,
				width: COMMENT_CARD_WIDTH_PX,
				height: editing ? undefined : heightPx,
				minHeight: heightPx,
			}}
			onPointerEnter={() => onHover(item)}
			onPointerLeave={onLeave}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: blur/pointer isolation for the in-place editor */}
			<div
				className={cn(
					"h-full rounded-[inherit] px-2.5 py-2",
					editing
						? "overflow-visible"
						: "overflow-hidden group-hover:overflow-visible",
				)}
				onPointerDown={(e) => e.stopPropagation()}
				onBlur={
					editing
						? (e) => {
								if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
									return;
								}
								if (cancelledRef.current) return;
								commit(textareaRef.current?.value ?? "");
							}
						: undefined
				}
			>
				{editing ? (
					<div className="block w-full text-left">
						{item.kind === "visual" ? (
							<Crop className="size-2.5 text-muted-foreground" aria-hidden />
						) : (
							<span
								className={cn(
									"block size-2 rounded-full",
									swatchColorClass(item.color),
								)}
								aria-hidden
							/>
						)}
						<textarea
							ref={textareaRef}
							className="mt-1 max-h-60 w-full resize-none bg-transparent p-0 text-[13px] text-foreground/80 leading-relaxed outline-none placeholder:text-muted-foreground/70 select-text"
							placeholder={t("annotations.placeholder")}
							aria-label={t("annotations.editorLabel")}
							defaultValue={item.comment}
							rows={EDIT_MIN_COMMENT_LINES}
							{...compositionProps}
							onChange={(e) => {
								draftRef.current = e.currentTarget.value;
								autosizeTextarea(e.currentTarget);
							}}
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => {
								e.stopPropagation();
								if (e.key === "Escape") {
									e.preventDefault();
									cancel();
									return;
								}
								if (
									e.key === "Enter" &&
									(e.metaKey || e.ctrlKey) &&
									!isBlockedByIme(e)
								) {
									e.preventDefault();
									commit(e.currentTarget.value);
								}
							}}
						/>
					</div>
				) : (
					// biome-ignore lint/a11y/useSemanticElements: a native <button> cannot wrap the blockquote/p flow content
					<div
						role="button"
						tabIndex={0}
						className="block w-full cursor-text text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						onClick={(e) => {
							e.stopPropagation();
							onOpen(item);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onOpen(item);
							}
						}}
					>
						{item.kind === "visual" ? (
							<Crop className="size-2.5 text-muted-foreground" aria-hidden />
						) : (
							<span
								className={cn(
									"block size-2 rounded-full",
									swatchColorClass(item.color),
								)}
								aria-hidden
							/>
						)}
						<p
							className={cn(
								"mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed",
								item.comment.trim()
									? "text-foreground/80"
									: "text-muted-foreground/70",
							)}
						>
							{item.comment.trim() || t("annotations.placeholder")}
						</p>
						{item.messages && item.messages.length > 0 ? (
							<div className="mt-1.5 border-t border-border/40 pt-1.5">
								<div className="line-clamp-3 space-y-1 group-hover:line-clamp-none">
									{item.messages.map((m) => (
										<p
											key={m.id}
											className={cn(
												"whitespace-pre-wrap break-words text-[11px] leading-relaxed",
												m.role === "assistant"
													? "text-muted-foreground"
													: "text-foreground/80",
											)}
										>
											{m.content}
										</p>
									))}
								</div>
							</div>
						) : null}
					</div>
				)}
				<div
					className={cn(
						"absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-lg bg-background/80 p-0.5 shadow-sm ring-1 ring-border/60 backdrop-blur-sm transition-opacity duration-150",
						editing
							? "opacity-0 group-hover:opacity-100"
							: "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
					)}
				>
					{wikiTarget ? (
						<>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon-xs"
										className="size-6 text-muted-foreground hover:text-foreground"
										aria-label={t("annotations.copyLink")}
										onClick={(e) => {
											e.stopPropagation();
											onCopyLink(item);
										}}
									>
										<Link2 className="size-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>{t("annotations.copyLink")}</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon-xs"
										className="size-6 text-muted-foreground hover:text-foreground"
										aria-label={t("annotations.copyEmbed")}
										onClick={(e) => {
											e.stopPropagation();
											onCopyEmbed(item);
										}}
									>
										<span className="font-mono text-[10px] leading-none">
											![[
										</span>
									</Button>
								</TooltipTrigger>
								<TooltipContent>{t("annotations.copyEmbed")}</TooltipContent>
							</Tooltip>
						</>
					) : null}
					{item.kind === "visual" ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									className="size-6 text-muted-foreground hover:text-foreground"
									aria-label={t("pdfExplain.addToSidebarChat")}
									onClick={(e) => {
										e.stopPropagation();
										onAddToChat(item);
									}}
								>
									<MessageSquarePlus className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{t("pdfExplain.addToSidebarChat")}
							</TooltipContent>
						</Tooltip>
					) : null}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								className="size-6 text-muted-foreground hover:text-destructive"
								aria-label={t("annotations.delete")}
								onClick={(e) => {
									e.stopPropagation();
									cancelledRef.current = true;
									onDelete(item);
								}}
							>
								<Trash2 className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{t("annotations.delete")}</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</div>
	);
});

export const CommentCardsLayer = memo(function CommentCardsLayer({
	items,
	pageHeightPx,
	editingId,
	wikiTarget,
	hoveredId,
	onOpen,
	onSave,
	onCancel,
	onDelete,
	onCopyLink,
	onCopyEmbed,
	onAddToChat,
	onHover,
	onLeave,
}: CommentCardsLayerProps) {
	if (!items.length) return null;

	const laid = layoutCommentCards(items, pageHeightPx, editingId);
	const byId = new Map(items.map((item) => [item.id, item]));

	return (
		<div className="pointer-events-none absolute inset-0 z-[5] overflow-visible">
			<TooltipProvider delayDuration={200}>
				{laid.map((pos) => {
					const item = byId.get(pos.id);
					if (!item) return null;
					return (
						<CommentCard
							key={item.id}
							item={item}
							topPx={pos.topPx}
							heightPx={pos.heightPx}
							editing={item.id === editingId}
							wikiTarget={wikiTarget}
							hovered={item.id === hoveredId}
							onOpen={onOpen}
							onSave={onSave}
							onCancel={onCancel}
							onDelete={onDelete}
							onCopyLink={onCopyLink}
							onCopyEmbed={onCopyEmbed}
							onAddToChat={onAddToChat}
							onHover={onHover}
							onLeave={onLeave}
						/>
					);
				})}
			</TooltipProvider>
		</div>
	);
});
