import type { PdfBookmarkObject } from "@embedpdf/models";
import { OutlineTree } from "@/components/viewer/pdf/chrome/outline-tree";

type PdfOutlinePanelProps = {
	/** Document bookmarks; both the toggle and the panel hide when empty. */
	outline: PdfBookmarkObject[];
	showOutline: boolean;
	onGoToPage: (page: number) => void;
};

/** Collapsible bookmark sidebar. The toggle button lives in PdfLeftToolbar. */
export function PdfOutlinePanel({
	outline,
	showOutline,
	onGoToPage,
}: PdfOutlinePanelProps) {
	if (!showOutline || outline.length === 0) return null;

	return (
		<aside className="agentero-scroll absolute inset-y-0 left-0 z-20 w-80 border-r bg-background/95 pt-11 pb-2 backdrop-blur-sm">
			<div className="px-2">
				<OutlineTree nodes={outline} depth={0} onGoToPage={onGoToPage} />
			</div>
		</aside>
	);
}
