/**
 * In-memory layout analysis results keyed by EmbedPDF documentId (tab scope).
 * Step 1 only: bbox collection for UI / console. Sidecar persistence comes later.
 */

import { createStore } from "zustand/vanilla";

import type {
	LayoutAnalysisUiStatus,
	PdfLayoutDocumentResult,
} from "@/lib/pdf/layout/types";

type LayoutStoreState = {
	/** Last successful result per document. */
	byDocument: Record<string, PdfLayoutDocumentResult>;
	/** UI progress for the active analysis run (global; one at a time). */
	ui: LayoutAnalysisUiStatus;
	activeDocumentId: string | null;
	/**
	 * Focused region for PDF overlay + sidebar selection.
	 * `documentId` scopes the highlight to the owning PDF tab.
	 */
	focused: { documentId: string; regionId: string } | null;
	/**
	 * Whether the EmbedPDF layout bbox overlay is shown per document.
	 * Figures rail toggles this; PDF viewer mirrors into the plugin.
	 */
	overlayVisible: Record<string, boolean>;
};

export const layoutAnalysisStore = createStore<LayoutStoreState>(() => ({
	byDocument: {},
	ui: { stage: "idle" },
	activeDocumentId: null,
	focused: null,
	overlayVisible: {},
}));

export function setLayoutAnalysisUi(
	ui: LayoutAnalysisUiStatus,
	documentId?: string | null,
): void {
	layoutAnalysisStore.setState((state) => ({
		ui,
		activeDocumentId:
			documentId === undefined ? state.activeDocumentId : documentId,
	}));
}

export function setLayoutDocumentResult(result: PdfLayoutDocumentResult): void {
	layoutAnalysisStore.setState((state) => ({
		byDocument: {
			...state.byDocument,
			[result.documentId]: result,
		},
	}));
}

export function getLayoutDocumentResult(
	documentId: string,
): PdfLayoutDocumentResult | null {
	return layoutAnalysisStore.getState().byDocument[documentId] ?? null;
}

export function clearLayoutDocumentResult(documentId: string): void {
	layoutAnalysisStore.setState((state) => {
		if (!(documentId in state.byDocument)) return state;
		const next = { ...state.byDocument };
		delete next[documentId];
		const focused =
			state.focused?.documentId === documentId ? null : state.focused;
		const overlayVisible = { ...state.overlayVisible };
		delete overlayVisible[documentId];
		return { byDocument: next, focused, overlayVisible };
	});
}

export function setLayoutOverlayVisible(
	documentId: string,
	visible: boolean,
): void {
	layoutAnalysisStore.setState((state) => {
		if ((state.overlayVisible[documentId] ?? false) === visible) return state;
		return {
			overlayVisible: {
				...state.overlayVisible,
				[documentId]: visible,
			},
		};
	});
}

export function toggleLayoutOverlayVisible(documentId: string): boolean {
	const next = !(
		layoutAnalysisStore.getState().overlayVisible[documentId] ?? false
	);
	setLayoutOverlayVisible(documentId, next);
	return next;
}

export function isLayoutOverlayVisible(documentId: string): boolean {
	return layoutAnalysisStore.getState().overlayVisible[documentId] ?? false;
}

export function setFocusedLayoutRegion(
	documentId: string,
	regionId: string | null,
): void {
	layoutAnalysisStore.setState({
		focused: regionId ? { documentId, regionId } : null,
	});
}

export function getFocusedLayoutRegion(documentId: string): string | null {
	const focused = layoutAnalysisStore.getState().focused;
	if (!focused || focused.documentId !== documentId) return null;
	return focused.regionId;
}

/**
 * Drop every document's layout analysis. Keys are tab-scoped documentIds and a
 * vault switch closes all tabs, so these results can never be reused.
 */
export function clearLayoutVaultState(): void {
	layoutAnalysisStore.setState({
		byDocument: {},
		ui: { stage: "idle" },
		activeDocumentId: null,
		focused: null,
		overlayVisible: {},
	});
}
