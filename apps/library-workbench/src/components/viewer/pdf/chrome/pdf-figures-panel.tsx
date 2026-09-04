import { FiguresPanel } from "@/components/viewer/panels/figures-panel";
import type { PdfLayoutRegion } from "@/lib/pdf/layout";

type PdfFiguresPanelProps = {
	documentId: string;
	showFigures: boolean;
	analyzing?: boolean;
	onAnalyze: () => void;
	onJump: (region: PdfLayoutRegion) => void;
	onRenderThumb: (region: PdfLayoutRegion) => Promise<{
		mimeType: string;
		data: string;
	} | null>;
};

/** Left-side layout analysis panel. The toggle button lives in PdfLeftToolbar. */
export function PdfFiguresPanel({
	documentId,
	showFigures,
	analyzing,
	onAnalyze,
	onJump,
	onRenderThumb,
}: PdfFiguresPanelProps) {
	if (!showFigures) return null;

	return (
		<aside className="absolute inset-y-0 left-0 z-20 w-80 overflow-hidden border-r bg-background/95 pt-11 pb-2 backdrop-blur-sm">
			<FiguresPanel
				documentId={documentId}
				viewerReady
				analyzing={analyzing}
				onAnalyze={onAnalyze}
				onJump={onJump}
				onRenderThumb={onRenderThumb}
				className="h-full"
				compact
			/>
		</aside>
	);
}
