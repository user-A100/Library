import { createPortal } from "react-dom";
import { AskPopover } from "@/components/viewer/pdf/cards/ask-popover";
import {
	type CitationPreviewImportMenu,
	PdfCitationPreview,
} from "@/components/viewer/pdf/cards/citation-preview";
import { PdfCrossrefPreview } from "@/components/viewer/pdf/cards/crossref-preview";
import { SelectionMenu } from "@/components/viewer/pdf/cards/selection-menu";
import { TranslateCard } from "@/components/viewer/pdf/cards/translate-card";
import { VisualTraceCard } from "@/components/viewer/pdf/cards/visual-trace-card";
import type {
	CardScreenPoint,
	CitationPreviewState,
	CrossrefPreviewState,
	SelectionMenuState,
} from "@/components/viewer/pdf/types";
import type { PdfVisualSessionTrace } from "@/lib/pdf/agent-trace";
import type { PdfAskThread } from "@/lib/pdf/ask";
import type { HighlightColor } from "@/lib/pdf/highlight/palette";
import type { PdfTranslateRecord } from "@/lib/pdf/translate/types";

type PdfCardStackProps = {
	selectionMenu: {
		state: SelectionMenuState | null;
		onHighlight: (color: HighlightColor) => void;
		onCopy: () => void;
		onNote: () => void;
		onAsk: () => void;
		onAddToChat: () => void;
		onTranslate: () => void;
		onClose: () => void;
		/** Hide highlight / note / translate; keep Copy / Ask / Add-to-chat. */
		readOnly?: boolean;
	};
	citationPreview: {
		state: CitationPreviewState | null;
		importMenu?: CitationPreviewImportMenu;
		onHoverEnter: () => void;
		onHoverLeave: () => void;
	};
	crossrefPreview: {
		state: CrossrefPreviewState | null;
		onHoverEnter: () => void;
		onHoverLeave: () => void;
	};
	/** Shared anchor of the pin-attached cards (ask / translate). */
	cardScreen: CardScreenPoint | null;
	/** Shared hover-hide contract of the pin-attached cards. */
	onCardHoverEnter: () => void;
	onCardHoverLeave: () => void;
	ask: {
		thread: PdfAskThread | null;
		/** Catalog title for the external "open in chat" query. */
		paperTitle?: string;
		/** Catalog arXiv / source link for the external "open in chat" query. */
		paperLink?: string;
		streaming: boolean;
		error: string | null;
		onSend: (question: string) => void;
		onResend: (messageId: string, question: string) => void;
		onHide: () => void;
		onDelete: () => void;
		onStop: () => void;
	};
	translate: {
		record: PdfTranslateRecord | null;
		streaming: boolean;
		error: string | null;
		onOpenSettings: () => void;
		onHide: () => void;
		onDelete: () => void;
	};
	visual: {
		trace: PdfVisualSessionTrace | null;
		onHide: () => void;
		onDelete: () => void;
	};
};

/**
 * Floating cards of the viewer, portaled to `document.body` so page transforms
 * and the scroller's overflow never clip or scale them.
 */
export function PdfCardStack({
	selectionMenu,
	citationPreview,
	crossrefPreview,
	cardScreen,
	onCardHoverEnter,
	onCardHoverLeave,
	ask,
	translate,
	visual,
}: PdfCardStackProps) {
	if (typeof document === "undefined") return null;

	return createPortal(
		<>
			{selectionMenu.state ? (
				<SelectionMenu
					screen={selectionMenu.state.screen}
					onHighlight={selectionMenu.onHighlight}
					onCopy={selectionMenu.onCopy}
					onNote={selectionMenu.onNote}
					onAsk={selectionMenu.onAsk}
					onAddToChat={selectionMenu.onAddToChat}
					onTranslate={selectionMenu.onTranslate}
					onClose={selectionMenu.onClose}
					readOnly={selectionMenu.readOnly}
				/>
			) : null}

			{citationPreview.state ? (
				<PdfCitationPreview
					screen={citationPreview.state.screen}
					matched={citationPreview.state.matched}
					importMenu={citationPreview.importMenu}
					onPointerEnter={citationPreview.onHoverEnter}
					onPointerLeave={citationPreview.onHoverLeave}
				/>
			) : null}

			{crossrefPreview.state ? (
				<PdfCrossrefPreview
					screen={crossrefPreview.state.screen}
					kind={crossrefPreview.state.kind}
					page={crossrefPreview.state.page}
					image={crossrefPreview.state.image}
					onPointerEnter={crossrefPreview.onHoverEnter}
					onPointerLeave={crossrefPreview.onHoverLeave}
				/>
			) : null}

			{ask.thread && cardScreen ? (
				<AskPopover
					thread={ask.thread}
					paperTitle={ask.paperTitle}
					paperLink={ask.paperLink}
					screen={cardScreen}
					preferRight={cardScreen.preferRight ?? true}
					streaming={ask.streaming}
					error={ask.error}
					onSend={ask.onSend}
					onResend={ask.onResend}
					onHide={ask.onHide}
					onDelete={ask.onDelete}
					onPointerEnter={onCardHoverEnter}
					onPointerLeave={onCardHoverLeave}
					onStop={ask.onStop}
				/>
			) : null}

			{translate.record && cardScreen ? (
				<TranslateCard
					screen={cardScreen}
					preferRight={cardScreen.preferRight ?? true}
					result={translate.record.result ?? ""}
					streaming={translate.streaming}
					error={translate.error ?? translate.record.error ?? null}
					onOpenSettings={translate.onOpenSettings}
					onHide={translate.onHide}
					onDelete={translate.onDelete}
					onPointerEnter={onCardHoverEnter}
					onPointerLeave={onCardHoverLeave}
				/>
			) : null}

			{visual.trace && cardScreen ? (
				<VisualTraceCard
					trace={visual.trace}
					screen={cardScreen}
					preferRight={cardScreen.preferRight ?? true}
					onHide={visual.onHide}
					onDelete={visual.onDelete}
					onPointerEnter={onCardHoverEnter}
					onPointerLeave={onCardHoverLeave}
				/>
			) : null}
		</>,
		document.body,
	);
}
