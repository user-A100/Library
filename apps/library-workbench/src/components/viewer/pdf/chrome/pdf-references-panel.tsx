import { ReferencesPanel } from "@/components/viewer/panels/references-panel";

type PdfReferencesPanelProps = {
	vaultPath: string | null;
	paperPath: string | null;
	showReferences: boolean;
};

/** Left-side citation panel. The toggle button lives in PdfLeftToolbar. */
export function PdfReferencesPanel({
	vaultPath,
	paperPath,
	showReferences,
}: PdfReferencesPanelProps) {
	if (!showReferences || !paperPath) return null;

	return (
		<aside className="agentero-scroll absolute inset-y-0 left-0 z-20 w-80 border-r bg-background/95 pt-11 pb-2 backdrop-blur-sm">
			<ReferencesPanel
				vaultPath={vaultPath}
				paperPath={paperPath}
				className="h-full"
				compact
			/>
		</aside>
	);
}
