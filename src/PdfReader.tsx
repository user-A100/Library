import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfOutlineEntry = {
  title: string;
  page: number;
  children?: PdfOutlineEntry[];
};

export function mergePdfSelectionRects(rects: number[][]): number[][] {
  const normalized = rects
    .filter((rect) => rect.length >= 4 && rect.slice(0, 4).every(Number.isFinite))
    .map((rect) => [
      Math.max(0, Math.min(rect[0], rect[2])),
      Math.max(0, Math.min(rect[1], rect[3])),
      Math.min(1, Math.max(rect[0], rect[2])),
      Math.min(1, Math.max(rect[1], rect[3])),
    ])
    .filter((rect) => rect[2] - rect[0] > 0.0001 && rect[3] - rect[1] > 0.0001)
    .sort((a, b) => ((a[1] + a[3]) / 2) - ((b[1] + b[3]) / 2) || a[0] - b[0]);

  const lines: Array<{ top: number; bottom: number; rects: number[][] }> = [];
  for (const rect of normalized) {
    const centerY = (rect[1] + rect[3]) / 2;
    const height = rect[3] - rect[1];
    let bestLine: (typeof lines)[number] | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const lineCenterY = (line.top + line.bottom) / 2;
      const lineHeight = line.bottom - line.top;
      const overlap = Math.max(0, Math.min(rect[3], line.bottom) - Math.max(rect[1], line.top));
      const overlapRatio = overlap / Math.max(0.0001, Math.min(height, lineHeight));
      const centerDistance = Math.abs(centerY - lineCenterY);
      if ((overlapRatio >= 0.52 || centerDistance <= Math.max(height, lineHeight) * 0.42) && centerDistance < bestDistance) {
        bestLine = line;
        bestDistance = centerDistance;
      }
    }
    if (bestLine) {
      bestLine.top = Math.min(bestLine.top, rect[1]);
      bestLine.bottom = Math.max(bestLine.bottom, rect[3]);
      bestLine.rects.push(rect);
    } else {
      lines.push({ top: rect[1], bottom: rect[3], rects: [rect] });
    }
  }

  return lines
    .sort((a, b) => a.top - b.top)
    .flatMap((line) => {
      const lineHeight = line.bottom - line.top;
      const gapAllowance = Math.max(0.0035, Math.min(0.014, lineHeight * 0.82));
      const segments: number[][] = [];
      for (const rect of line.rects.sort((a, b) => a[0] - b[0])) {
        const current = segments.at(-1);
        if (current && rect[0] <= current[2] + gapAllowance) {
          current[0] = Math.min(current[0], rect[0]);
          current[1] = Math.min(current[1], rect[1]);
          current[2] = Math.max(current[2], rect[2]);
          current[3] = Math.max(current[3], rect[3]);
        } else {
          segments.push([...rect]);
        }
      }
      return segments.map((segment) => [
        Math.max(0, segment[0] - 0.0007),
        segment[1],
        Math.min(1, segment[2] + 0.0007),
        segment[3],
      ]);
    });
}

type PdfDocumentState = {
  document: PDFDocumentProxy | null;
  outline: PdfOutlineEntry[];
  loading: boolean;
  error: string | null;
};

