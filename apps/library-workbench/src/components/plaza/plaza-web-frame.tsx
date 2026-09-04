/**
 * Embedded web page for a Plaza source, with in-frame browsing.
 *
 * Sources that set `embedOrigin` are served through a Host proxy scheme, which
 * retargets the site's `target="_blank"` links so clicks navigate in place and
 * posts each navigation back here. That message stream is the history stack
 * behind Back / Forward — the frame's own `history` object is not usable once it
 * follows a link off to a third-party origin.
 *
 * Navigation is applied by remounting the frame at the target path, so it never
 * pushes entries onto the app's own session history.
 */

import { ArrowLeft, ArrowRight, ExternalLink, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { openExternalUrl } from "@/lib/core/open-external";
import { cn } from "@/lib/core/utils";
import { importPlazaPaper, type PlazaImportRequest } from "@/lib/plaza/import";

/** No `allow-popups`: every link must resolve inside this frame. */
const SANDBOX = "allow-scripts allow-same-origin allow-forms";

type NavMessage = {
	source: "agentero-plaza";
	/** In-frame navigation that just happened. */
	path?: string;
	/** Third-party link the frame refused to follow; open it outside. */
	external?: string;
	/**
	 * Same-origin path the frame declined to render in place (a feed). Reopened
	 * against the upstream site, since the browser cannot resolve our scheme.
	 */
	externalPath?: string;
	/** A paper row's `[入库]` was clicked. */
	importPaper?: PlazaImportRequest;
};

function isNavMessage(data: unknown): data is NavMessage {
	if (typeof data !== "object" || data === null) return false;
	const value = data as Partial<NavMessage>;
	if (value.source !== "agentero-plaza") return false;
	return (
		typeof value.path === "string" ||
		typeof value.external === "string" ||
		typeof value.externalPath === "string" ||
		typeof value.importPaper === "object"
	);
}

export function PlazaWebFrame({
	homeUrl,
	embedOrigin,
	title,
	className,
}: {
	/** Canonical public URL, used for "open in browser". */
	homeUrl: string;
	/** Proxy scheme origin, or null to embed `homeUrl` directly. */
	embedOrigin: string | null;
	title: string;
	className?: string;
}) {
	const { t } = useTranslation("sidebar");
	const homePath = `${new URL(homeUrl).pathname || "/"}${new URL(homeUrl).search}`;
	/** Visited paths and the cursor into them. Grown by proxy nav messages. */
	const [nav, setNav] = useState<{ stack: string[]; index: number }>({
		stack: [homePath],
		index: 0,
	});
	/**
	 * What the frame is mounted at. `epoch` is bumped only by Back / Forward /
	 * Reload: the iframe key depends on it alone, so a link click inside the
	 * frame records history without remounting (which would reload this path and
	 * snap the user back to where the frame started).
	 */
	const [frame, setFrame] = useState({ path: homePath, epoch: 0 });
	/** Needed to post import results back into the frame. */
	const frameRef = useRef<HTMLIFrameElement>(null);
	/** While HTML5 DnD is active, disable frame hit-testing so dragover reaches
	 *  dockview drop targets (the frame otherwise swallows drag events). */
	const [dragShield, setDragShield] = useState(false);

	useEffect(() => {
		const arm = () => setDragShield(true);
		const disarm = () => setDragShield(false);
		window.addEventListener("dragstart", arm, true);
		window.addEventListener("dragend", disarm, true);
		window.addEventListener("drop", disarm, true);
		return () => {
			window.removeEventListener("dragstart", arm, true);
			window.removeEventListener("dragend", disarm, true);
			window.removeEventListener("drop", disarm, true);
		};
	}, []);

	useEffect(() => {
		if (!embedOrigin) return;
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== embedOrigin || !isNavMessage(event.data)) return;
			const { path, external, externalPath, importPaper } = event.data;
			if (external) {
				openExternalUrl(external);
				return;
			}
			if (externalPath) {
				openExternalUrl(new URL(externalPath, homeUrl).href);
				return;
			}
			if (importPaper) {
				void importPlazaPaper(importPaper).then((ok) => {
					frameRef.current?.contentWindow?.postMessage(
						{
							source: "agentero-plaza-host",
							importedId: importPaper.id,
							ok,
						},
						embedOrigin,
					);
				});
				return;
			}
			if (!path) return;
			setNav((prev) => {
				// Already at this entry — either a reload, or the load caused by our
				// own Back / Forward, which moved the cursor before the frame reported.
				if (prev.stack[prev.index] === path) return prev;
				// A new navigation truncates anything ahead of the cursor.
				const stack = [...prev.stack.slice(0, prev.index + 1), path];
				return { stack, index: stack.length - 1 };
			});
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [embedOrigin, homeUrl]);

	const jump = useCallback((delta: number) => {
		setNav((prev) => {
			const index = prev.index + delta;
			const path = prev.stack[index];
			if (path == null) return prev;
			setFrame((f) => ({ path, epoch: f.epoch + 1 }));
			return { ...prev, index };
		});
	}, []);

	const canGoBack = nav.index > 0;
	const canGoForward = nav.index < nav.stack.length - 1;
	const currentPath = nav.stack[nav.index] ?? homePath;
	const frameSrc = embedOrigin ? `${embedOrigin}${frame.path}` : homeUrl;

	return (
		<div
			className={cn(
				"flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background",
				className,
			)}
		>
			<div className="flex h-8 shrink-0 select-none items-center gap-0.5 border-b px-1.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={t("plaza.back")}
							disabled={!canGoBack}
							onClick={() => jump(-1)}
						>
							<ArrowLeft className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{t("plaza.back")}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={t("plaza.forward")}
							disabled={!canGoForward}
							onClick={() => jump(1)}
						>
							<ArrowRight className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{t("plaza.forward")}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={t("plaza.reload")}
							onClick={() =>
								setFrame((f) => ({ path: currentPath, epoch: f.epoch + 1 }))
							}
						>
							<RotateCw className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{t("plaza.reload")}</TooltipContent>
				</Tooltip>
				<span
					className="ml-1 min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
					title={currentPath}
				>
					{currentPath}
				</span>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={t("plaza.openInSystemBrowser")}
							onClick={() =>
								openExternalUrl(new URL(currentPath, homeUrl).href)
							}
						>
							<ExternalLink className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("plaza.openInSystemBrowser")}
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="relative min-h-0 flex-1">
				<iframe
					// Keyed on the epoch alone: only Back / Forward / Reload remount.
					// Keying on observed navigation would reload `frame.path` on every
					// in-frame click and bounce the user back to the starting page.
					key={frame.epoch}
					ref={frameRef}
					title={title}
					src={frameSrc}
					sandbox={SANDBOX}
					referrerPolicy="no-referrer-when-downgrade"
					className={cn(
						"absolute inset-0 block h-full w-full border-0 bg-background",
						dragShield && "pointer-events-none",
					)}
					style={{ colorScheme: "light dark" }}
				/>
			</div>
		</div>
	);
}
