import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/core/utils";
import { arxivReaderUrl, isArxivHostedUrl } from "@/lib/paper/arxiv";

type HtmlViewerProps = {
	/** Remote URL only — streamed in a sandboxed iframe (no local download) */
	srcUrl?: string | null;
	className?: string;
};

/**
 * HTML paper viewer — remote URL in a separate sandboxed iframe.
 * Does not fetch or cache HTML into the vault.
 */
export function HtmlViewer({ srcUrl, className }: HtmlViewerProps) {
	const { t } = useTranslation("viewer");
	/** While HTML5 DnD is active, disable iframe hit-testing so dragover
	 *  reaches dockview drop targets (sandboxed iframe swallows drag events). */
	const [dragShield, setDragShield] = useState(false);

	useEffect(() => {
		const arm = () => setDragShield(true);
		const disarm = () => setDragShield(false);
		// Capture phase: see tree/OS drags before the event enters the iframe.
		window.addEventListener("dragstart", arm, true);
		window.addEventListener("dragend", disarm, true);
		window.addEventListener("drop", disarm, true);
		return () => {
			window.removeEventListener("dragstart", arm, true);
			window.removeEventListener("dragend", disarm, true);
			window.removeEventListener("drop", disarm, true);
		};
	}, []);

	if (!srcUrl || !/^https?:\/\//i.test(srcUrl)) {
		return (
			<div
				className={cn(
					"flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm",
					className,
				)}
			>
				{t("html.empty")}
			</div>
		);
	}

	const trusted = isArxivHostedUrl(srcUrl);
	const iframeUrl = trusted ? arxivReaderUrl(srcUrl) : srcUrl;
	const sandbox =
		"allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";

	return (
		<div
			className={cn(
				"relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-background",
				className,
			)}
		>
			<iframe
				title={t("html.sandboxTitle")}
				src={iframeUrl}
				sandbox={sandbox}
				referrerPolicy="no-referrer-when-downgrade"
				className={cn(
					"absolute inset-0 block h-full w-full border-0 bg-background",
					dragShield && "pointer-events-none",
				)}
				style={{ colorScheme: "light dark" }}
			/>
		</div>
	);
}
