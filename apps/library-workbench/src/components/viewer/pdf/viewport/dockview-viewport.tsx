import {
	useIsViewportGated,
	useViewportCapability,
	useViewportPlugin,
	ViewportElementContext,
} from "@embedpdf/plugin-viewport/react";
import {
	type HTMLAttributes,
	type ReactNode,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPdfViewportResizeGate } from "@/lib/pdf/dockview-resize";
import { isDockviewSashTarget } from "@/lib/workspace/dockview-sash";

type DockviewViewportProps = HTMLAttributes<HTMLDivElement> & {
	children: ReactNode;
	documentId: string;
	hostRef: RefObject<HTMLDivElement | null>;
	/**
	 * Extra right padding (px) beyond the viewport gap, reserving room for
	 * overlays pinned outside the page's right edge (comment rail) so they do
	 * not grow scrollWidth into a horizontal scrollbar.
	 */
	rightGutter?: number;
};

/**
 * Dockview updates panel geometry on every sash pointermove. EmbedPDF's
 * ResizeObserver otherwise turns each of those moves into viewport + scroll
 * state updates. Keep the DOM viewport following the panel while resize
 * metrics are gated; releasing the sash lets EmbedPDF observe the final size
 * once.
 */
export function DockviewViewport({
	children,
	documentId,
	hostRef,
	rightGutter = 0,
	...props
}: DockviewViewportProps) {
	const [viewportGap, setViewportGap] = useState(0);
	const viewportRef = useRef<HTMLDivElement>(null);
	const { plugin: viewportPlugin } = useViewportPlugin();
	const { provides: viewportCapability } = useViewportCapability();
	const isGated = useIsViewportGated(documentId);

	useEffect(() => {
		if (viewportCapability) {
			setViewportGap(viewportCapability.getViewportGap());
		}
	}, [viewportCapability]);

	useLayoutEffect(() => {
		const viewport = viewportRef.current;
		if (!viewportPlugin || !viewport) return;

		try {
			viewportPlugin.registerViewport(documentId);
		} catch {
			return;
		}

		const ownerDocument = viewport.ownerDocument;
		const ownerWindow = ownerDocument.defaultView;
		const workspace = hostRef.current?.closest(".agentero-dockview") ?? null;
		const requestFrame = (callback: FrameRequestCallback) =>
			ownerWindow
				? ownerWindow.requestAnimationFrame(callback)
				: requestAnimationFrame(callback);
		const cancelFrame = (handle: number) => {
			if (ownerWindow) ownerWindow.cancelAnimationFrame(handle);
			else cancelAnimationFrame(handle);
		};
		const commitResize = () => {
			// Report a reduced width so EmbedPDF's fitWidth zoom leaves room for the
			// comment rail that overflows into the reserved right gutter.
			const width = Math.max(1, viewport.offsetWidth - rightGutter);
			const clientWidth = Math.max(1, viewport.clientWidth - rightGutter);
			viewportPlugin.setViewportResizeMetrics(documentId, {
				width,
				height: viewport.offsetHeight,
				clientWidth,
				clientHeight: viewport.clientHeight,
				scrollTop: viewport.scrollTop,
				scrollLeft: viewport.scrollLeft,
				scrollWidth: viewport.scrollWidth,
				scrollHeight: viewport.scrollHeight,
				clientLeft: viewport.clientLeft,
				clientTop: viewport.clientTop,
			});
		};
		const resizeGate = createPdfViewportResizeGate({
			commitResize,
			requestFrame,
			cancelFrame,
		});
		let dockResizeActive = false;

		const removeEndListeners = () => {
			ownerDocument.removeEventListener("pointerup", finishResize, true);
			ownerDocument.removeEventListener("pointercancel", finishResize, true);
			ownerDocument.removeEventListener("contextmenu", finishResize, true);
			ownerWindow?.removeEventListener("blur", finishResize);
		};

		const finishResize = () => {
			if (!dockResizeActive) return;
			dockResizeActive = false;
			removeEndListeners();
			resizeGate.endDockResize();
		};

		const handlePointerDown = (event: PointerEvent) => {
			if (
				dockResizeActive ||
				!workspace ||
				!isDockviewSashTarget(event.target, workspace)
			) {
				return;
			}

			dockResizeActive = true;
			resizeGate.beginDockResize();
			ownerDocument.addEventListener("pointerup", finishResize, true);
			ownerDocument.addEventListener("pointercancel", finishResize, true);
			ownerDocument.addEventListener("contextmenu", finishResize, true);
			ownerWindow?.addEventListener("blur", finishResize);
		};

		let scrollFrame: number | null = null;
		const handleScroll = () => {
			if (scrollFrame != null) return;
			scrollFrame = requestFrame(() => {
				scrollFrame = null;
				viewportPlugin.setViewportScrollMetrics(documentId, {
					scrollTop: viewport.scrollTop,
					scrollLeft: viewport.scrollLeft,
				});
			});
		};
		viewport.addEventListener("scroll", handleScroll, { passive: true });

		const ResizeObserverCtor = ownerWindow?.ResizeObserver ?? ResizeObserver;
		const resizeObserver = new ResizeObserverCtor(() => {
			resizeGate.notifyResize();
		});
		resizeObserver.observe(viewport);

		const unsubscribeScrollRequest = viewportPlugin.onScrollRequest(
			documentId,
			({ x, y, behavior = "auto" }) => {
				requestFrame(() => {
					viewport.scrollTo({ left: x, top: y, behavior });
				});
			},
		);

		ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
			removeEndListeners();
			dockResizeActive = false;
			resizeGate.dispose();
			resizeObserver.disconnect();
			if (scrollFrame != null) cancelFrame(scrollFrame);
			viewport.removeEventListener("scroll", handleScroll);
			unsubscribeScrollRequest();
			viewportPlugin.unregisterViewport(documentId);
		};
	}, [documentId, hostRef, viewportPlugin, rightGutter]);

	const { style, ...restProps } = props;

	return (
		<ViewportElementContext.Provider
			value={viewportRef as RefObject<HTMLDivElement>}
		>
			<div
				{...restProps}
				ref={viewportRef}
				style={{
					width: "100%",
					height: "100%",
					overflow: "auto",
					...style,
					padding: `${viewportGap}px`,
					// The shorthand above would clobber a caller's paddingRight; merge
					// the reserved rail gutter explicitly.
					paddingRight: `${viewportGap + rightGutter}px`,
				}}
			>
				{!isGated && children}
			</div>
		</ViewportElementContext.Provider>
	);
}