function normalizeHeading(value: string) {
  return value
    .replace(/([\u3400-\u9fff，。：；！？])\1{2}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

async function destinationPage(document: PDFDocumentProxy, destination: unknown) {
  try {
    const resolved = typeof destination === "string" ? await document.getDestination(destination) : destination;
    if (!Array.isArray(resolved) || !resolved[0]) return 1;
    if (typeof resolved[0] === "number") return resolved[0] + 1;
    return (await document.getPageIndex(resolved[0])) + 1;
  } catch {
    return 1;
  }
}

async function resolveNativeOutline(document: PDFDocumentProxy) {
  const source = await document.getOutline();
  if (!source?.length) return [];

  const resolveItems = async (items: typeof source): Promise<PdfOutlineEntry[]> => {
    const entries: PdfOutlineEntry[] = [];
    for (const item of items) {
      const children = item.items?.length ? await resolveItems(item.items) : undefined;
      entries.push({
        title: normalizeHeading(item.title),
        page: await destinationPage(document, item.dest),
        children,
      });
    }
    return entries;
  };

  return resolveItems(source);
}

function pageLines(items: Awaited<ReturnType<PDFPageProxy["getTextContent"]>>["items"]) {
  const lines: string[] = [];
  let current = "";
  items.forEach((item) => {
    if (!("str" in item)) return;
    current += item.str;
    if (item.hasEOL) {
      const normalized = normalizeHeading(current);
      if (normalized) lines.push(normalized);
      current = "";
    }
  });
  const trailing = normalizeHeading(current);
  if (trailing) lines.push(trailing);
  return lines;
}

async function generateOutlineFromText(document: PDFDocumentProxy) {
  const flatEntries: PdfOutlineEntry[] = [];
  const namedHeadingPattern = /^(摘要|Abstract|引言|结论|总结|参考文献|致谢)$/;
  const numberedHeadingPattern = /^[1-9]\d?(?:\.\d+){0,3}\s+[\u3400-\u9fffA-Za-z]/;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const candidates = pageLines(textContent.items)
      .filter((line) => line.length <= 46 && (namedHeadingPattern.test(line) || numberedHeadingPattern.test(line)))
      .filter((line) => !/^\d+$/.test(line));

    candidates.forEach((title) => {
      if (!flatEntries.some((entry) => entry.title === title)) flatEntries.push({ title, page: pageNumber });
    });
  }

  if (!flatEntries.length) {
    return Array.from({ length: document.numPages }, (_, index) => ({ title: `第 ${index + 1} 页`, page: index + 1 }));
  }

  const groupedEntries: PdfOutlineEntry[] = [];
  let currentSection: PdfOutlineEntry | null = null;
  flatEntries.forEach((entry) => {
    const sectionMatch = entry.title.match(/^([1-9]\d?)\s+/);
    const childMatch = entry.title.match(/^([1-9]\d?)\./);
    if (sectionMatch) {
      currentSection = { ...entry, children: [] };
      groupedEntries.push(currentSection);
      return;
    }
    if (childMatch && currentSection && currentSection.title.startsWith(`${childMatch[1]} `)) {
      currentSection.children?.push(entry);
      return;
    }
    groupedEntries.push(entry);
    currentSection = null;
  });

  return groupedEntries.slice(0, 40);
}

export function usePdfDocument(source: string | null): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({ document: null, outline: [], loading: false, error: null });

  useEffect(() => {
    if (!source) {
      setState({ document: null, outline: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    const loadingTask = getDocument({ url: source });
    setState({ document: null, outline: [], loading: true, error: null });

    loadingTask.promise.then(async (document) => {
      const nativeOutline = await resolveNativeOutline(document);
      const outline = nativeOutline.length ? nativeOutline : await generateOutlineFromText(document);
      if (!cancelled) setState({ document, outline, loading: false, error: null });
    }).catch(() => {
      if (!cancelled) setState({ document: null, outline: [], loading: false, error: "PDF 加载失败" });
    });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [source]);

  return state;
}

type PdfPageCanvasProps = {
  document: PDFDocumentProxy;
  pageNumber: number;
  fitMode?: "width" | "page" | "custom";
  zoom?: number;
  thumbnailWidth?: number;
  annotations?: PdfVisualAnnotation[];
  focusRegion?: { id?: string; bbox: [number, number, number, number] } | null;
};

export type PdfVisualAnnotation = {
  id: string;
  type: "highlight" | "underline" | "note" | "area" | "ink";
  color: string;
  text: string;
  comment: string;
  pageLabel: string;
  dateModified?: string;
  readOnly?: boolean;
  position: {
    blockId?: string;
    rects?: number[][];
  };
};

type PdfSidenoteMarginProps = {
  annotations: PdfVisualAnnotation[];
  activeAnnotationId: string | null;
  annotationNumbers: Map<string, number>;
  onActivate: (annotationId: string) => void;
  onCommentChange?: (annotationId: string, comment: string) => void;
  onDelete?: (annotationId: string) => void;
};

function PdfSidenoteMargin({ annotations, activeAnnotationId, annotationNumbers, onActivate, onCommentChange, onDelete }: PdfSidenoteMarginProps) {
  const marginRef = useRef<HTMLElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const margin = marginRef.current;
    const pageSurface = margin?.parentElement?.querySelector<HTMLElement>(".pdf-page-surface");
    if (!margin || !pageSurface) return;
    let animationFrame = 0;

    const layoutCards = () => {
      animationFrame = 0;
      const pageHeight = pageSurface.offsetHeight;
      if (!pageHeight) return;
      const ordered = annotations
        .map((annotation) => ({
          annotation,
          element: cardRefs.current.get(annotation.id),
          anchor: (annotation.position.rects?.[0]?.[1] ?? 0.08) * pageHeight,
        }))
        .filter((item): item is typeof item & { element: HTMLElement } => Boolean(item.element))
        .sort((a, b) => a.anchor - b.anchor);

      let nextFreeY = 0;
      for (const item of ordered) {
        const top = Math.max(item.anchor, nextFreeY);
        item.element.style.setProperty("--sidenote-top", `${top}px`);
        nextFreeY = top + item.element.offsetHeight + 10;
      }
      margin.style.height = `${Math.max(pageHeight, nextFreeY)}px`;
    };
    const scheduleLayout = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(layoutCards);
    };
    const resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(pageSurface);
    cardRefs.current.forEach((card) => resizeObserver.observe(card));
    scheduleLayout();

    return () => {
      resizeObserver.disconnect();
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [activeAnnotationId, annotations]);

  const typeLabels: Record<PdfVisualAnnotation["type"], string> = {
    highlight: "高亮",
    underline: "下划线",
    note: "便签",
    area: "区域",
    ink: "墨迹",
  };

  return (
    <aside className="pdf-sidenote-margin" aria-label="侧边批注" ref={marginRef}>
      {annotations.map((annotation) => (
        <article
          className="pdf-sidenote-card"
          data-active={activeAnnotationId === annotation.id}
          key={annotation.id}
          ref={(element) => {
            if (element) cardRefs.current.set(annotation.id, element);
            else cardRefs.current.delete(annotation.id);
          }}
          style={{ "--annotation-color": annotation.color } as React.CSSProperties}
        >
          <header className="pdf-sidenote-card-header">
            <button className="pdf-sidenote-card-anchor" type="button" aria-label={`定位批注 ${annotationNumbers.get(annotation.id)}`} onClick={() => onActivate(annotation.id)}>
              <b>{annotationNumbers.get(annotation.id)}</b>
              <span>{typeLabels[annotation.type]} · p. {annotation.pageLabel}</span>
            </button>
            {onDelete && !annotation.readOnly && (
              <button className="pdf-sidenote-delete" type="button" aria-label={`删除批注 ${annotationNumbers.get(annotation.id)}`} title="删除批注（可撤销）" onClick={() => onDelete(annotation.id)}>
                <Trash2 size={13} />
              </button>
            )}
          </header>
          {annotation.text && <blockquote>{annotation.text}</blockquote>}
          <textarea
            aria-label={`编辑侧边批注 ${annotationNumbers.get(annotation.id)}`}
            defaultValue={annotation.comment}
            key={`${annotation.id}-${annotation.comment}`}
            onFocus={() => onActivate(annotation.id)}
            onBlur={(event) => onCommentChange?.(annotation.id, event.target.value)}
            placeholder="补充你的批注…"
            rows={2}
          />
          <small>{annotation.dateModified ?? "刚刚"}</small>
        </article>
      ))}
    </aside>
  );
}

export function PdfPageCanvas({ document, pageNumber, fitMode = "width", zoom = 100, thumbnailWidth, annotations = [], focusRegion = null, activeAnnotationId = null, annotationNumbers = new Map() }: PdfPageCanvasProps & { activeAnnotationId?: string | null; annotationNumbers?: Map<string, number> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderVersionRef = useRef(0);
  const [hostSize, setHostSize] = useState({ width: thumbnailWidth ?? 0, height: 0 });

  useEffect(() => {
    if (thumbnailWidth || !hostRef.current) return;
    const host = hostRef.current;
    const scrollViewport = host.closest<HTMLElement>(".paper-canvas");
    const updateSize = () => {
      const width = host.clientWidth;
      const height = scrollViewport?.clientHeight ?? host.clientHeight;
      setHostSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(host);
    if (scrollViewport) observer.observe(scrollViewport);
    updateSize();
    return () => observer.disconnect();
  }, [thumbnailWidth]);

  useEffect(() => {
    if (!canvasRef.current || !surfaceRef.current || (!thumbnailWidth && hostSize.width <= 0)) return;
    const renderVersion = renderVersionRef.current + 1;
    renderVersionRef.current = renderVersion;
    if (textLayerRef.current) textLayerRef.current.replaceChildren();
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;

    document.getPage(pageNumber).then(async (pdfPage) => {
      if (cancelled || !canvasRef.current || !surfaceRef.current) return;
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const horizontalPadding = thumbnailWidth ? 0 : 32;
      const verticalPadding = thumbnailWidth ? 0 : 24;
      const availableWidth = Math.max(120, (thumbnailWidth ?? hostSize.width) - horizontalPadding);
      const availableHeight = Math.max(160, hostSize.height - verticalPadding);
      const widthScale = availableWidth / baseViewport.width;
      const pageScale = Math.min(widthScale, availableHeight / baseViewport.height);
      const scale = thumbnailWidth
        ? widthScale
        : fitMode === "width"
          ? widthScale
          : fitMode === "page"
            ? pageScale
            : (96 / 72) * (zoom / 100);
      const viewport = pdfPage.getViewport({ scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      surfaceRef.current.style.width = `${viewport.width}px`;
      surfaceRef.current.style.height = `${viewport.height}px`;
      surfaceRef.current.style.setProperty("--scale-factor", String(viewport.scale));
      surfaceRef.current.style.setProperty("--user-unit", "1");
      surfaceRef.current.style.setProperty("--total-scale-factor", String(viewport.scale));

      renderTask = pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      await renderTask.promise;

      if (!thumbnailWidth && textLayerRef.current && !cancelled && renderVersionRef.current === renderVersion) {
        textLayerRef.current.replaceChildren();
        textLayer = new TextLayer({
          textContentSource: await pdfPage.getTextContent(),
          container: textLayerRef.current,
          viewport,
        });
        await textLayer.render();
      }
    }).catch((error: unknown) => {
      if (surfaceRef.current && !(error instanceof Error && error.name === "RenderingCancelledException")) {
        surfaceRef.current.dataset.renderError = error instanceof Error ? error.message : String(error);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [document, fitMode, hostSize, pageNumber, thumbnailWidth, zoom]);

  return (
    <div className={thumbnailWidth ? "pdf-thumbnail-render" : "pdf-main-render"} ref={hostRef}>
      <div className="pdf-page-surface" ref={surfaceRef}>
        <canvas ref={canvasRef} />
        {!thumbnailWidth && annotations.length > 0 && (
          <div className="pdf-annotation-overlay" aria-hidden="true">
            {annotations.flatMap((annotation) => mergePdfSelectionRects(annotation.position.rects ?? []).map((rect, rectIndex) => (
              <span
                data-active={activeAnnotationId === annotation.id}
                data-annotation-id={annotation.id}
                data-type={annotation.type}
                key={`${annotation.id}-${rectIndex}`}
                style={{
                  "--annotation-color": annotation.color,
                  left: `${rect[0] * 100}%`,
                  top: `${rect[1] * 100}%`,
                  width: `${(rect[2] - rect[0]) * 100}%`,
                  height: `${(rect[3] - rect[1]) * 100}%`,
                } as React.CSSProperties}
              >{rectIndex === 0 && annotationNumbers.has(annotation.id) ? <b>{annotationNumbers.get(annotation.id)}</b> : null}</span>
            )))}
          </div>
        )}
        {!thumbnailWidth && focusRegion && (
          <div className="pdf-citation-focus-overlay" aria-hidden="true">
            <span
              data-block-id={focusRegion.id}
              style={{
                left: `${focusRegion.bbox[0] * 100}%`,
                top: `${focusRegion.bbox[1] * 100}%`,
                width: `${Math.max(.008, focusRegion.bbox[2] - focusRegion.bbox[0]) * 100}%`,
                height: `${Math.max(.008, focusRegion.bbox[3] - focusRegion.bbox[1]) * 100}%`,
              }}
            />
          </div>
        )}
        {!thumbnailWidth && <div className="textLayer" ref={textLayerRef} />}
      </div>
    </div>
  );
}

type PdfContinuousReaderProps = {
  document: PDFDocumentProxy;
  pageNumber: number;
  fitMode?: "width" | "page" | "custom";
  zoom?: number;
  annotations?: PdfVisualAnnotation[];
  focusRegion?: { page: number; id?: string; bbox: [number, number, number, number] } | null;
  onPageChange: (pageNumber: number) => void;
  onAnnotationCommentChange?: (annotationId: string, comment: string) => void;
  onAnnotationDelete?: (annotationId: string) => void;
};

export function PdfContinuousReader({
  document,
  pageNumber,
  fitMode = "width",
  zoom = 100,
  annotations = [],
  focusRegion = null,
  onPageChange,
  onAnnotationCommentChange,
  onAnnotationDelete,
}: PdfContinuousReaderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const visiblePageRef = useRef(0);
  const onPageChangeRef = useRef(onPageChange);
  const layoutKeyRef = useRef("");
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const annotationNumbers = useMemo(() => {
    const ordered = annotations
      .filter((annotation) => annotation.position.blockId?.startsWith("pdf-page-"))
      .sort((a, b) => {
        const pageDifference = Number(a.pageLabel) - Number(b.pageLabel);
        if (pageDifference) return pageDifference;
        return (a.position.rects?.[0]?.[1] ?? 0) - (b.position.rects?.[0]?.[1] ?? 0);
      });
    return new Map(ordered.map((annotation, index) => [annotation.id, index + 1]));
  }, [annotations]);

  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  useEffect(() => {
    const layoutKey = `${fitMode}:${zoom}:${document.fingerprints[0] ?? document.numPages}`;
    const layoutChanged = layoutKeyRef.current !== layoutKey;
    layoutKeyRef.current = layoutKey;
    if (!layoutChanged && visiblePageRef.current === pageNumber) return;

    const target = pageRefs.current.get(pageNumber);
    if (!target) return;
    visiblePageRef.current = pageNumber;
    target.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
  }, [document, fitMode, pageNumber, zoom]);

  useEffect(() => {
    const host = hostRef.current;
    const scrollViewport = host?.closest<HTMLElement>(".paper-canvas");
    if (!host || !scrollViewport) return;

    let animationFrame = 0;
    const updateVisiblePage = () => {
      animationFrame = 0;
      const viewportRect = scrollViewport.getBoundingClientRect();
      const readingLine = viewportRect.top + Math.min(160, viewportRect.height * 0.28);
      let nextPage = 1;
      let closestDistance = Number.POSITIVE_INFINITY;

      pageRefs.current.forEach((element, candidatePage) => {
        const rect = element.getBoundingClientRect();
        const containsReadingLine = rect.top <= readingLine && rect.bottom >= readingLine;
        const distance = containsReadingLine ? 0 : Math.min(Math.abs(rect.top - readingLine), Math.abs(rect.bottom - readingLine));
        if (distance < closestDistance) {
          closestDistance = distance;
          nextPage = candidatePage;
        }
      });

      if (nextPage !== visiblePageRef.current) {
        visiblePageRef.current = nextPage;
        onPageChangeRef.current(nextPage);
      }
    };
    const handleScroll = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(updateVisiblePage);
    };

    scrollViewport.addEventListener("scroll", handleScroll, { passive: true });
    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(scrollViewport);
    updateVisiblePage();

    return () => {
      scrollViewport.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [document]);

  return (
    <div className="pdf-continuous-pages" ref={hostRef}>
      {Array.from({ length: document.numPages }, (_, index) => index + 1).map((candidatePage) => (
        <section
          aria-label={`第 ${candidatePage} 页`}
          className="pdf-scroll-page"
          data-current={candidatePage === pageNumber}
          data-has-sidenotes={annotations.some((annotation) => annotation.position.blockId === `pdf-page-${candidatePage}`)}
          data-page-number={candidatePage}
          key={candidatePage}
          ref={(element) => {
            if (element) pageRefs.current.set(candidatePage, element);
            else pageRefs.current.delete(candidatePage);
          }}
        >
          <div className="pdf-page-layout">
            <PdfPageCanvas
              document={document}
              pageNumber={candidatePage}
              fitMode={fitMode}
              zoom={zoom}
              annotations={annotations.filter((annotation) => annotation.position.blockId === `pdf-page-${candidatePage}`)}
              focusRegion={focusRegion?.page === candidatePage ? { id: focusRegion.id, bbox: focusRegion.bbox } : null}
              activeAnnotationId={activeAnnotationId}
              annotationNumbers={annotationNumbers}
            />
            {annotations.some((annotation) => annotation.position.blockId === `pdf-page-${candidatePage}`) && (
              <PdfSidenoteMargin
                annotations={annotations.filter((annotation) => annotation.position.blockId === `pdf-page-${candidatePage}`)}
                activeAnnotationId={activeAnnotationId}
                annotationNumbers={annotationNumbers}
                onActivate={(annotationId) => {
                  setActiveAnnotationId(annotationId);
                  const anchor = pageRefs.current.get(candidatePage)?.querySelector<HTMLElement>(`[data-annotation-id="${annotationId}"]`);
                  anchor?.scrollIntoView({ block: "center", behavior: "smooth" });
                }}
                onCommentChange={onAnnotationCommentChange}
                onDelete={onAnnotationDelete ? (annotationId) => {
                  if (activeAnnotationId === annotationId) setActiveAnnotationId(null);
                  onAnnotationDelete(annotationId);
                } : undefined}
              />
            )}
          </div>
          <span className="pdf-scroll-page-number">{candidatePage}</span>
        </section>
      ))}
    </div>
  );
}
