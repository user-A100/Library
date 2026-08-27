import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookOpenText,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Columns2,
  Command,
  Copy,
  FileCheck2,
  FilePlus2,
  FileSearch,
  FileText,
  Focus,
  Folder,
  FolderPlus,
  GalleryVerticalEnd,
  Highlighter,
  Library,
  Ellipsis,
  ListFilter,
  ListTree,
  Maximize2,
  Menu,
  MessageSquareQuote,
  Minus,
  NotebookPen,
  PanelLeft,
  PanelRight,
  PenLine,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  PackageCheck,
  PackageOpen,
  Plus,
  Puzzle,
  Quote,
  RotateCcw,
  Redo2,
  Search,
  Send,
  Scan,
  Settings2,
  Sparkles,
  StickyNote,
  Tag,
  Tags,
  Trash2,
  Underline,
  Undo2,
  Upload,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react";
import { ChangeEvent, CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  initialAnnotations,
  initialCollections,
  initialNotes,
  initialPapers,
  initialVerificationItems,
  libraryTags,
  type AnnotationType,
  type LibraryCollection,
  type PaperAnnotation,
  type Paper,
  type ResearchNote,
  type VerificationItem,
} from "./data";
import { loadImportedPdf, saveImportedPdf } from "./pdfStore";
import { mergePdfSelectionRects, PdfContinuousReader, PdfPageCanvas, usePdfDocument, type PdfOutlineEntry } from "./PdfReader";
import { aiProviderPresets, askAiProvider, getAiProviderStatus, loadAiProviderConfig, saveAiProviderConfig, setAiProviderKey, type AiProviderConfig, type AiProviderStatus, type AiSourceContext } from "./aiClient";
import { ResearchNoteEditor } from "./ResearchNoteEditor";
import { createResearchNote, normalizeResearchNote, notePreview } from "./noteDocument";
import { MarkdownMessage } from "./MarkdownMessage";
import { adaptMineruOutput } from "./mineruAdapter";
import { loadParsedDocument, saveParsedDocument } from "./documentStore";
import { findDocumentBlock, parsedDocumentOutline, parsedDocumentToAiText, type DocumentBBox, type ParsedDocument } from "./documentModel";

type ViewId = "library" | "notes" | "verify" | "plugins" | "reader";
type RightPanel =
  | { kind: "library"; scope: LibraryScope }
  | { kind: "notes" }
  | { kind: "verify" }
  | { kind: "collection"; collectionId: string }
  | { kind: "tag"; tag: string }
  | { kind: "paper"; paperId: string };
type CitationFilter = "all" | Paper["citationState"];
type LibraryScope = "all" | "recent" | "unfiled" | "duplicates" | "trash";
type ReaderPanelTab = "annotations" | "notes" | "tags";
type ReaderNavTab = "thumbnails" | "annotations" | "outline";
type ReaderFitMode = "width" | "page" | "custom";
type AnnotationFilter = "all" | AnnotationType;
type LibrarySortField = "title" | "authors" | "year";
type SortDirection = "asc" | "desc";
type ThemeScheme = "auto" | "light" | "dark";
type ThemeAlgorithm = "free" | "flow";
type ThemePoint = { id: string; color: string; x: number; y: number; isPrimary?: boolean };
type PendingTextSelection = {
  text: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  pageNumber?: number;
  rects?: number[][];
  x: number;
  y: number;
};
type WorkspaceTheme = {
  scheme: ThemeScheme;
  algorithm: ThemeAlgorithm;
  opacity: number;
  texture: number;
  points: ThemePoint[];
};
type AiWorkspaceView = "chat" | "studio";
type AiCitation = { paperId: string; title: string; page: number; sourceIndex: number; blockId?: string; bbox?: DocumentBBox };
type AiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: AiCitation[];
};

const defaultWorkspaceTheme: WorkspaceTheme = {
  scheme: "auto",
  algorithm: "free",
  opacity: 72,
  texture: 18,
  points: [
    { id: "mint", color: "#72e3a6", x: 20, y: 20, isPrimary: true },
    { id: "aqua", color: "#83d9d4", x: 76, y: 34 },
    { id: "cream", color: "#f1e9c9", x: 48, y: 82 },
  ],
};

const themePresets: Array<{ name: string; colors: string[] }> = [
  { name: "Zen Mint", colors: ["#72e3a6", "#83d9d4", "#f1e9c9"] },
  { name: "Moss", colors: ["#82c995", "#b8d59d", "#e9dfb6"] },
  { name: "Dawn", colors: ["#ffad91", "#f7cf86", "#ddd3ee"] },
  { name: "Iris", colors: ["#9aa9f5", "#c0a7e8", "#e8d4e8"] },
  { name: "Ocean", colors: ["#5bbbd6", "#78d0bd", "#c8e4cf"] },
  { name: "Graphite", colors: ["#495553", "#697b72", "#aeb8a4"] },
];

const annotationTools: Array<{ id: AnnotationType; label: string; icon: typeof Highlighter }> = [
  { id: "highlight", label: "高亮", icon: Highlighter },
  { id: "underline", label: "下划线", icon: Underline },
  { id: "note", label: "便签", icon: StickyNote },
  { id: "area", label: "区域", icon: Scan },
  { id: "ink", label: "手写", icon: PenLine },
];

const annotationColors = [
  "var(--color-annotation-yellow)",
  "var(--color-annotation-blue)",
  "var(--color-annotation-violet)",
  "var(--color-annotation-mint)",
];

const readerOutline = [
  { title: "摘要", page: 1 },
  { title: "1. Introduction", page: 2 },
  { title: "2. Related work", page: 4 },
  { title: "3. Methods", page: 5, children: [
    { title: "3.1 Evaluation dimensions", page: 5 },
    { title: "3.2 Evidence traceability", page: 6 },
    { title: "3.3 Adversarial cases", page: 7 },
  ] },
  { title: "4. Results", page: 9 },
  { title: "5. Discussion", page: 12 },
  { title: "References", page: 14 },
];

const readerText = {
  evaluationIntro: "Open-ended research assistance cannot be evaluated against a single reference answer. We therefore separate factual support, citation integrity, terminology, uncertainty and user-correctability into independently reviewable dimensions.",
  traceQuote: "A useful system preserves a reversible path from every generated claim to the exact source span. Reviewers should be able to inspect the cited page, reject the interpretation and record why it failed.",
  traceDetail: "The trace is evaluated at claim level. A response receives full credit only when each material claim points to a matching passage and the passage actually supports the scope of the claim. Merely attaching a bibliography is not sufficient.",
  adversarial: "Difficult examples include plausible but fabricated citations, excessive technical language, unsupported causal claims and summaries produced from abstracts when the full text contradicts them.",
};

function loadWorkspaceTheme(): WorkspaceTheme {
  try {
    const saved = window.localStorage.getItem("research-workspace-theme-v1");
    if (!saved) return defaultWorkspaceTheme;
    const parsed = JSON.parse(saved) as WorkspaceTheme;
    if (!Array.isArray(parsed.points) || parsed.points.length === 0) return defaultWorkspaceTheme;
    return parsed;
  } catch {
    return defaultWorkspaceTheme;
  }
}

function loadLocalState<T>(key: string, fallback: T): T {
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T : fallback;
  } catch {
    return fallback;
  }
}

function loadPapersState(): Paper[] {
  const saved = loadLocalState<Paper[]>("research-papers-v3", []);
  if (!saved.length) return initialPapers;
  const missingBundledPapers = initialPapers.filter((paper) => !saved.some((item) => item.id === paper.id));
  return [...missingBundledPapers, ...saved];
}

function loadNotesState(): ResearchNote[] {
  const current = loadLocalState<ResearchNote[]>("research-notes-v4", []);
  const source = current.length ? current : loadLocalState<ResearchNote[]>("research-notes-v3", initialNotes);
  return source.map(normalizeResearchNote);
}

const viewTitles: Record<ViewId, string> = {
  library: "全部条目",
  notes: "阅读笔记",
  verify: "待核验引用",
  plugins: "插件中心",
  reader: "论文阅读",
};

function IconButton({
  label,
  children,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="v2-icon-button"
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function buildAnswerCitations(
  answer: string,
  sourcePapers: Paper[],
  sourceDocuments: Map<string, ParsedDocument>,
  activePaperId: string,
  activePage: number,
): AiCitation[] {
  const citations: AiCitation[] = [];
  const seen = new Set<string>();
  const pattern = /【来源\s*(\d+)(?:\s*·\s*p\.?\s*(\d+))?(?:\s*·\s*(?:block|块)\s*:?\s*([\w-]+))?\s*】/gi;
  for (const match of answer.matchAll(pattern)) {
    const sourceIndex = Number(match[1]);
    const paper = sourcePapers[sourceIndex - 1];
    if (!paper) continue;
    const document = sourceDocuments.get(paper.id);
    const requestedPage = match[2] ? Number(match[2]) : undefined;
    const requestedBlockId = match[3];
    const block = findDocumentBlock(document, requestedBlockId, requestedPage);
    const page = requestedPage || block?.page || (paper.id === activePaperId ? activePage : 1);
    const key = `${paper.id}:${page}:${block?.id ?? requestedBlockId ?? "source"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      paperId: paper.id,
      title: paper.title,
      page,
      sourceIndex,
      blockId: block?.id ?? requestedBlockId,
      bbox: block?.bbox ?? undefined,
    });
  }

  if (citations.length) return citations.slice(0, 12);
  return sourcePapers.slice(0, 3).map((paper, index) => {
    const document = sourceDocuments.get(paper.id);
    const block = findDocumentBlock(document, undefined, paper.id === activePaperId ? activePage : undefined);
    return {
      paperId: paper.id,
      title: paper.title,
      page: block?.page ?? (paper.id === activePaperId ? activePage : 1),
      sourceIndex: index + 1,
      blockId: block?.id,
      bbox: block?.bbox ?? undefined,
    };
  });
}

export default function AppV2() {
  const [papers, setPapers] = useState<Paper[]>(loadPapersState);
  const [notes, setNotes] = useState<ResearchNote[]>(loadNotesState);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PaperAnnotation[]>(() => loadLocalState("research-annotations-v3", initialAnnotations));
  const [collections, setCollections] = useState<LibraryCollection[]>(() => loadLocalState("research-collections-v3", initialCollections));
  const [verificationItems, setVerificationItems] = useState<VerificationItem[]>(() => loadLocalState("research-verification-v2", initialVerificationItems));
  const [activeView, setActiveView] = useState<ViewId>("library");
  const [previousView, setPreviousView] = useState<ViewId>("library");
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(null);
  const [activePaperId, setActivePaperId] = useState(initialPapers[0].id);
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth > 960);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aiWorkspaceView, setAiWorkspaceView] = useState<AiWorkspaceView>("chat");
  const [aiSourcesOpen, setAiSourcesOpen] = useState(false);
  const [aiSourceIds, setAiSourceIds] = useState<string[]>([initialPapers[0].id]);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiProviderConfig, setAiProviderConfig] = useState<AiProviderConfig>(loadAiProviderConfig);
  const [aiProviderStatus, setAiProviderStatus] = useState<AiProviderStatus | null>(null);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiKeySaving, setAiKeySaving] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [readerPanelTab, setReaderPanelTab] = useState<ReaderPanelTab>("annotations");
  const [readerNavOpen, setReaderNavOpen] = useState(true);
  const [readerNavTab, setReaderNavTab] = useState<ReaderNavTab>("thumbnails");
  const [readerNavQuery, setReaderNavQuery] = useState("");
  const [activeOutlineTitle, setActiveOutlineTitle] = useState("");
  const [readerFitMode, setReaderFitMode] = useState<ReaderFitMode>("width");
  const [annotationTool, setAnnotationTool] = useState<AnnotationType>("highlight");
  const [annotationToolArmed, setAnnotationToolArmed] = useState(false);
  const [sidenotesOpen, setSidenotesOpen] = useState(true);
  const [pendingTextSelection, setPendingTextSelection] = useState<PendingTextSelection | null>(null);
  const [annotationColor, setAnnotationColor] = useState(annotationColors[0]);
  const [annotationQuery, setAnnotationQuery] = useState("");
  const [annotationFilter, setAnnotationFilter] = useState<AnnotationFilter>("all");
  const [annotationColorFilters, setAnnotationColorFilters] = useState<string[]>([]);
  const [annotationTagFilters, setAnnotationTagFilters] = useState<string[]>([]);
  const [annotationUndoStack, setAnnotationUndoStack] = useState<PaperAnnotation[][]>([]);
  const [annotationRedoStack, setAnnotationRedoStack] = useState<PaperAnnotation[][]>([]);
  const [page, setPage] = useState(6);
  const [zoom, setZoom] = useState(112);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [citationFilter, setCitationFilter] = useState<CitationFilter>("all");
  const [libraryScope, setLibraryScope] = useState<LibraryScope>("all");
  const [selectedLibraryTags, setSelectedLibraryTags] = useState<string[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [librarySortField, setLibrarySortField] = useState<LibrarySortField>("title");
  const [librarySortDirection, setLibrarySortDirection] = useState<SortDirection>("asc");
  const [expandedPaperIds, setExpandedPaperIds] = useState<string[]>([]);
  const [commandQuery, setCommandQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [newPaperTitle, setNewPaperTitle] = useState("");
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [parsedDocuments, setParsedDocuments] = useState<Record<string, ParsedDocument | undefined>>({});
  const [parsedDocumentLoading, setParsedDocumentLoading] = useState(false);
  const [citationFocus, setCitationFocus] = useState<{ paperId: string; page: number; blockId?: string; bbox: DocumentBBox } | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [workspaceTheme, setWorkspaceTheme] = useState<WorkspaceTheme>(loadWorkspaceTheme);
  const [activeThemePointId, setActiveThemePointId] = useState(defaultWorkspaceTheme.points[0].id);
  const [draggingThemePointId, setDraggingThemePointId] = useState<string | null>(null);
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(false);
  const [compactRows, setCompactRows] = useState(false);
  const [toast, setToast] = useState("");
  const commandDialog = useRef<HTMLDialogElement>(null);
  const addDialog = useRef<HTMLDialogElement>(null);
  const collectionDialog = useRef<HTMLDialogElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const mineruFileInput = useRef<HTMLInputElement>(null);
  const themeCanvas = useRef<HTMLDivElement>(null);
  const sidebarPeekTimer = useRef<number | null>(null);
  const citationFocusTimer = useRef<number | null>(null);
  const pdfTextCache = useRef(new Map<string, string>());

  const activePaper = papers.find((paper) => paper.id === activePaperId) ?? papers[0];
  const activeNote = notes.find((note) => note.id === activeNoteId) ?? notes[0] ?? null;
  const activeParsedDocument = parsedDocuments[activePaper.id] ?? null;
  const { document: activePdfDocument, outline: pdfOutline, loading: pdfLoading, error: pdfError } = usePdfDocument(activePdfUrl);
  const activePageCount = activePdfDocument?.numPages ?? activePaper.pageCount ?? 14;
  const mineruOutline = parsedDocumentOutline(activeParsedDocument);
  const activeReaderOutline: PdfOutlineEntry[] = mineruOutline.length
    ? mineruOutline.map((item) => ({ title: item.title, page: item.page }))
    : activePdfDocument ? pdfOutline : readerOutline;
  const pendingCount = verificationItems.filter((item) => item.status === "pending").length;
  const activeThemePoint = workspaceTheme.points.find((point) => point.id === activeThemePointId) ?? workspaceTheme.points[0];
  const themeIsDark = workspaceTheme.scheme === "dark" || (workspaceTheme.scheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const livePapers = useMemo(() => papers.filter((paper) => !paper.deletedAt), [papers]);
  const activeAiProviderPreset = aiProviderPresets.find((provider) => provider.provider === aiProviderConfig.provider) ?? aiProviderPresets[aiProviderPresets.length - 1];
  const duplicatePaperIds = useMemo(() => {
    const groups = new Map<string, string[]>();
    livePapers.forEach((paper) => {
      const key = paper.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      groups.set(key, [...(groups.get(key) ?? []), paper.id]);
    });
    return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
  }, [livePapers]);

  const activePaperAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.paperId === activePaperId).sort((a, b) => a.sortIndex.localeCompare(b.sortIndex)),
    [activePaperId, annotations],
  );

  const visibleAnnotations = useMemo(() => {
    const query = annotationQuery.trim().toLowerCase();
    return activePaperAnnotations.filter((annotation) => {
      const matchesType = annotationFilter === "all" || annotation.type === annotationFilter;
      const matchesQuery = !query || [annotation.text, annotation.comment, annotation.tags.join(" "), annotation.pageLabel].join(" ").toLowerCase().includes(query);
      const matchesColor = annotationColorFilters.length === 0 || annotationColorFilters.includes(annotation.color);
      const matchesTag = annotationTagFilters.length === 0 || annotation.tags.some((tag) => annotationTagFilters.includes(tag));
      return matchesType && matchesQuery && matchesColor && matchesTag;
    });
  }, [activePaperAnnotations, annotationColorFilters, annotationFilter, annotationQuery, annotationTagFilters]);
  const readerNavAnnotations = useMemo(() => {
    const query = readerNavQuery.trim().toLowerCase();
    return activePaperAnnotations.filter((annotation) => !query || [annotation.text, annotation.comment, annotation.tags.join(" "), annotation.pageLabel].join(" ").toLowerCase().includes(query));
  }, [activePaperAnnotations, readerNavQuery]);

  const renderReaderBlock = (blockId: string, text: string) => {
    const ranges = activePaperAnnotations
      .filter((annotation) => annotation.pageLabel === String(page) && (annotation.type === "highlight" || annotation.type === "underline") && annotation.text)
      .map((annotation) => {
        const fallbackStart = text.indexOf(annotation.text);
        const blockMatches = annotation.position.blockId === blockId || (!annotation.position.blockId && fallbackStart >= 0);
        if (!blockMatches) return null;
        const start = annotation.position.startOffset ?? fallbackStart;
        const end = annotation.position.endOffset ?? (start + annotation.text.length);
        if (start < 0 || end <= start || end > text.length) return null;
        return { annotation, start, end };
      })
      .filter((range): range is NonNullable<typeof range> => Boolean(range))
      .sort((a, b) => a.start - b.start);

    if (!ranges.length) return text;
    const nodes: ReactNode[] = [];
    let cursor = 0;
    ranges.forEach(({ annotation, start, end }) => {
      if (start < cursor) return;
      if (start > cursor) nodes.push(text.slice(cursor, start));
      nodes.push(
        <mark className="reader-inline-annotation" data-type={annotation.type} style={{ "--annotation-color": annotation.color } as CSSProperties} title={`${annotationTools.find((tool) => tool.id === annotation.type)?.label} · p. ${annotation.pageLabel}`} key={annotation.id}>
          {text.slice(start, end)}
        </mark>,
      );
      cursor = end;
    });
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
  };

  const workspaceGradient = useMemo(() => {
    const dark = themeIsDark;
    const opacity = dark ? Math.min(34, Math.max(16, workspaceTheme.opacity)) : Math.max(18, workspaceTheme.opacity);
    const textureStrength = Math.round((workspaceTheme.texture / 100) * (dark ? 5 : 8));
    const texture = `repeating-radial-gradient(circle at 0 0, color-mix(in oklch, var(--color-shell-ink) ${textureStrength}%, transparent) 0 .7px, transparent .8px 5px)`;
    const colorLayers = workspaceTheme.points.map((point, index) => {
      const x = workspaceTheme.algorithm === "flow" ? 10 + (index * 80) / Math.max(1, workspaceTheme.points.length - 1) : point.x;
      const y = workspaceTheme.algorithm === "flow" ? 25 + (index % 2) * 55 : point.y;
      const source = dark ? `color-mix(in oklch, ${point.color} 28%, var(--color-shell-paper))` : point.color;
      return `radial-gradient(circle at ${x}% ${y}%, color-mix(in oklch, ${source} ${opacity}%, transparent) 0%, transparent 62%)`;
    });
    const base = dark
      ? "linear-gradient(155deg, var(--color-shell-paper), var(--color-shell-paper-2))"
      : "linear-gradient(155deg, var(--color-shell-light-paper), var(--color-shell-light-paper-2))";
    return [texture, ...colorLayers, base].join(", ");
  }, [themeIsDark, workspaceTheme]);

  const appStyle = {
    "--workspace-gradient": workspaceGradient,
    "--workspace-accent-source": activeThemePoint?.color ?? "#72e3a6",
  } as CSSProperties;

  const filteredPapers = useMemo(() => {
    const normalized = libraryQuery.trim().toLowerCase();
    let source = libraryScope === "trash" ? papers.filter((paper) => paper.deletedAt) : livePapers;
    if (activeCollectionId) source = source.filter((paper) => paper.collectionIds.includes(activeCollectionId));
    if (libraryScope === "recent") source = [...source].sort((a, b) => (b.dateAdded ?? "").localeCompare(a.dateAdded ?? "")).slice(0, 3);
    if (libraryScope === "unfiled") source = source.filter((paper) => paper.collectionIds.length === 0);
    if (libraryScope === "duplicates") source = source.filter((paper) => duplicatePaperIds.has(paper.id));
    if (selectedLibraryTags.length) source = source.filter((paper) => selectedLibraryTags.every((tag) => paper.tags.includes(tag)));
    const result = source.filter((paper) => {
      const matchesCitation = citationFilter === "all" || paper.citationState === citationFilter;
      const matchesQuery = !normalized || [paper.title, paper.authors, paper.journal, paper.tags.join(" ")].join(" ").toLowerCase().includes(normalized);
      return matchesCitation && matchesQuery;
    });
    return [...result].sort((a, b) => {
      const comparison = a[librarySortField].localeCompare(b[librarySortField], undefined, { numeric: true, sensitivity: "base" });
      return librarySortDirection === "asc" ? comparison : -comparison;
    });
  }, [activeCollectionId, activeView, citationFilter, duplicatePaperIds, libraryQuery, libraryScope, librarySortDirection, librarySortField, livePapers, papers, selectedLibraryTags]);

  const showFeedback = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const navigate = (view: ViewId) => {
    setPreviousView(activeView);
    setActiveView(view);
    if (view !== "reader") setSplitView(false);
  };

  const openLibraryScope = (scope: LibraryScope) => {
    setLibraryScope(scope);
    setSelectedLibraryTags([]);
    setActiveCollectionId(null);
    setRightPanel(null);
    navigate("library");
  };

  const openCollection = (collectionId: string) => {
    setActiveCollectionId(collectionId);
    setLibraryScope("all");
    setSelectedLibraryTags([]);
    setRightPanel(null);
    navigate("library");
  };

  const openTag = (tagName: string) => {
    setSelectedLibraryTags((current) => current.includes(tagName) ? current.filter((tag) => tag !== tagName) : [...current, tagName]);
    setActiveCollectionId(null);
    setLibraryScope("all");
    setRightPanel(null);
    navigate("library");
  };

  const openNotes = () => {
    setRightPanel(null);
    navigate("notes");
  };

  const openVerification = () => {
    setRightPanel(null);
    navigate("verify");
  };

  const openRightPanel = (panel: RightPanel) => setRightPanel(panel);

  const selectPaper = (paper: Paper) => {
    setActivePaperId(paper.id);
    setRightPanel({ kind: "paper", paperId: paper.id });
  };

  const resolvePaperPdfUrl = async (paper: Paper) => {
    if (paper.pdfPath) return paper.pdfPath;
    if (!paper.attachmentId?.startsWith("local-pdf-")) return null;
    const storedPdf = await loadImportedPdf(paper.attachmentId);
    return storedPdf ? URL.createObjectURL(storedPdf) : null;
  };

  const openPaper = async (paper: Paper) => {
    setActivePaperId(paper.id);
    setPreviousView(activeView);
    setActiveView("reader");
    setRightPanel(null);
    setPage(paper.pdfPath || paper.attachmentId?.startsWith("local-pdf-") ? 1 : 6);
    try {
      const pdfUrl = await resolvePaperPdfUrl(paper);
      setActivePdfUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return pdfUrl;
      });
      if (paper.attachmentId?.startsWith("local-pdf-") && !pdfUrl) showFeedback("PDF 文件不存在，请重新导入");
    } catch {
      setActivePdfUrl(null);
      showFeedback("读取本地 PDF 失败，请重新选择文件");
    }
    if (window.innerWidth <= 960) setLeftOpen(false);
  };

  const togglePaperExpanded = (paperId: string) => {
    setExpandedPaperIds((ids) => ids.includes(paperId) ? ids.filter((id) => id !== paperId) : [...ids, paperId]);
  };

  const toggleLibrarySort = (field: LibrarySortField) => {
    if (librarySortField === field) setLibrarySortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else {
      setLibrarySortField(field);
      setLibrarySortDirection("asc");
    }
  };

  const movePaperToTrash = (paperId: string) => {
    setPapers((items) => items.map((paper) => paper.id === paperId ? { ...paper, deletedAt: new Date().toISOString() } : paper));
    setRightPanel(null);
    showFeedback("条目已移到回收站");
  };

  const restorePaperFromTrash = (paperId: string) => {
    setPapers((items) => items.map((paper) => paper.id === paperId ? { ...paper, deletedAt: null } : paper));
    showFeedback("条目已恢复");
  };

  const togglePaperCollection = (paperId: string, collectionId: string) => {
    setPapers((items) => items.map((paper) => paper.id === paperId
      ? { ...paper, collectionIds: paper.collectionIds.includes(collectionId) ? paper.collectionIds.filter((id) => id !== collectionId) : [...paper.collectionIds, collectionId] }
      : paper));
    setCollections((items) => items.map((collection) => collection.id === collectionId
      ? { ...collection, itemIds: collection.itemIds.includes(paperId) ? collection.itemIds.filter((id) => id !== paperId) : [...collection.itemIds, paperId] }
      : collection));
  };

  const commitAnnotations = (next: PaperAnnotation[]) => {
    setAnnotationUndoStack((stack) => [...stack, annotations].slice(-50));
    setAnnotationRedoStack([]);
    setAnnotations(next);
  };

  const undoAnnotationChange = () => {
    const previous = annotationUndoStack.at(-1);
    if (!previous) return;
    setAnnotationUndoStack((stack) => stack.slice(0, -1));
    setAnnotationRedoStack((stack) => [...stack, annotations].slice(-50));
    setAnnotations(previous);
  };

  const redoAnnotationChange = () => {
    const next = annotationRedoStack.at(-1);
    if (!next) return;
    setAnnotationRedoStack((stack) => stack.slice(0, -1));
    setAnnotationUndoStack((stack) => [...stack, annotations].slice(-50));
    setAnnotations(next);
  };

  const addAnnotationFromSelection = (tool: AnnotationType = annotationTool, selection: PendingTextSelection | null = pendingTextSelection) => {
    if (!activePaper.attachmentId) {
      showFeedback("当前条目没有可批注的附件");
      return;
    }
    if (["highlight", "underline", "note"].includes(tool) && !selection) {
      setAnnotationTool(tool);
      setAnnotationToolArmed(true);
      showFeedback(`已启用${annotationTools.find((item) => item.id === tool)?.label}，请在正文中选择文字`);
      return;
    }
    const annotationPage = selection?.pageNumber ?? page;
    const id = `annotation-${Date.now()}`;
    const annotation: PaperAnnotation = {
      id,
      paperId: activePaper.id,
      attachmentId: activePaper.attachmentId,
      type: tool,
      text: selection?.text ?? "",
      comment: tool === "note" ? "记录这一处证据的解释或疑问。" : "",
      color: annotationColor,
      pageLabel: String(annotationPage),
      sortIndex: `${String(annotationPage).padStart(5, "0")}|000120|${String(activePaperAnnotations.length).padStart(5, "0")}`,
      position: {
        pageIndex: annotationPage - 1,
        rects: tool === "ink" ? undefined : selection?.rects ?? [[92, 286, 514, 334]],
        paths: tool === "ink" ? [[92, 286, 140, 306, 202, 296]] : undefined,
        blockId: selection?.blockId,
        startOffset: selection?.startOffset,
        endOffset: selection?.endOffset,
      },
      tags: selectedLibraryTags.length ? [...selectedLibraryTags] : ["evidence"],
      authorName: "项目成员",
      dateModified: "刚刚",
    };
    commitAnnotations([...annotations, annotation]);
    setReaderPanelTab("annotations");
    setReaderNavTab("annotations");
    setReaderNavOpen(true);
    setAnnotationTool(tool);
    setAnnotationToolArmed(false);
    setSidenotesOpen(true);
    setPendingTextSelection(null);
    window.getSelection()?.removeAllRanges();
    showFeedback(`${annotationTools.find((item) => item.id === tool)?.label}已创建`);
  };

  const activateAnnotationTool = (tool: AnnotationType) => {
    setAnnotationTool(tool);
    if (pendingTextSelection) {
      addAnnotationFromSelection(tool, pendingTextSelection);
      return;
    }
    setAnnotationToolArmed(true);
    showFeedback(`已启用${annotationTools.find((item) => item.id === tool)?.label}，请选择正文`);
  };

  const captureReaderSelection = () => {
    window.requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setPendingTextSelection(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const getBlock = (node: Node) => (node.nodeType === Node.TEXT_NODE ? node.parentElement : node as HTMLElement)?.closest<HTMLElement>("[data-reader-block]");
      const startBlock = getBlock(range.startContainer);
      const endBlock = getBlock(range.endContainer);
      const getPdfPage = (node: Node) => (node.nodeType === Node.TEXT_NODE ? node.parentElement : node as HTMLElement)?.closest<HTMLElement>(".pdf-scroll-page");
      const startPdfPage = getPdfPage(range.startContainer);
      const endPdfPage = getPdfPage(range.endContainer);
      const rawText = selection.toString();
      const text = rawText.trim();
      if (!text) {
        setPendingTextSelection(null);
        return;
      }

      if (startPdfPage || endPdfPage) {
        if (!startPdfPage || startPdfPage !== endPdfPage) {
          setPendingTextSelection(null);
          showFeedback("请在同一页中选择文字");
          return;
        }
        const pageSurface = startPdfPage.querySelector<HTMLElement>(".pdf-page-surface");
        const pageNumber = Number(startPdfPage.dataset.pageNumber);
        if (!pageSurface || !pageNumber) {
          setPendingTextSelection(null);
          return;
        }
        const surfaceRect = pageSurface.getBoundingClientRect();
        const selectionRects = mergePdfSelectionRects(Array.from(range.getClientRects())
          .filter((rect) => rect.width > 1 && rect.height > 1 && rect.bottom > surfaceRect.top && rect.top < surfaceRect.bottom)
          .map((rect) => [
            Math.max(0, (rect.left - surfaceRect.left) / surfaceRect.width),
            Math.max(0, (rect.top - surfaceRect.top) / surfaceRect.height),
            Math.min(1, (rect.right - surfaceRect.left) / surfaceRect.width),
            Math.min(1, (rect.bottom - surfaceRect.top) / surfaceRect.height),
          ]));
        if (!selectionRects.length) {
          setPendingTextSelection(null);
          return;
        }
        const normalizedPdfText = text.replace(/([\u3400-\u9fff，。；：！？、“”‘’（）])\1{2}/g, "$1");
        const boundingRect = range.getBoundingClientRect();
        const pending = {
          text: normalizedPdfText,
          blockId: `pdf-page-${pageNumber}`,
          startOffset: 0,
          endOffset: normalizedPdfText.length,
          pageNumber,
          rects: selectionRects,
          x: boundingRect.left + (boundingRect.width / 2),
          y: boundingRect.bottom + 10,
        };
        setPendingTextSelection(pending);
        return;
      }

      if (!startBlock || !endBlock) {
        setPendingTextSelection(null);
        return;
      }
      if (startBlock !== endBlock || !startBlock.dataset.readerBlock) {
        setPendingTextSelection(null);
        showFeedback("请在同一段正文中选择文字");
        return;
      }
      const before = document.createRange();
      before.selectNodeContents(startBlock);
      before.setEnd(range.startContainer, range.startOffset);
      const leadingWhitespace = rawText.length - rawText.trimStart().length;
      const startOffset = before.toString().length + leadingWhitespace;
      const pending = {
        text,
        blockId: startBlock.dataset.readerBlock,
        startOffset,
        endOffset: startOffset + text.length,
        x: range.getBoundingClientRect().left + (range.getBoundingClientRect().width / 2),
        y: range.getBoundingClientRect().bottom + 10,
      };
      setPendingTextSelection(pending);
    });
  };

  const convertAnnotation = (id: string, type: Extract<AnnotationType, "highlight" | "underline">) => {
    commitAnnotations(annotations.map((annotation) => annotation.id === id ? { ...annotation, type, dateModified: "刚刚" } : annotation));
  };

  const updateAnnotationComment = (id: string, comment: string) => {
    const current = annotations.find((annotation) => annotation.id === id);
    if (!current || current.readOnly || current.comment === comment) return;
    commitAnnotations(annotations.map((annotation) => annotation.id === id ? { ...annotation, comment, dateModified: "刚刚" } : annotation));
  };

  const toggleAnnotationTag = (id: string, tagName: string) => {
    commitAnnotations(annotations.map((annotation) => annotation.id === id
      ? { ...annotation, tags: annotation.tags.includes(tagName) ? annotation.tags.filter((tag) => tag !== tagName) : [...annotation.tags, tagName], dateModified: "刚刚" }
      : annotation));
  };

  const removeAnnotation = (annotation: PaperAnnotation) => {
    if (annotation.readOnly) return;
    commitAnnotations(annotations.filter((item) => item.id !== annotation.id));
    showFeedback("批注已删除，可用撤销恢复");
  };

  const addAnnotationToNote = (annotation: PaperAnnotation) => {
    const note = createResearchNote({
      id: `note-${Date.now()}`,
      title: annotation.comment || "批注摘录",
      body: annotation.text || annotation.comment,
      source: activePaper.title,
      page: Number(annotation.pageLabel) || page,
      createdAt: "刚刚",
      paperId: activePaper.id,
      annotationId: annotation.id,
      tags: annotation.tags,
    });
    setNotes((items) => [note, ...items]);
    setActiveNoteId(note.id);
    setReaderPanelTab("notes");
    showFeedback("批注已加入阅读笔记");
  };

  const togglePaperTag = (tagName: string) => {
    setPapers((items) => items.map((paper) => paper.id === activePaper.id
      ? { ...paper, tags: paper.tags.includes(tagName) ? paper.tags.filter((tag) => tag !== tagName) : [...paper.tags, tagName] }
      : paper));
  };

  const addEvidenceNote = (body?: string) => {
    const note = createResearchNote({
      id: `note-${Date.now()}`,
      title: body ? "AI 对话摘录" : "阅读摘录",
      body: body || `关于《${activePaper.title}》的阅读摘录。`,
      source: activePaper.title,
      page,
      createdAt: "刚刚",
      paperId: activePaper.id,
    });
    setNotes((items) => [note, ...items]);
    setActiveNoteId(note.id);
    setDraftNote("");
    showFeedback("已加入阅读笔记");
  };

  const createBlankNote = () => {
    const note = createResearchNote({
      id: `note-${Date.now()}`,
      title: "无标题笔记",
      body: "",
      source: activePaper.title,
      page,
      createdAt: "刚刚",
      paperId: activePaper.id,
    });
    setNotes((items) => [note, ...items]);
    setActiveNoteId(note.id);
    setRightPanel(null);
    navigate("notes");
    showFeedback("已新建笔记");
  };

  const openNote = (note: ResearchNote) => {
    setActiveNoteId(note.id);
    setRightPanel(null);
    navigate("notes");
  };

  const updateNote = (noteId: string, patch: Partial<ResearchNote>) => {
    setNotes((items) => items.map((note) => note.id === noteId ? { ...note, ...patch, createdAt: "刚刚" } : note));
  };

  const openNoteSource = (note: ResearchNote) => {
    const paper = papers.find((item) => item.id === note.paperId || item.title === note.source) ?? activePaper;
    openPaper(paper);
    setPage(note.page);
    setRightPanel(null);
  };

  const deleteNote = (noteId: string) => {
    setNotes((items) => items.filter((note) => note.id !== noteId));
    if (activeNoteId === noteId) setActiveNoteId(null);
    showFeedback("笔记已删除");
  };

  const extractActivePdfText = async () => {
    if (!activePdfDocument) return "";
    const cached = pdfTextCache.current.get(activePaper.id);
    if (cached) return cached;
    const sections: string[] = [];
    let length = 0;
    const pageLimit = Math.min(activePdfDocument.numPages, 30);
    for (let pageNumber = 1; pageNumber <= pageLimit && length < 60_000; pageNumber += 1) {
      const pdfPage = await activePdfDocument.getPage(pageNumber);
      const textContent = await pdfPage.getTextContent();
      const text = textContent.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const section = `[p. ${pageNumber}] ${text}`;
      sections.push(section);
      length += section.length;
    }
    const result = sections.join("\n\n").slice(0, 60_000);
    if (result) pdfTextCache.current.set(activePaper.id, result);
    return result;
  };

  const buildAiSourceContexts = async (sourcePapers: Paper[]): Promise<{ contexts: AiSourceContext[]; documents: Map<string, ParsedDocument> }> => {
    const loadedDocuments = await Promise.all(sourcePapers.map(async (paper) => {
      const cached = parsedDocuments[paper.id];
      if (cached) return cached;
      try {
        return await loadParsedDocument(paper.id);
      } catch {
        return null;
      }
    }));
    const documents = new Map<string, ParsedDocument>();
    loadedDocuments.forEach((document) => {
      if (document) documents.set(document.paperId, document);
    });
    if (documents.size) {
      setParsedDocuments((current) => {
        const next = { ...current };
        documents.forEach((document, paperId) => { next[paperId] = document; });
        return next;
      });
    }
    const activePdfText = sourcePapers.some((paper) => paper.id === activePaper.id) && !documents.has(activePaper.id)
      ? await extractActivePdfText()
      : "";
    const contexts = sourcePapers.map((paper) => {
      const paperAnnotations = annotations.filter((annotation) => annotation.paperId === paper.id && (annotation.text || annotation.comment));
      const annotationText = paperAnnotations.slice(0, 40).map((annotation) => `[p. ${annotation.pageLabel}] ${annotation.text} ${annotation.comment}`.trim()).join("\n");
      const metadata = [paper.abstractNote, `期刊：${paper.journal}`, `标签：${paper.tags.join("、")}`, annotationText].filter(Boolean).join("\n");
      const parsedDocument = documents.get(paper.id);
      const structuredText = parsedDocument ? parsedDocumentToAiText(parsedDocument) : "";
      return {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        parser: parsedDocument ? "mineru" as const : "pdfjs" as const,
        content: structuredText
          ? `${metadata}\n\n[解析器: MinerU ${parsedDocument?.parser.version}; backend: ${parsedDocument?.parser.backend}]\n${structuredText}`
          : paper.id === activePaper.id && activePdfText ? `${metadata}\n\n${activePdfText}` : metadata,
      };
    });
    return { contexts, documents };
  };

  const refreshAiProviderStatus = async (config = aiProviderConfig) => {
    try {
      const status = await getAiProviderStatus(config);
      setAiProviderStatus(status);
      setAiError("");
      return status;
    } catch (error) {
      setAiProviderStatus(null);
      setAiError(error instanceof Error ? error.message : "无法连接本地 AI 服务");
      return null;
    }
  };

  const updateAiProviderConfig = (config: AiProviderConfig) => {
    setAiProviderConfig(config);
    saveAiProviderConfig(config);
    setAiProviderStatus(null);
    setAiError("");
  };

  const selectAiProvider = (provider: AiProviderConfig["provider"]) => {
    const preset = aiProviderPresets.find((item) => item.provider === provider);
    if (!preset) return;
    updateAiProviderConfig({ provider: preset.provider, baseUrl: preset.baseUrl, model: preset.model });
  };

  const saveAiApiKey = async () => {
    const apiKey = aiApiKey.trim();
    if (!apiKey || aiKeySaving) return;
    setAiKeySaving(true);
    setAiError("");
    try {
      const status = await setAiProviderKey(aiProviderConfig.provider, apiKey);
      setAiProviderStatus(status);
      setAiApiKey("");
      showFeedback("API Key 已保存到本次运行");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "API Key 保存失败");
    } finally {
      setAiKeySaving(false);
    }
  };

  const runNotebookQuestion = async (prompt: string) => {
    const nextQuestion = prompt.trim();
    if (!nextQuestion || thinking) return;
    const currentStatus = aiProviderStatus ?? await refreshAiProviderStatus();
    if (!currentStatus?.configured) {
      setAiSettingsOpen(true);
      setAiError(`请先在本地 .env.local 中配置 ${currentStatus?.keyName || "AI_API_KEY"}`);
      return;
    }
    const selectedPapers = livePapers.filter((paper) => aiSourceIds.includes(paper.id));
    const sourcePapers = selectedPapers.length ? selectedPapers : [activePaper];
    const history = aiMessages.map((message) => ({ role: message.role, text: message.text }));
    setAiMessages((messages) => [...messages, { id: `ai-user-${Date.now()}`, role: "user", text: nextQuestion }]);
    setQuestion("");
    setAiError("");
    setThinking(true);
    try {
      const { contexts: sourceContexts, documents: sourceDocuments } = await buildAiSourceContexts(sourcePapers);
      const answer = await askAiProvider(aiProviderConfig, nextQuestion, sourceContexts, history);
      const citations = buildAnswerCitations(answer, sourcePapers, sourceDocuments, activePaper.id, page);
      setAiMessages((messages) => [...messages, {
        id: `ai-assistant-${Date.now()}`,
        role: "assistant",
        text: answer,
        citations,
      }]);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 请求失败");
    } finally {
      setThinking(false);
    }
  };

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    runNotebookQuestion(question);
  };

  const toggleAiSource = (paperId: string) => {
    setAiSourceIds((sourceIds) => {
      if (!sourceIds.includes(paperId)) return [...sourceIds, paperId];
      if (sourceIds.length === 1) {
        showFeedback("至少保留一个回答来源");
        return sourceIds;
      }
      return sourceIds.filter((id) => id !== paperId);
    });
  };

  const openAiCitation = (citation: AiCitation) => {
    const paper = papers.find((item) => item.id === citation.paperId);
    if (!paper) return;
    setActivePaperId(paper.id);
    setPage(Math.max(1, citation.page));
    if (citation.bbox) {
      setCitationFocus({ paperId: paper.id, page: Math.max(1, citation.page), blockId: citation.blockId, bbox: citation.bbox });
      if (citationFocusTimer.current) window.clearTimeout(citationFocusTimer.current);
      citationFocusTimer.current = window.setTimeout(() => setCitationFocus(null), 4200);
    } else {
      setCitationFocus(null);
    }
    setActiveView("reader");
    setAssistantOpen(false);
  };

  const importMineruResult = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || parsedDocumentLoading) return;
    if (file.size > 80 * 1024 * 1024) {
      showFeedback("MinerU JSON 不能超过 80 MB");
      return;
    }
    setParsedDocumentLoading(true);
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const document = adaptMineruOutput(raw, activePaper.id);
      await saveParsedDocument(document);
      setParsedDocuments((current) => ({ ...current, [activePaper.id]: document }));
      pdfTextCache.current.delete(activePaper.id);
      showFeedback(`MinerU 已解析 ${document.blocks.length} 个内容块`);
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "MinerU 解析结果导入失败");
    } finally {
      setParsedDocumentLoading(false);
    }
  };

  const selectImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPendingImportFile(file);
    if (file && !newPaperTitle.trim()) setNewPaperTitle(file.name.replace(/\.pdf$/i, ""));
  };

  const addLocalPaper = async (event: FormEvent) => {
    event.preventDefault();
    const title = newPaperTitle.trim() || pendingImportFile?.name.replace(/\.pdf$/i, "").trim();
    if (!title) return;
    const timestamp = Date.now();
    const attachmentId = pendingImportFile ? `local-pdf-${timestamp}` : null;
    if (pendingImportFile && attachmentId) {
      try {
        await saveImportedPdf(attachmentId, pendingImportFile);
      } catch {
        showFeedback("PDF 保存失败，请检查浏览器存储权限");
        return;
      }
    }
    const paper: Paper = {
      id: `local-${timestamp}`,
      title,
      authors: "待补充作者",
      year: "2026",
      meta: pendingImportFile ? `${Math.max(1, Math.round(pendingImportFile.size / 1024))} KB · 本地 PDF` : "无附件 · 0 条批注",
      tone: "cyan",
      journal: pendingImportFile ? "本地导入文献" : "本地新增条目",
      tags: ["inbox"],
      attachment: pendingImportFile ? "PDF" : "—",
      attachmentId,
      collectionIds: [],
      noteCount: 0,
      citationState: "pending",
      dateAdded: new Date().toISOString(),
    };
    setPapers((items) => [paper, ...items]);
    setNewPaperTitle("");
    setPendingImportFile(null);
    addDialog.current?.close();
    if (pendingImportFile) {
      const pdfUrl = URL.createObjectURL(pendingImportFile);
      setActivePdfUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return pdfUrl;
      });
      setActivePaperId(paper.id);
      setPreviousView(activeView);
      setActiveView("reader");
      setRightPanel(null);
      setPage(1);
      if (window.innerWidth <= 960) setLeftOpen(false);
      showFeedback("PDF 已导入并保存到本地文库");
    } else {
      navigate("library");
      showFeedback("条目已创建");
    }
  };

  const addCollection = (event: FormEvent) => {
    event.preventDefault();
    const name = newCollectionName.trim();
    if (!name) return;
    const collection: LibraryCollection = { id: `collection-${Date.now()}`, name, parentId: activeCollectionId, itemIds: [] };
    setCollections((items) => [...items, collection]);
    setNewCollectionName("");
    collectionDialog.current?.close();
    openCollection(collection.id);
  };

  const setVerificationStatus = (id: string, status: VerificationItem["status"]) => {
    setVerificationItems((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const toggleFocusMode = () => {
    setFocusMode((value) => !value);
    setAssistantOpen(false);
  };

  const fitReaderToWindowWidth = () => {
    setReaderFitMode("width");
    setFocusMode(true);
    setLeftOpen(false);
    setSidebarPeekOpen(false);
    setReaderNavOpen(false);
    setSplitView(false);
    setAssistantOpen(false);
    setRightPanel(null);
    showFeedback("已按窗口宽度铺满阅读区");
  };

  const setSidebarExpanded = (expanded: boolean) => {
    if (sidebarPeekTimer.current) window.clearTimeout(sidebarPeekTimer.current);
    setFocusMode(false);
    setSidebarPeekOpen(false);
    setLeftOpen(expanded);
    if (!expanded) showFeedback("文库已折叠，可从左上角“展开文库”恢复");
  };

  const openSidebarPeek = () => {
    if (sidebarPeekTimer.current) window.clearTimeout(sidebarPeekTimer.current);
    if (!leftOpen && window.innerWidth > 640) setSidebarPeekOpen(true);
  };

  const openSidebarPeekFromFocus = () => {
    if (sidebarPeekTimer.current) window.clearTimeout(sidebarPeekTimer.current);
    if (!leftOpen && window.innerWidth > 640) {
      sidebarPeekTimer.current = window.setTimeout(() => setSidebarPeekOpen(true), 80);
    }
  };

  const closeSidebarPeekSoon = () => {
    if (sidebarPeekTimer.current) window.clearTimeout(sidebarPeekTimer.current);
    sidebarPeekTimer.current = window.setTimeout(() => setSidebarPeekOpen(false), 180);
  };

  const updateThemePointFromPointer = (event: ReactPointerEvent<HTMLElement>, pointId = activeThemePointId) => {
    const bounds = themeCanvas.current?.getBoundingClientRect();
    if (!bounds || !pointId) return;
    const x = Math.max(4, Math.min(96, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(4, Math.min(96, ((event.clientY - bounds.top) / bounds.height) * 100));
    setWorkspaceTheme((theme) => ({ ...theme, points: theme.points.map((point) => point.id === pointId ? { ...point, x, y } : point) }));
  };

  const applyThemePreset = (colors: string[]) => {
    const positions = [[20, 20], [76, 34], [48, 82]];
    const seed = Date.now();
    const points = colors.map((color, index) => ({ id: `preset-${seed}-${index}`, color, x: positions[index]?.[0] ?? 50, y: positions[index]?.[1] ?? 50, isPrimary: index === 0 }));
    setWorkspaceTheme((theme) => ({ ...theme, points }));
    setActiveThemePointId(points[0].id);
  };

  const addThemePoint = () => {
    if (workspaceTheme.points.length >= 5) return;
    const id = `custom-${Date.now()}`;
    setWorkspaceTheme((theme) => ({ ...theme, points: [...theme.points, { id, color: "#f4b7c8", x: 50, y: 50 }] }));
    setActiveThemePointId(id);
  };

  const removeThemePoint = () => {
    if (workspaceTheme.points.length <= 1) return;
    const remaining = workspaceTheme.points.filter((point) => point.id !== activeThemePointId);
    if (!remaining.some((point) => point.isPrimary)) remaining[0] = { ...remaining[0], isPrimary: true };
    setWorkspaceTheme((theme) => ({ ...theme, points: remaining }));
    setActiveThemePointId(remaining[0].id);
  };

  useEffect(() => {
    setAiSourceIds((sourceIds) => sourceIds.includes(activePaper.id) ? sourceIds : [activePaper.id, ...sourceIds].slice(0, 6));
  }, [activePaper.id]);

  useEffect(() => {
    let active = true;
    getAiProviderStatus(aiProviderConfig)
      .then((status) => { if (active) setAiProviderStatus(status); })
      .catch(() => { if (active) setAiProviderStatus(null); });
    return () => { active = false; };
  }, [aiProviderConfig.provider]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        commandDialog.current?.showModal();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setAssistantOpen((value) => !value);
      }
      if (activeView === "reader" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoAnnotationChange();
        else undoAnnotationChange();
      }
      if (activeView === "reader" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoAnnotationChange();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView, annotationRedoStack, annotationUndoStack, annotations]);

  useEffect(() => {
    const closeNavigationOnNarrowViewport = () => {
      if (window.innerWidth <= 960) setLeftOpen(false);
    };
    window.addEventListener("resize", closeNavigationOnNarrowViewport);
    return () => window.removeEventListener("resize", closeNavigationOnNarrowViewport);
  }, []);

  useEffect(() => {
    if (activeView !== "reader") return;
    let selectionTimer = 0;
    const onSelectionChange = () => {
      const selection = window.getSelection();
      window.clearTimeout(selectionTimer);
      if (!selection || selection.isCollapsed) {
        setPendingTextSelection(null);
        return;
      }
      selectionTimer = window.setTimeout(captureReaderSelection, 90);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      window.clearTimeout(selectionTimer);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [activeView, activePdfUrl, annotationTool, annotationToolArmed, page]);

  useEffect(() => {
    window.localStorage.setItem("research-workspace-theme-v1", JSON.stringify(workspaceTheme));
  }, [workspaceTheme]);

  useEffect(() => { window.localStorage.setItem("research-papers-v3", JSON.stringify(papers)); }, [papers]);
  useEffect(() => { window.localStorage.setItem("research-notes-v4", JSON.stringify(notes)); }, [notes]);
  useEffect(() => { window.localStorage.setItem("research-annotations-v3", JSON.stringify(annotations)); }, [annotations]);
  useEffect(() => { window.localStorage.setItem("research-collections-v3", JSON.stringify(collections)); }, [collections]);
  useEffect(() => { window.localStorage.setItem("research-verification-v2", JSON.stringify(verificationItems)); }, [verificationItems]);

  useEffect(() => {
    let cancelled = false;
    if (parsedDocuments[activePaper.id]) return;
    setParsedDocumentLoading(true);
    loadParsedDocument(activePaper.id)
      .then((document) => {
        if (!cancelled && document) setParsedDocuments((current) => ({ ...current, [activePaper.id]: document }));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setParsedDocumentLoading(false); });
    return () => { cancelled = true; };
  }, [activePaper.id, parsedDocuments]);

  useEffect(() => {
    if (!notes.length) {
      if (activeNoteId) setActiveNoteId(null);
      return;
    }
    if (!activeNoteId || !notes.some((note) => note.id === activeNoteId)) setActiveNoteId(notes[0].id);
  }, [activeNoteId, notes]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRightPanel(null);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  useEffect(() => () => {
    if (sidebarPeekTimer.current) window.clearTimeout(sidebarPeekTimer.current);
    if (citationFocusTimer.current) window.clearTimeout(citationFocusTimer.current);
  }, []);

  const commandItems = [
    { label: "打开全部条目", hint: "G L", icon: Library, run: () => openLibraryScope("all") },
    { label: "打开阅读笔记", hint: "G N", icon: NotebookPen, run: () => navigate("notes") },
    { label: "核验引用", hint: "G V", icon: FileCheck2, run: () => navigate("verify") },
    { label: "打开插件中心", hint: "G P", icon: Puzzle, run: () => navigate("plugins") },
    { label: "查找重复条目", hint: "G D", icon: Copy, run: () => openLibraryScope("duplicates") },
    { label: "打开回收站", hint: "G T", icon: Trash2, run: () => openLibraryScope("trash") },
    { label: "新建集合", hint: "N C", icon: FolderPlus, run: () => collectionDialog.current?.showModal() },
    { label: "打开 AI 笔记本", hint: "Ctrl J", icon: Bot, run: () => setAssistantOpen(true) },
    { label: "添加本地条目", hint: "N", icon: FilePlus2, run: () => addDialog.current?.showModal() },
  ].filter((item) => item.label.toLowerCase().includes(commandQuery.toLowerCase()));

  const closeCommandAndRun = (run: () => void) => {
    commandDialog.current?.close();
    run();
  };

  return (
    <main className="research-app" style={appStyle} data-left-open={leftOpen} data-sidebar-peek={sidebarPeekOpen} data-focus={focusMode} data-theme-scheme={workspaceTheme.scheme} data-theme-dark={themeIsDark} data-compact-rows={compactRows}>
      <nav className="workspace-rail" aria-label="工作台工具" onMouseEnter={openSidebarPeek} onMouseLeave={closeSidebarPeekSoon} onFocusCapture={openSidebarPeekFromFocus} onBlurCapture={closeSidebarPeekSoon}>
        <IconButton label={leftOpen ? "收起侧栏" : "展开侧栏"} active={!leftOpen} onClick={() => setSidebarExpanded(!leftOpen)}>
          {leftOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
        </IconButton>

        <div className="rail-group" aria-label="主要功能">
          <IconButton label="文库" active={["library", "notes", "verify", "reader"].includes(activeView)} onClick={() => openLibraryScope("all")}>
            <Library size={18} />
          </IconButton>
          <IconButton label="阅读笔记" active={activeView === "notes"} onClick={openNotes}>
            <NotebookPen size={18} />
          </IconButton>
          <IconButton label={`待核验引用 · ${pendingCount}`} active={activeView === "verify"} onClick={openVerification}>
            <FileCheck2 size={18} />
          </IconButton>
          <IconButton label="插件中心" active={activeView === "plugins"} onClick={() => navigate("plugins")}>
            <Puzzle size={18} />
          </IconButton>
          <IconButton label="搜索与命令" onClick={() => commandDialog.current?.showModal()}>
            <Search size={18} />
          </IconButton>
          <IconButton label="AI 笔记本" active={assistantOpen} onClick={() => setAssistantOpen((value) => !value)}>
            <Bot size={18} />
          </IconButton>
        </div>

        <div className="rail-group rail-bottom">
          <IconButton label="帮助" onClick={() => helpDialog.current?.showModal()}><CircleHelp size={18} /></IconButton>
          <IconButton label="设置" onClick={() => settingsDialog.current?.showModal()}><Settings2 size={18} /></IconButton>
        </div>
      </nav>

      <aside className="nav-pane" aria-label="文库导航" aria-hidden={!leftOpen && !sidebarPeekOpen} inert={!leftOpen && !sidebarPeekOpen} onMouseEnter={openSidebarPeek} onMouseLeave={closeSidebarPeekSoon} onFocusCapture={openSidebarPeek} onBlurCapture={closeSidebarPeekSoon}>
        <div className="zen-chrome-controls" aria-label="窗口导航">
          <IconButton label="更多选项" onClick={() => commandDialog.current?.showModal()}><Ellipsis size={18} /></IconButton>
          <IconButton label="切换侧栏" onClick={() => setSidebarExpanded(!leftOpen)}>{leftOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</IconButton>
          <IconButton label="后退" onClick={() => navigate(previousView)}><ArrowLeft size={18} /></IconButton>
          <IconButton label="前进" onClick={() => showFeedback("当前没有更前的页面")}><ArrowRight size={18} /></IconButton>
          <IconButton label="刷新当前视图" onClick={() => showFeedback("当前视图已刷新")}><RotateCcw size={18} /></IconButton>
        </div>
        <header className="nav-pane-header">
          <div>
            <h1>论文工作台</h1>
            <p>当前项目 · 课题 1 · 论文助手</p>
          </div>
          <IconButton label="折叠为图标栏" onClick={() => setSidebarExpanded(false)}><PanelLeftClose size={17} /></IconButton>
        </header>

        <button className="command-entry" type="button" onClick={() => commandDialog.current?.showModal()}>
          <Search size={15} />
          <span>搜索条目或运行指令</span>
          <kbd>Ctrl K</kbd>
        </button>

        <section className="nav-group" aria-labelledby="nav-library-title">
          <h2 id="nav-library-title">文库</h2>
          <button className="nav-item" data-active={activeView === "library" && libraryScope === "all" && !activeCollectionId && selectedLibraryTags.length === 0} type="button" onClick={() => openLibraryScope("all")}>
            <Library size={16} /><span>全部条目</span><small>{livePapers.length}</small>
          </button>
          <button className="nav-item" data-active={activeView === "library" && libraryScope === "recent"} type="button" onClick={() => openLibraryScope("recent")}>
            <BookOpenText size={16} /><span>最近添加</span><small>{Math.min(3, livePapers.length)}</small>
          </button>
          <button className="nav-item" data-active={activeView === "library" && libraryScope === "unfiled"} type="button" onClick={() => openLibraryScope("unfiled")}>
            <FileText size={16} /><span>未分类条目</span><small>{livePapers.filter((paper) => paper.collectionIds.length === 0).length}</small>
          </button>
          <button className="nav-item" data-active={activeView === "library" && libraryScope === "duplicates"} type="button" onClick={() => openLibraryScope("duplicates")}>
            <Copy size={16} /><span>重复条目</span><small>{duplicatePaperIds.size}</small>
          </button>
          <button className="nav-item" data-active={activeView === "notes"} type="button" onClick={openNotes}>
            <NotebookPen size={16} /><span>阅读笔记</span><small>{notes.length}</small>
          </button>
          <button className="nav-item" data-active={activeView === "verify"} type="button" onClick={openVerification}>
            <FileSearch size={16} /><span>待核验引用</span><small>{pendingCount}</small>
          </button>
          <button className="nav-item" data-active={activeView === "library" && libraryScope === "trash"} type="button" onClick={() => openLibraryScope("trash")}>
            <Trash2 size={16} /><span>回收站</span><small>{papers.filter((paper) => paper.deletedAt).length}</small>
          </button>
        </section>

        <section className="nav-group" aria-labelledby="nav-collection-title">
          <div className="nav-section-heading">
            <h2 id="nav-collection-title">集合</h2>
            <IconButton label="新建集合" onClick={() => collectionDialog.current?.showModal()}><FolderPlus size={14} /></IconButton>
          </div>
          {collections.map((collection) => (
            <button className={`nav-item${collection.parentId !== null ? " nav-item-child" : ""}`} data-active={activeView === "library" && activeCollectionId === collection.id} type="button" key={collection.id} onClick={() => openCollection(collection.id)}>
              <Folder size={16} /><span>{collection.name}</span><small>{livePapers.filter((paper) => paper.collectionIds.includes(collection.id)).length}</small>
            </button>
          ))}
        </section>

        <section className="nav-group nav-tags" aria-labelledby="nav-tags-title">
          <div className="nav-section-heading"><h2 id="nav-tags-title">标签</h2><small>{libraryTags.length}</small></div>
          <div className="tag-cloud">
            {libraryTags.map((tag) => (
              <button type="button" key={tag.name} aria-pressed={selectedLibraryTags.includes(tag.name)} onClick={() => openTag(tag.name)}>
                <span style={{ "--tag-color": tag.color } as CSSProperties} />{tag.name}
              </button>
            ))}
          </div>
        </section>

        <section className="nav-group" aria-labelledby="nav-extensions-title">
          <h2 id="nav-extensions-title">扩展</h2>
          <button className="nav-item" data-active={activeView === "plugins"} type="button" onClick={() => navigate("plugins")}>
            <Puzzle size={16} /><span>插件中心</span><small>桌面</small>
          </button>
        </section>

      </aside>

      <section className="main-surface" aria-label={viewTitles[activeView]}>
        <header className="surface-bar">
          <div className="surface-bar-left">
            {!leftOpen && <button className="library-reopen-button" type="button" onClick={() => setSidebarExpanded(true)}><PanelLeftOpen size={16} /><span>展开文库</span></button>}
            {activeView === "reader" && (
              <IconButton label="返回上一页" onClick={() => navigate(previousView === "reader" ? "library" : previousView)}><ArrowLeft size={17} /></IconButton>
            )}
            <div className="surface-title">
              <strong>{activeView === "reader" ? activePaper.title : viewTitles[activeView]}</strong>
               <small>{activeView === "reader" ? `${activePaper.authors} · ${activePaper.year}` : `${livePapers.length} 个条目 · ${notes.length} 条笔记`}</small>
            </div>
          </div>
          <div className="surface-actions">
            {activeView === "reader" && (
              <>
                <IconButton label="批注、笔记与标签面板" active={splitView} onClick={() => setSplitView((value) => !value)}><PanelRight size={17} /></IconButton>
                <IconButton label="专注阅读" active={focusMode} onClick={toggleFocusMode}><Focus size={17} /></IconButton>
              </>
            )}
            <IconButton label="AI 笔记本" active={assistantOpen} onClick={() => setAssistantOpen((value) => !value)}><Bot size={17} /></IconButton>
          </div>
        </header>

        {activeView === "library" && (
          <div className="index-view">
            <header className="index-toolbar">
              <label className="library-search">
                <Search size={15} />
                <span className="sr-only">搜索当前文库</span>
                <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="题名、作者、期刊或标签" />
                {libraryQuery && <button type="button" aria-label="清除搜索" onClick={() => setLibraryQuery("")}><X size={14} /></button>}
              </label>
              <div className="index-actions">
                <button className="v2-secondary-button" type="button" aria-expanded={filtersOpen} data-active={filtersOpen || citationFilter !== "all"} onClick={() => setFiltersOpen((value) => !value)}>
                  <ListFilter size={15} />筛选
                </button>
                <button className="v2-primary-button" type="button" onClick={() => addDialog.current?.showModal()}>
                  <Plus size={15} />添加条目
                </button>
              </div>
            </header>

            {filtersOpen && (
              <div className="filter-strip" aria-label="条目筛选">
                <span>引用状态</span>
                {(["all", "verified", "pending"] as CitationFilter[]).map((filter) => (
                  <button type="button" key={filter} aria-pressed={citationFilter === filter} onClick={() => setCitationFilter(filter)}>
                    {filter === "all" ? "全部" : filter === "verified" ? "已核验" : "待核验"}
                  </button>
                ))}
                <span>标签</span>
                {libraryTags.map((tag) => (
                  <button type="button" key={tag.name} aria-pressed={selectedLibraryTags.includes(tag.name)} onClick={() => setSelectedLibraryTags((current) => current.includes(tag.name) ? current.filter((item) => item !== tag.name) : [...current, tag.name])}>
                    {tag.name}
                  </button>
                ))}
                <small>{filteredPapers.length} 个结果</small>
              </div>
            )}

            {(libraryScope !== "all" || activeCollectionId || selectedLibraryTags.length > 0) && (
              <div className="active-library-scope">
                <span><ListFilter size={14} />当前范围：{selectedLibraryTags.length ? `标签 ${selectedLibraryTags.join(" + ")}` : activeCollectionId ? collections.find((collection) => collection.id === activeCollectionId)?.name : libraryScope === "recent" ? "最近添加" : libraryScope === "unfiled" ? "未分类条目" : libraryScope === "duplicates" ? "重复条目" : "回收站"}</span>
                <button type="button" onClick={() => openLibraryScope("all")}>显示全部</button>
              </div>
            )}

            <div className="library-summary">
              <span><strong>{filteredPapers.length}</strong> 个条目</span>
              <span><FileText size={14} />{filteredPapers.filter((paper) => paper.attachment !== "—").length} 个附件</span>
              <span><NotebookPen size={14} />{notes.length} 条笔记</span>
              <span><Highlighter size={14} />{annotations.length} 条批注</span>
            </div>

            <div className="item-table" role="table" aria-label="论文条目">
              <div className="item-row item-head" role="row">
                <button role="columnheader" type="button" aria-sort={librarySortField === "title" ? (librarySortDirection === "asc" ? "ascending" : "descending") : "none"} onClick={() => toggleLibrarySort("title")}>题名{librarySortField === "title" ? (librarySortDirection === "asc" ? " ↑" : " ↓") : ""}</button>
                <button role="columnheader" type="button" aria-sort={librarySortField === "authors" ? (librarySortDirection === "asc" ? "ascending" : "descending") : "none"} onClick={() => toggleLibrarySort("authors")}>作者{librarySortField === "authors" ? (librarySortDirection === "asc" ? " ↑" : " ↓") : ""}</button>
                <button role="columnheader" type="button" aria-sort={librarySortField === "year" ? (librarySortDirection === "asc" ? "ascending" : "descending") : "none"} onClick={() => toggleLibrarySort("year")}>年份{librarySortField === "year" ? (librarySortDirection === "asc" ? " ↑" : " ↓") : ""}</button>
                <span role="columnheader">附件</span><span role="columnheader">状态</span>
              </div>
              {filteredPapers.map((paper) => (
                <div className="item-tree-group" key={paper.id}>
                  <div className="item-row item-data-row" role="row" tabIndex={0} data-selected={activePaperId === paper.id && rightPanel?.kind === "paper"} onClick={() => selectPaper(paper)} onDoubleClick={() => openPaper(paper)} onKeyDown={(event) => { if (event.key === "Enter") openPaper(paper); }}>
                    <span className="item-title-cell" role="cell">
                      <button className="item-disclosure" type="button" aria-label={expandedPaperIds.includes(paper.id) ? "收起附件" : "展开附件"} aria-expanded={expandedPaperIds.includes(paper.id)} disabled={!paper.attachmentId} onClick={(event) => { event.stopPropagation(); togglePaperExpanded(paper.id); }}><ChevronRight size={13} /></button>
                      <span className="v2-paper-dot" data-tone={paper.tone} aria-hidden="true" />
                      <span><strong>{paper.title}</strong><small>{paper.journal} · {paper.tags.join(" · ") || "无标签"}</small></span>
                    </span>
                    <span role="cell">{paper.authors}</span>
                    <span role="cell">{paper.year}</span>
                    <span role="cell">{paper.attachment}</span>
                    <span role="cell" className="item-status" data-state={paper.citationState}>
                      {paper.deletedAt ? <><Trash2 size={13} />回收站</> : paper.citationState === "verified" ? <><Check size={13} />已核验</> : <><FileSearch size={13} />待核验</>}
                    </span>
                  </div>
                  {expandedPaperIds.includes(paper.id) && paper.attachmentId && (
                    <button className="attachment-child-row" type="button" onClick={() => openPaper(paper)}><FileText size={15} /><span><strong>{paper.attachment} 全文附件</strong><small>{paper.meta}</small></span><span>双击条目或点击此处打开</span><ChevronRight size={14} /></button>
                  )}
                </div>
              ))}
              {filteredPapers.length === 0 && (
                <div className="empty-state">
                  {libraryScope === "duplicates" ? <Copy size={22} /> : libraryScope === "trash" ? <Trash2 size={22} /> : <Search size={22} />}
                  <strong>{libraryScope === "duplicates" ? "未发现重复条目" : libraryScope === "trash" ? "回收站为空" : "没有匹配的条目"}</strong>
                  <p>{libraryScope === "duplicates" ? "题名相同的条目会集中显示在这里。" : libraryScope === "trash" ? "移除的条目会保留在这里，直到后续彻底删除。" : "换一个题名、作者或标签搜索。"}</p>
                  {libraryScope !== "duplicates" && libraryScope !== "trash" && <button type="button" onClick={() => setLibraryQuery("")}>清除搜索</button>}
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === "notes" && (
          <div className="notes-view">
            <header className="content-view-heading">
              <div><h2>阅读笔记</h2><p>笔记与文献页码保持回链，正文以结构化文档保存。</p></div>
              <div className="notes-heading-actions">
                <button className="v2-secondary-button" type="button" onClick={() => openPaper(activePaper)}><BookOpen size={15} />继续阅读</button>
                <button className="v2-primary-button" type="button" onClick={createBlankNote}><Plus size={15} />新建笔记</button>
              </div>
            </header>
            <div className="notes-workspace">
              <aside className="notes-index" aria-label="笔记列表">
                <header><span>{notes.length} 条笔记</span><small>自动保存</small></header>
                <div className="notes-index-list">
                  {notes.map((note) => (
                    <button className="note-index-item" data-active={activeNote?.id === note.id} type="button" key={note.id} onClick={() => setActiveNoteId(note.id)}>
                      <span><NotebookPen size={15} /><strong>{note.title || "无标题笔记"}</strong><time>{note.createdAt}</time></span>
                      <p>{notePreview(note) || "开始记录这篇文献中的想法…"}</p>
                      <small>{note.source} · p. {note.page}</small>
                    </button>
                  ))}
                  {notes.length === 0 && <div className="notes-index-empty"><NotebookPen size={20} /><strong>还没有笔记</strong><p>新建笔记或从阅读器保存一段批注。</p></div>}
                </div>
              </aside>
              {activeNote ? (
                <ResearchNoteEditor
                  note={activeNote}
                  onChange={(patch) => updateNote(activeNote.id, patch)}
                  onSourceOpen={() => openNoteSource(activeNote)}
                  onFeedback={showFeedback}
                />
              ) : (
                <div className="note-editor-empty"><NotebookPen size={26} /><strong>选择或新建一条笔记</strong><button className="v2-primary-button" type="button" onClick={createBlankNote}><Plus size={15} />新建笔记</button></div>
              )}
            </div>
          </div>
        )}

        {activeView === "verify" && (
          <div className="verification-view">
            <header className="content-view-heading">
              <div><h2>逐条检查引用是否真的支持主张</h2><p>每次核验都会保留来源位置、判断结果和修改记录。</p></div>
              <div className="verification-count"><strong>{pendingCount}</strong><span>待处理</span></div>
            </header>
            <div className="verification-list">
              {verificationItems.map((item) => (
                <article className="verification-card" data-status={item.status} key={item.id}>
                  <header>
                    <span>{item.status === "pending" ? "待核验" : item.status === "verified" ? "已确认" : "已驳回"}</span>
                    <small>{item.citation}</small>
                  </header>
                  <blockquote>{item.claim}</blockquote>
                  <p>{item.issue}</p>
                  <footer>
                    <button type="button" onClick={() => setVerificationStatus(item.id, "rejected")}><XCircle size={14} />不支持</button>
                    <button type="button" onClick={() => setVerificationStatus(item.id, "verified")}><Check size={14} />确认支持</button>
                    {item.status !== "pending" && <button type="button" onClick={() => setVerificationStatus(item.id, "pending")}><RotateCcw size={14} />撤销</button>}
                  </footer>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeView === "plugins" && (
          <div className="plugins-view">
            <header className="content-view-heading plugin-heading">
              <div>
                <span className="plugin-kicker">扩展运行时</span>
                <h2>Zotero 插件兼容中心</h2>
                <p>这里管理应用插件；Codex 的开发技能不会伪装成 Zotero 插件。</p>
              </div>
              <button className="v2-primary-button" type="button" onClick={() => showFeedback("请在桌面版中通过“工具 → 附加组件”安装 XPI")}><PackageCheck size={15} />桌面版管理</button>
            </header>

            <section className="plugin-runtime-banner">
              <PackageOpen size={22} />
              <div><strong>此页面仅是视觉原型</strong><p>Web 端不再接收或登记 XPI。正式桌面版以 Zotero 9.0.6 为内核，插件安装、启停、升级和卸载全部由原生 Add-ons Manager 执行。</p></div>
              <span>拒绝伪安装</span>
            </section>

            <div className="plugin-grid">
              <article className="plugin-card" data-status="ready">
                <header><span><PackageCheck size={18} /></span><small>内置架构</small></header>
                <h3>Zotero 9 原生插件运行时</h3>
                <p>保留 Gecko、AddonManager、bootstrap 生命周期、Zotero API、Reader 和 Connector Server，不再另造插件协议。</p>
                <footer><b>桌面构建已接入</b><span>工具 → 附加组件</span></footer>
              </article>

              <article className="plugin-card" data-status="skill">
                <header><span><Puzzle size={18} /></span><small>开发工具</small></header>
                <h3>reverse skill</h3>
                <p>用于分析 Zotero 和 Zen 源码，不在本软件内运行，也不会出现在 Zotero 插件列表中。</p>
                <footer><b>已安装到 Codex</b><code>C:\Users\111222\.codex\skills\reverse-skill</code></footer>
              </article>

              <article className="plugin-card" data-status="ready">
                <header><span><PackageOpen size={18} /></span><small>预装 XPI</small></header>
                <h3>论文工作台研究工具</h3>
                <p>通过标准 ItemPane、Menu、Item 与 Reader API 访问真实文库，并保留 MinerU 本地服务适配入口。</p>
                <footer><b>原生生命周期</b><span>可禁用、升级和卸载</span></footer>
              </article>
            </div>
          </div>
        )}

        {activeView === "reader" && (
          <div className="reader-view" data-split={splitView} data-nav-open={readerNavOpen} data-fit-mode={readerFitMode}>
            <aside className="reader-navigator" aria-label="文档导航" aria-hidden={!readerNavOpen} inert={!readerNavOpen}>
              <div className="reader-nav-tabs" role="tablist" aria-label="文档导航类型">
                <button type="button" role="tab" aria-selected={readerNavTab === "thumbnails"} title="缩略图" onClick={() => setReaderNavTab("thumbnails")}><GalleryVerticalEnd size={17} /><span className="sr-only">缩略图</span></button>
                <button type="button" role="tab" aria-selected={readerNavTab === "annotations"} title="批注" onClick={() => setReaderNavTab("annotations")}><Highlighter size={17} /><span className="sr-only">批注</span></button>
                <button type="button" role="tab" aria-selected={readerNavTab === "outline"} title="大纲" onClick={() => setReaderNavTab("outline")}><ListTree size={17} /><span className="sr-only">大纲</span></button>
                <IconButton label="收起文档导航" onClick={() => setReaderNavOpen(false)}><PanelLeftClose size={16} /></IconButton>
              </div>
              {readerNavTab !== "thumbnails" && (
                <label className="reader-nav-search">
                  <Search size={14} /><span className="sr-only">{readerNavTab === "outline" ? "搜索大纲" : "搜索批注"}</span>
                  <input value={readerNavQuery} onChange={(event) => setReaderNavQuery(event.target.value)} placeholder={readerNavTab === "outline" ? "搜索大纲" : "搜索批注"} />
                  {readerNavQuery && <button type="button" aria-label="清除搜索" onClick={() => setReaderNavQuery("")}><X size={13} /></button>}
                </label>
              )}
              <div className="reader-nav-content">
                {readerNavTab === "thumbnails" && (
                  <div className="reader-thumbnails" role="listbox" aria-label="页面缩略图">
                    {Array.from({ length: activePageCount }, (_, index) => index + 1).map((pageNumber) => (
                      <button type="button" role="option" aria-selected={page === pageNumber} className="reader-thumbnail" key={pageNumber} onClick={() => { setActiveOutlineTitle(""); setPage(pageNumber); }}>
                        {activePdfDocument ? <PdfPageCanvas document={activePdfDocument} pageNumber={pageNumber} thumbnailWidth={120} /> : <span className="reader-thumbnail-page"><i /><i /><i /><b data-marked={pageNumber === 6 || pageNumber === 9} /></span>}
                        <small>{pageNumber}</small>
                      </button>
                    ))}
                  </div>
                )}
                {readerNavTab === "annotations" && (
                  <div className="reader-nav-annotations">
                    {readerNavAnnotations.map((annotation) => (
                      <button type="button" key={annotation.id} onClick={() => setPage(Number(annotation.pageLabel) || page)}>
                        <span style={{ "--annotation-color": annotation.color } as CSSProperties} />
                        <strong>{annotation.text || annotation.comment || "无文字批注"}</strong>
                        <small>p. {annotation.pageLabel} · {annotationTools.find((tool) => tool.id === annotation.type)?.label}</small>
                      </button>
                    ))}
                    {readerNavAnnotations.length === 0 && <p className="reader-nav-empty">没有匹配的批注。</p>}
                  </div>
                )}
                {readerNavTab === "outline" && (
                  <nav className="reader-outline" aria-label="论文大纲">
                    {activeReaderOutline.filter((item) => !readerNavQuery || [item.title, ...(item.children?.map((child) => child.title) ?? [])].join(" ").toLowerCase().includes(readerNavQuery.toLowerCase())).map((item) => (
                      <div key={item.title}>
                        <button type="button" data-active={activeOutlineTitle === item.title} onClick={() => { setActiveOutlineTitle(item.title); setPage(item.page); }}><span>{item.children ? <ChevronDown size={13} /> : null}</span><strong>{item.title}</strong><small>{item.page}</small></button>
                        {item.children?.filter((child) => !readerNavQuery || child.title.toLowerCase().includes(readerNavQuery.toLowerCase()) || item.title.toLowerCase().includes(readerNavQuery.toLowerCase())).map((child) => (
                          <button className="reader-outline-child" type="button" data-active={activeOutlineTitle === child.title} key={child.title} onClick={() => { setActiveOutlineTitle(child.title); setPage(child.page); }}><span /><strong>{child.title}</strong><small>{child.page}</small></button>
                        ))}
                      </div>
                    ))}
                    {activeReaderOutline.length === 0 && <p className="reader-nav-empty">正在读取文档结构…</p>}
                  </nav>
                )}
              </div>
            </aside>
            <div className="reader-column">
              <div className="reader-toolbar" role="toolbar" aria-label="阅读工具">
                <div>
                  <IconButton label={readerNavOpen ? "收起缩略图、批注与大纲" : "展开缩略图、批注与大纲"} active={readerNavOpen} onClick={() => setReaderNavOpen((value) => !value)}><PanelLeft size={16} /></IconButton>
                  <IconButton label="上一页" disabled={page <= 1} onClick={() => { setActiveOutlineTitle(""); setPage((value) => Math.max(1, value - 1)); }}><ChevronLeft size={16} /></IconButton>
                  <span className="reader-counter">{page} / {activePageCount}</span>
                  <IconButton label="下一页" disabled={page >= activePageCount} onClick={() => { setActiveOutlineTitle(""); setPage((value) => Math.min(activePageCount, value + 1)); }}><ChevronRight size={16} /></IconButton>
                </div>
                <div className="annotation-toolbar-group">
                  <div className="annotation-history" role="group" aria-label="批注历史">
                    <IconButton label="撤销批注更改" disabled={!annotationUndoStack.length} onClick={undoAnnotationChange}><Undo2 size={16} /></IconButton>
                    <IconButton label="重做批注更改" disabled={!annotationRedoStack.length} onClick={redoAnnotationChange}><Redo2 size={16} /></IconButton>
                  </div>
                  <div className="annotation-toolset" role="group" aria-label="批注类型">
                    {annotationTools.filter((tool) => ["highlight", "underline", "note"].includes(tool.id)).map((tool) => {
                      const ToolIcon = tool.icon;
                      return <IconButton key={tool.id} label={`${tool.label}选中文字`} active={annotationTool === tool.id && annotationToolArmed} onClick={() => activateAnnotationTool(tool.id)}><ToolIcon size={16} /></IconButton>;
                    })}
                  </div>
                  <div className="annotation-color-set" role="group" aria-label="批注颜色">
                    {annotationColors.map((color) => <button key={color} type="button" aria-label={`使用批注颜色 ${color}`} aria-pressed={annotationColor === color} style={{ "--annotation-color": color } as CSSProperties} onClick={() => setAnnotationColor(color)} />)}
                  </div>
                </div>
                <div>
                  <button className="mineru-status-button" data-ready={Boolean(activeParsedDocument)} type="button" title={activeParsedDocument ? `${activeParsedDocument.parser.sourceFormat} · MinerU ${activeParsedDocument.parser.version} · ${activeParsedDocument.blocks.length} 个内容块` : "导入 MinerU content_list.json、content_list_v2.json 或 middle.json"} onClick={() => mineruFileInput.current?.click()}>
                    {parsedDocumentLoading ? <span className="v2-spinner" /> : <FileSearch size={15} />}
                    <span>{activeParsedDocument ? `MinerU · ${activeParsedDocument.blocks.length} 块` : parsedDocumentLoading ? "检查解析" : "导入 MinerU"}</span>
                  </button>
                  <input ref={mineruFileInput} className="sr-only" type="file" accept=".json,application/json" onChange={importMineruResult} />
                  <IconButton label={sidenotesOpen ? "隐藏侧边批注" : "显示侧边批注"} active={sidenotesOpen} onClick={() => setSidenotesOpen((value) => !value)}><MessageSquareQuote size={16} /></IconButton>
                  <IconButton label="适应窗口宽度并进入专注阅读" active={readerFitMode === "width"} onClick={fitReaderToWindowWidth}><Maximize2 size={16} /></IconButton>
                  <IconButton label="缩小" disabled={readerFitMode === "custom" && zoom <= 80} onClick={() => { setReaderFitMode("custom"); setZoom((value) => Math.max(80, value - 8)); }}><Minus size={16} /></IconButton>
                  <button className="reader-fit-label" type="button" title="切换整页与适应窗口宽度" onClick={() => readerFitMode === "width" ? setReaderFitMode("page") : fitReaderToWindowWidth()}>{readerFitMode === "width" ? "适应窗口" : readerFitMode === "page" ? "整页" : `${zoom}%`}</button>
                  <IconButton label="放大" disabled={readerFitMode === "custom" && zoom >= 160} onClick={() => { setReaderFitMode("custom"); setZoom((value) => Math.min(160, value + 8)); }}><ZoomIn size={16} /></IconButton>
                </div>
              </div>
              <div className="paper-canvas" data-fit-mode={readerFitMode} onPointerUp={captureReaderSelection} onMouseUp={captureReaderSelection}>
                {activePdfDocument ? (
                  <PdfContinuousReader
                    document={activePdfDocument}
                    pageNumber={page}
                    fitMode={readerFitMode}
                    zoom={zoom}
                    annotations={sidenotesOpen ? activePaperAnnotations : []}
                    focusRegion={citationFocus?.paperId === activePaper.id ? { page: citationFocus.page, id: citationFocus.blockId, bbox: citationFocus.bbox } : null}
                    onAnnotationCommentChange={updateAnnotationComment}
                    onAnnotationDelete={(annotationId) => {
                      const annotation = annotations.find((item) => item.id === annotationId);
                      if (annotation) removeAnnotation(annotation);
                    }}
                    onPageChange={(visiblePage) => {
                      setActiveOutlineTitle("");
                      setPage(visiblePage);
                    }}
                  />
                ) : activePdfUrl && pdfLoading ? (
                  <div className="pdf-reader-state"><span className="v2-spinner" /><strong>正在解析 PDF…</strong></div>
                ) : activePdfUrl && pdfError ? (
                  <div className="pdf-reader-state" data-error="true"><FileText size={24} /><strong>{pdfError}</strong><span>请返回文库后重新打开附件</span></div>
                ) : (
                  <article className="v2-paper-page" style={{ "--reader-zoom": readerFitMode === "custom" ? zoom / 100 : 1 } as React.CSSProperties}>
                    <header>
                      <span>METHODS · EVALUATION</span>
                      <h2>{activePaper.title}</h2>
                      <p>{activePaper.authors} · {activePaper.year}</p>
                    </header>
                    <div className="v2-paper-body" onPointerUp={captureReaderSelection} onMouseUp={captureReaderSelection}>
                      <h3>3.2 Evidence traceability</h3>
                      <p data-reader-block="evaluation-intro">{renderReaderBlock("evaluation-intro", readerText.evaluationIntro)}</p>
                      <p data-reader-block="trace-quote">{renderReaderBlock("trace-quote", readerText.traceQuote)}</p>
                      <p data-reader-block="trace-detail">{renderReaderBlock("trace-detail", readerText.traceDetail)}</p>
                      <h3>3.3 Adversarial cases</h3>
                      <p data-reader-block="adversarial">{renderReaderBlock("adversarial", readerText.adversarial)}</p>
                    </div>
                    <footer>{page}</footer>
                  </article>
                )}
              </div>
              {pendingTextSelection && (
                <div className="text-selection-toolbar" role="toolbar" aria-label="为选中文字创建批注" style={{ left: Math.min(Math.max(pendingTextSelection.x, 118), window.innerWidth - 118), top: Math.min(pendingTextSelection.y, window.innerHeight - 68) }} onPointerDown={(event) => event.preventDefault()}>
                  <span title={pendingTextSelection.text}>{pendingTextSelection.text}</span>
                  <button type="button" aria-label="高亮选中文字" aria-pressed={annotationToolArmed && annotationTool === "highlight"} onClick={() => addAnnotationFromSelection("highlight", pendingTextSelection)}><Highlighter size={15} /></button>
                  <button type="button" aria-label="给选中文字加下划线" aria-pressed={annotationToolArmed && annotationTool === "underline"} onClick={() => addAnnotationFromSelection("underline", pendingTextSelection)}><Underline size={15} /></button>
                  <button type="button" aria-label="为选中文字添加便签" aria-pressed={annotationToolArmed && annotationTool === "note"} onClick={() => addAnnotationFromSelection("note", pendingTextSelection)}><StickyNote size={15} /></button>
                  <button type="button" aria-label="取消文字选择" onClick={() => { setPendingTextSelection(null); setAnnotationToolArmed(false); window.getSelection()?.removeAllRanges(); }}><X size={14} /></button>
                </div>
              )}
            </div>
            {splitView && (
              <aside className="reader-inspector" aria-label="批注、笔记与标签">
                <header>
                  <div><strong>论文资料</strong><small>{activePaper.title} · p. {page}</small></div>
                  <IconButton label="关闭论文资料" onClick={() => setSplitView(false)}><X size={16} /></IconButton>
                </header>
                <div className="reader-inspector-tabs" role="tablist" aria-label="论文资料类型">
                  <button type="button" role="tab" aria-selected={readerPanelTab === "annotations"} onClick={() => setReaderPanelTab("annotations")}><Highlighter size={14} />批注 <small>{activePaperAnnotations.length}</small></button>
                  <button type="button" role="tab" aria-selected={readerPanelTab === "notes"} onClick={() => setReaderPanelTab("notes")}><NotebookPen size={14} />笔记</button>
                  <button type="button" role="tab" aria-selected={readerPanelTab === "tags"} onClick={() => setReaderPanelTab("tags")}><Tags size={14} />标签</button>
                </div>

                {readerPanelTab === "annotations" && (
                  <div className="annotation-panel">
                    <label className="annotation-search"><Search size={14} /><span className="sr-only">搜索当前论文批注</span><input value={annotationQuery} onChange={(event) => setAnnotationQuery(event.target.value)} placeholder="搜索批注、评论或标签" /></label>
                    <div className="annotation-filters" aria-label="按批注类型筛选">
                      {(["all", "highlight", "underline", "note"] as AnnotationFilter[]).map((filter) => <button type="button" key={filter} aria-pressed={annotationFilter === filter} onClick={() => setAnnotationFilter(filter)}>{filter === "all" ? "全部" : annotationTools.find((tool) => tool.id === filter)?.label}</button>)}
                    </div>
                    <div className="annotation-selector" aria-label="按颜色和标签筛选">
                      <div>{[...new Set(activePaperAnnotations.map((annotation) => annotation.color))].map((color) => <button className="annotation-filter-color" type="button" key={color} aria-label={`筛选颜色 ${color}`} aria-pressed={annotationColorFilters.includes(color)} style={{ "--annotation-color": color } as CSSProperties} onClick={() => setAnnotationColorFilters((filters) => filters.includes(color) ? filters.filter((item) => item !== color) : [...filters, color])} />)}</div>
                      <div>{[...new Set(activePaperAnnotations.flatMap((annotation) => annotation.tags))].map((tag) => <button type="button" key={tag} aria-pressed={annotationTagFilters.includes(tag)} onClick={() => setAnnotationTagFilters((filters) => filters.includes(tag) ? filters.filter((item) => item !== tag) : [...filters, tag])}><Tag size={11} />{tag}</button>)}</div>
                    </div>
                    {annotationUndoStack.length > 0 && <div className="annotation-undo"><span>批注更改已记录</span><button type="button" onClick={undoAnnotationChange}>撤销</button></div>}
                    <div className="annotation-list">
                      {visibleAnnotations.map((annotation) => (
                        <article className="annotation-card" key={annotation.id} data-type={annotation.type} style={{ "--annotation-color": annotation.color } as CSSProperties}>
                          <header><span><i />{annotationTools.find((tool) => tool.id === annotation.type)?.label}</span><button type="button" onClick={() => setPage(Number(annotation.pageLabel) || page)}>p. {annotation.pageLabel}</button></header>
                          {annotation.text && <blockquote>{annotation.text}</blockquote>}
                          {annotation.readOnly ? annotation.comment && <p>{annotation.comment}</p> : <textarea className="annotation-comment-editor" aria-label={`编辑批注评论 p. ${annotation.pageLabel}`} defaultValue={annotation.comment} placeholder="添加批注评论" onBlur={(event) => updateAnnotationComment(annotation.id, event.target.value)} />}
                          <div className="annotation-tags">{annotation.tags.map((tag) => <button type="button" key={tag} onClick={() => openTag(tag)}><Tag size={11} />{tag}</button>)}</div>
                          {!annotation.readOnly && <div className="annotation-tag-editor" aria-label="编辑批注标签">{libraryTags.map((tag) => <button type="button" key={tag.name} aria-pressed={annotation.tags.includes(tag.name)} onClick={() => toggleAnnotationTag(annotation.id, tag.name)}><span style={{ "--tag-color": tag.color } as CSSProperties} />{tag.name}</button>)}</div>}
                          <footer>
                            {(annotation.type === "highlight" || annotation.type === "underline") && <button type="button" onClick={() => convertAnnotation(annotation.id, annotation.type === "highlight" ? "underline" : "highlight")}>转为{annotation.type === "highlight" ? "下划线" : "高亮"}</button>}
                            <button type="button" onClick={() => addAnnotationToNote(annotation)}>加入笔记</button>
                            <button type="button" disabled={annotation.readOnly} onClick={() => removeAnnotation(annotation)}>移除</button>
                          </footer>
                        </article>
                      ))}
                      {visibleAnnotations.length === 0 && <div className="panel-empty"><Highlighter size={20} /><strong>当前筛选没有批注</strong><p>在论文选区上点击，即可按当前工具创建批注。</p></div>}
                    </div>
                  </div>
                )}

                {readerPanelTab === "notes" && (
                  <div className="reader-note-panel">
                    <label htmlFor="reader-note">记录这一页的证据或疑问</label>
                    <textarea id="reader-note" value={draftNote} onChange={(event) => setDraftNote(event.target.value)} placeholder="例如：作者把“可追溯”拆成了哪些可观察动作？" />
                    <button className="v2-primary-button" type="button" disabled={!draftNote.trim()} onClick={() => addEvidenceNote(draftNote.trim())}><NotebookPen size={15} />保存笔记</button>
                    <section><h3>本论文已有笔记</h3>{notes.filter((note) => note.source === activePaper.title).slice(0, 6).map((note) => <button key={note.id} type="button" onClick={() => openNote(note)}><strong>{note.title}</strong><small>{notePreview(note, 72)}</small><span>p. {note.page}{note.annotationId ? " · 来自批注" : ""}</span></button>)}</section>
                  </div>
                )}

                {readerPanelTab === "tags" && (
                  <div className="reader-tag-panel">
                    <p>标签绑定到文献条目；批注也会独立保留自己的标签。</p>
                    {libraryTags.map((tag) => <label key={tag.name}><input type="checkbox" checked={activePaper.tags.includes(tag.name)} onChange={() => togglePaperTag(tag.name)} /><span style={{ "--tag-color": tag.color } as CSSProperties} /><strong>{tag.name}</strong><small>{annotations.filter((annotation) => annotation.tags.includes(tag.name)).length} 条批注</small></label>)}
                  </div>
                )}
              </aside>
            )}
            <footer className="audit-status"><span>研究文库 · {papers.length} 个条目</span><span>附件 {activePaper.attachmentId ? "已连接" : "缺失"} · 第 {page} 页</span><span>{activePaperAnnotations.length} 条批注 · 按位置排序</span></footer>
          </div>
        )}
      </section>

      {rightPanel && (
        <>
          <aside className="right-panel" aria-label="研究资料面板">
            <header className="right-panel-header">
              <div>
                <span className="right-panel-kicker">研究资料</span>
                <strong>{rightPanel.kind === "library" ? "全部条目" : rightPanel.kind === "notes" ? "阅读笔记" : rightPanel.kind === "verify" ? "待核验引用" : rightPanel.kind === "paper" ? "条目详情" : rightPanel.kind === "tag" ? `标签 · ${rightPanel.tag}` : (collections.find((item) => item.id === rightPanel.collectionId)?.name ?? "集合")}</strong>
              </div>
              <IconButton label="关闭右侧面板" onClick={() => setRightPanel(null)}><X size={17} /></IconButton>
            </header>

            {(rightPanel.kind === "library" || rightPanel.kind === "collection" || rightPanel.kind === "tag") && (
              <div className="right-panel-content">
                <div className="right-panel-toolbar"><span>{filteredPapers.length} 个条目</span><button className="v2-primary-button" type="button" onClick={() => addDialog.current?.showModal()}><Plus size={14} />添加</button></div>
                <label className="library-search right-panel-search"><Search size={14} /><span className="sr-only">搜索条目</span><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="搜索题名、作者或标签" /></label>
                <div className="right-panel-item-list">
                  {filteredPapers.map((paper) => (
                    <button className="right-panel-item" type="button" key={paper.id} onClick={() => openPaper(paper)}>
                      <span className="v2-paper-dot" data-tone={paper.tone} />
                      <span><strong>{paper.title}</strong><small>{paper.authors} · {paper.year}</small><small>{paper.tags.join(" · ") || "无标签"}</small></span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                  {filteredPapers.length === 0 && <div className="panel-empty"><Library size={20} /><strong>没有匹配条目</strong><p>调整搜索或清除筛选后重试。</p></div>}
                </div>
              </div>
            )}

            {rightPanel.kind === "notes" && (
              <div className="right-panel-content">
                <div className="right-panel-toolbar"><span>{notes.length} 条笔记</span><button className="v2-primary-button" type="button" onClick={createBlankNote}><Plus size={14} />新建</button></div>
                <div className="right-note-list">
                  {notes.map((note) => (
                    <article className="right-note-card" key={note.id}>
                      <header><NotebookPen size={15} /><strong>{note.title}</strong></header>
                      <p>{notePreview(note)}</p>
                      <small>{note.source} · p. {note.page}</small>
                      <footer><button type="button" onClick={() => openNoteSource(note)}><BookOpen size={13} />打开来源</button><button type="button" onClick={() => openNote(note)}><PenLine size={13} />编辑</button><button type="button" onClick={() => deleteNote(note.id)}><X size={13} />删除</button></footer>
                    </article>
                  ))}
                  {notes.length === 0 && <div className="panel-empty"><NotebookPen size={20} /><strong>还没有阅读笔记</strong><p>从阅读器批注或 AI 证据卡片保存一条笔记。</p></div>}
                </div>
              </div>
            )}

            {rightPanel.kind === "paper" && (
              <div className="right-panel-content">
                <section className="metadata-card"><div className="metadata-title"><span className="v2-paper-dot" data-tone={activePaper.tone} /><strong>{activePaper.title}</strong></div><p>{activePaper.authors} · {activePaper.year}</p><dl><div><dt>类型</dt><dd>{activePaper.itemType ?? "journalArticle"}</dd></div><div><dt>期刊</dt><dd>{activePaper.journal}</dd></div><div><dt>DOI</dt><dd>{activePaper.DOI ?? "未填写"}</dd></div><div><dt>附件</dt><dd>{activePaper.attachments?.length ?? (activePaper.attachmentId ? 1 : 0)} 个</dd></div></dl>{activePaper.abstractNote && <p className="metadata-abstract">{activePaper.abstractNote}</p>}</section>
                <div className="right-panel-toolbar"><button className="v2-primary-button" type="button" disabled={!activePaper.attachmentId || Boolean(activePaper.deletedAt)} onClick={() => openPaper(activePaper)}><BookOpen size={14} />打开附件</button><button className="v2-secondary-button" type="button" onClick={() => { const citation = `${activePaper.authors} (${activePaper.year}). ${activePaper.title}. ${activePaper.journal}.`; if (navigator.clipboard) navigator.clipboard.writeText(citation).then(() => showFeedback("引用已复制")); else showFeedback("当前环境不支持复制"); }}><Quote size={14} />复制引用</button></div>
                <section className="item-pane-section"><h3>所属集合</h3>{collections.map((collection) => <label key={collection.id}><input type="checkbox" checked={activePaper.collectionIds.includes(collection.id)} disabled={Boolean(activePaper.deletedAt)} onChange={() => togglePaperCollection(activePaper.id, collection.id)} /><Folder size={14} /><span>{collection.name}</span></label>)}</section>
                <section className="item-pane-section"><h3>标签</h3><div className="tag-cloud">{libraryTags.map((tag) => <button type="button" key={tag.name} aria-pressed={activePaper.tags.includes(tag.name)} disabled={Boolean(activePaper.deletedAt)} onClick={() => togglePaperTag(tag.name)}><span style={{ "--tag-color": tag.color } as CSSProperties} />{tag.name}</button>)}</div></section>
                <div className="right-note-list"><h3>本条目笔记</h3>{notes.filter((note) => note.paperId === activePaper.id || note.source === activePaper.title).map((note) => <button className="right-panel-item" type="button" key={note.id} onClick={() => openNote(note)}>{note.title}<ChevronRight size={14} /></button>)}</div>
                <div className="item-pane-danger">{activePaper.deletedAt ? <button type="button" onClick={() => restorePaperFromTrash(activePaper.id)}><RotateCcw size={14} />恢复条目</button> : <button type="button" onClick={() => movePaperToTrash(activePaper.id)}><Trash2 size={14} />移到回收站</button>}</div>
              </div>
            )}

            {rightPanel.kind === "verify" && (
              <div className="right-panel-content"><div className="right-panel-toolbar"><span>{pendingCount} 条待处理</span></div>{verificationItems.map((item) => <article className="right-note-card" key={item.id}><small>{item.citation} · {item.status}</small><strong>{item.claim}</strong><p>{item.issue}</p><footer><button type="button" onClick={() => setVerificationStatus(item.id, "rejected")}><XCircle size={13} />不支持</button><button type="button" onClick={() => setVerificationStatus(item.id, "verified")}><Check size={13} />确认支持</button></footer></article>)}</div>
            )}
          </aside>
        </>
      )}

      <aside className="ai-drawer" data-open={assistantOpen} aria-hidden={!assistantOpen} aria-label="AI 笔记本">
        <header className="ai-drawer-header">
          <div><span><Bot size={17} /></span><div><strong>AI 笔记本</strong><small>基于已选来源回答</small></div></div>
          <div className="notebook-header-actions">
            <button type="button" title="模型设置" aria-label="模型设置" aria-pressed={aiSettingsOpen} onClick={() => setAiSettingsOpen((value) => !value)}><Settings2 size={16} /></button>
            <button type="button" title="新建对话" aria-label="新建对话" onClick={() => { setAiMessages([]); setQuestion(""); }}><Plus size={16} /></button>
            <IconButton label="关闭 AI 笔记本" onClick={() => setAssistantOpen(false)}><X size={17} /></IconButton>
          </div>
        </header>
        <div className="notebook-body" data-settings={aiSettingsOpen}>
          {aiSettingsOpen && <section className="notebook-provider-settings">
            <header><div><strong>模型设置</strong><small>选择一个兼容接口</small></div><button type="button" aria-label="返回对话" onClick={() => setAiSettingsOpen(false)}><X size={16} /></button></header>
            <label>提供商
              <select value={aiProviderConfig.provider} onChange={(event) => selectAiProvider(event.target.value as AiProviderConfig["provider"])}>
                {aiProviderPresets.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.label}</option>)}
              </select>
            </label>
            <label>接口地址
              <input value={aiProviderConfig.baseUrl} onChange={(event) => updateAiProviderConfig({ ...aiProviderConfig, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" />
            </label>
            <label>模型 ID
              <input value={aiProviderConfig.model} onChange={(event) => updateAiProviderConfig({ ...aiProviderConfig, model: event.target.value })} placeholder="model-name" />
            </label>
            <label>API Key
              <input type="password" autoComplete="off" spellCheck={false} value={aiApiKey} onChange={(event) => setAiApiKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveAiApiKey(); } }} placeholder="粘贴个人 API Key" />
            </label>
            <button className="v2-primary-button notebook-save-key" type="button" disabled={!aiApiKey.trim() || aiKeySaving} onClick={saveAiApiKey}>{aiKeySaving ? <><span className="v2-spinner" />正在保存</> : "保存到本次运行"}</button>
            <div className="notebook-provider-status" data-ready={aiProviderStatus?.configured || undefined}>
              <span />
              <div><strong>{aiProviderStatus?.storage === "memory" ? "本次运行已保存" : aiProviderStatus?.storage === "environment" ? "已从环境变量读取" : aiProviderConfig.provider === "ollama" ? "本地模型无需密钥" : "尚未配置密钥"}</strong><small>{aiProviderStatus?.keyName || "AI_API_KEY"} · {aiProviderStatus?.storage === "memory" ? "关闭本地服务后清除" : "密钥不会写入网页存储"}</small></div>
            </div>
            {aiError && <p className="notebook-provider-error">{aiError}</p>}
            <button className="v2-secondary-button" type="button" onClick={() => refreshAiProviderStatus()}>重新检查</button>
            <p className="notebook-provider-help">密钥仅进入本机服务内存，不写入浏览器存储。需要长期保留时，也可以使用 <code>.env.local</code> 或桌面版系统钥匙串。</p>
          </section>}
          <div className="notebook-mode-switch" role="tablist" aria-label="AI 笔记本模式">
            <button type="button" role="tab" aria-selected={aiWorkspaceView === "chat"} onClick={() => setAiWorkspaceView("chat")}><MessageSquareQuote size={15} />对话</button>
            <button type="button" role="tab" aria-selected={aiWorkspaceView === "studio"} onClick={() => setAiWorkspaceView("studio")}><Sparkles size={15} />生成</button>
          </div>

          <section className="notebook-source-scope" data-open={aiSourcesOpen}>
            <button className="notebook-source-summary" type="button" aria-expanded={aiSourcesOpen} onClick={() => setAiSourcesOpen((value) => !value)}>
              <span className="notebook-source-stack" aria-hidden="true">{livePapers.filter((paper) => aiSourceIds.includes(paper.id)).slice(0, 3).map((paper) => <i key={paper.id} data-tone={paper.tone} />)}</span>
              <span><strong>{aiSourceIds.length} 个回答来源</strong><small>{aiSourceIds.includes(activePaper.id) ? "包含当前论文" : "从文库中选择"}</small></span>
              <ChevronDown size={16} />
            </button>
            {aiSourcesOpen && <div className="notebook-source-picker">
              <div><strong>选择回答范围</strong><small>回答只引用勾选的文献</small></div>
              {livePapers.slice(0, 8).map((paper) => <label key={paper.id}>
                <input type="checkbox" checked={aiSourceIds.includes(paper.id)} onChange={() => toggleAiSource(paper.id)} />
                <span className="v2-paper-dot" data-tone={paper.tone} />
                <span><strong>{paper.title}</strong><small>{paper.authors} · {paper.year}{parsedDocuments[paper.id] ? " · MinerU" : ""}</small></span>
              </label>)}
            </div>}
          </section>

          {aiWorkspaceView === "chat" ? <div className="notebook-chat" aria-live="polite">
            {aiMessages.length === 0 && <section className="notebook-empty-state">
              <span><BookOpenText size={21} /></span>
              <h2>开始阅读</h2>
              <div className="notebook-starter-prompts">
                {["概括这篇论文的核心贡献", "作者采用了什么研究方法？", "整理关键概念与术语", "生成一份分章节阅读提纲"].map((prompt) => <button key={prompt} type="button" onClick={() => runNotebookQuestion(prompt)}>{prompt}<ChevronRight size={14} /></button>)}
              </div>
            </section>}
            {aiMessages.map((message) => <article className="notebook-message" data-role={message.role} key={message.id}>
              <header>{message.role === "assistant" ? <><Bot size={14} /><span>AI 笔记本</span></> : <span>你</span>}</header>
              {message.role === "assistant" ? <MarkdownMessage content={message.text} onCitationClick={(sourceIndex, citationPage, blockId) => {
                const candidates = message.citations ?? [];
                const citation = candidates.find((item) => item.sourceIndex === sourceIndex && (!citationPage || item.page === citationPage) && (!blockId || item.blockId === blockId))
                  ?? candidates.find((item) => item.sourceIndex === sourceIndex);
                if (citation) openAiCitation(citation);
              }} /> : <div className="notebook-plain-message">{message.text}</div>}
              {message.citations?.length ? <footer>
                <div className="notebook-citations">{message.citations.map((citation) => <button type="button" key={`${message.id}-${citation.paperId}-${citation.page}-${citation.blockId ?? "source"}`} title={`${citation.title} · p. ${citation.page}${citation.blockId ? ` · ${citation.blockId}` : ""}`} onClick={() => openAiCitation(citation)}><Quote size={12} />[{citation.sourceIndex}] p. {citation.page}{citation.blockId ? " · 原文" : ""}</button>)}</div>
                <button type="button" onClick={() => addEvidenceNote(message.text)}><NotebookPen size={13} />保存为笔记</button>
              </footer> : null}
            </article>)}
            {thinking && <div className="notebook-thinking"><span className="v2-spinner" />正在整理已选来源…</div>}
            {aiError && !aiSettingsOpen && <button className="notebook-chat-error" type="button" onClick={() => setAiSettingsOpen(true)}><span><XCircle size={15} /></span><span><strong>AI 暂时不可用</strong><small>{aiError}</small></span><Settings2 size={15} /></button>}
          </div> : <div className="notebook-studio">
            <header><span><Sparkles size={18} /></span><div><h2>笔记</h2></div></header>
            <div className="notebook-studio-grid">
              {[{ label: "论文摘要", prompt: "用结构化方式总结已选文献的研究问题、方法、发现与限制", icon: FileText }, { label: "阅读提纲", prompt: "为已选文献生成一份分章节阅读提纲", icon: ListTree }, { label: "学习卡片", prompt: "把已选文献中的关键概念整理成学习卡片", icon: GalleryVerticalEnd }, { label: "研究问题", prompt: "基于已选文献提出值得继续研究的问题", icon: CircleHelp }].map((action) => { const ActionIcon = action.icon; return <button type="button" key={action.label} onClick={() => { setAiWorkspaceView("chat"); runNotebookQuestion(action.prompt); }}><ActionIcon size={19} /><span><strong>{action.label}</strong><small>生成到当前对话</small></span><ChevronRight size={15} /></button>; })}
            </div>
          </div>}
        </div>
        {!aiSettingsOpen && <form className="ai-question-box" onSubmit={submitQuestion} data-loading={thinking}>
          <label htmlFor="ai-question">询问已选来源</label>
          <textarea id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="询问这些来源…" />
          <div><span aria-live="polite">{thinking ? "正在整理来源…" : aiProviderStatus?.configured ? `${activeAiProviderPreset.label} · ${aiProviderConfig.model}` : "配置模型后可用"}</span><button type="submit" aria-label="发送问题" disabled={!question.trim() || thinking}>{thinking ? <span className="v2-spinner" /> : <Send size={15} />}</button></div>
        </form>}
      </aside>

      <dialog className="v2-dialog command-palette" ref={commandDialog} onClick={(event) => { if (event.target === commandDialog.current) commandDialog.current?.close(); }}>
        <header><Command size={18} /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} aria-label="搜索命令" placeholder="搜索页面或运行操作" /><button type="button" aria-label="关闭" onClick={() => commandDialog.current?.close()}><X size={17} /></button></header>
        <section>{commandItems.map((item) => { const CommandIcon = item.icon; return <button key={item.label} type="button" onClick={() => closeCommandAndRun(item.run)}><CommandIcon size={16} /><span>{item.label}</span><kbd>{item.hint}</kbd></button>; })}</section>
      </dialog>

      <dialog className="v2-dialog add-paper-dialog" ref={addDialog} onClick={(event) => { if (event.target === addDialog.current) addDialog.current?.close(); }}>
        <form onSubmit={addLocalPaper}>
          <header><div><strong>导入文献</strong><small>PDF 会保存到本地文库并立即打开</small></div><button type="button" aria-label="关闭" onClick={() => addDialog.current?.close()}><X size={17} /></button></header>
          <label className="pdf-import-picker" htmlFor="paper-file" data-selected={Boolean(pendingImportFile)}>
            <Upload size={20} />
            <span><strong>{pendingImportFile ? pendingImportFile.name : "选择本地 PDF"}</strong><small>{pendingImportFile ? `${Math.max(1, Math.round(pendingImportFile.size / 1024))} KB · 将保存在当前浏览器` : "支持 PDF；不会上传到服务器"}</small></span>
            <b>{pendingImportFile ? "重新选择" : "浏览文件"}</b>
            <input id="paper-file" type="file" accept="application/pdf,.pdf" onChange={selectImportFile} />
          </label>
          <label htmlFor="paper-title">论文题名</label>
          <input id="paper-title" value={newPaperTitle} onChange={(event) => setNewPaperTitle(event.target.value)} placeholder="默认使用 PDF 文件名" />
          <p>没有选择 PDF 时仍可只创建一个文献条目；BibTeX、RIS 和 DOI 抓取将在桌面运行时接入。</p>
          <footer><button type="button" className="v2-secondary-button" onClick={() => { setPendingImportFile(null); addDialog.current?.close(); }}>取消</button><button type="submit" className="v2-primary-button" disabled={!newPaperTitle.trim() && !pendingImportFile}>{pendingImportFile ? "导入并打开" : "创建条目"}</button></footer>
        </form>
      </dialog>

      <dialog className="v2-dialog add-paper-dialog" ref={collectionDialog} onClick={(event) => { if (event.target === collectionDialog.current) collectionDialog.current?.close(); }}>
        <form onSubmit={addCollection}>
          <header><div><strong>新建集合</strong><small>{activeCollectionId ? "创建为当前集合的子集合" : "在当前文库中整理条目"}</small></div><button type="button" aria-label="关闭" onClick={() => collectionDialog.current?.close()}><X size={17} /></button></header>
          <label htmlFor="collection-name">集合名称</label>
          <input id="collection-name" autoFocus value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} placeholder="例如：评测方法" />
          <p>集合只负责组织条目；同一条目可以同时属于多个集合。</p>
          <footer><button type="button" className="v2-secondary-button" onClick={() => collectionDialog.current?.close()}>取消</button><button type="submit" className="v2-primary-button" disabled={!newCollectionName.trim()}>创建集合</button></footer>
        </form>
      </dialog>

      <dialog className="v2-dialog utility-dialog" ref={helpDialog} onClick={(event) => { if (event.target === helpDialog.current) helpDialog.current?.close(); }}>
        <header><div><strong>快速上手</strong><small>文库、阅读和 AI 工具都可直接操作</small></div><button type="button" aria-label="关闭" onClick={() => helpDialog.current?.close()}><X size={17} /></button></header>
        <section className="help-grid">
          <div><kbd>Ctrl K</kbd><span><strong>命令面板</strong><small>搜索页面与运行操作</small></span></div>
          <div><kbd>Ctrl J</kbd><span><strong>AI 笔记本</strong><small>基于已选来源对话与生成</small></span></div>
          <div><kbd>Ctrl Z</kbd><span><strong>撤销批注</strong><small>阅读器中恢复上一步批注更改</small></span></div>
          <div><kbd>Enter</kbd><span><strong>打开附件</strong><small>选中条目后激活附件阅读</small></span></div>
          <div><BookOpen size={17} /><span><strong>打开来源</strong><small>从笔记回到对应论文页</small></span></div>
          <div><Columns2 size={17} /><span><strong>对照笔记</strong><small>PDF 与笔记并排阅读</small></span></div>
        </section>
      </dialog>

      <dialog className="v2-dialog utility-dialog" ref={settingsDialog} onClick={(event) => { if (event.target === settingsDialog.current) settingsDialog.current?.close(); }}>
        <header><div><strong>设置</strong><small>外观、阅读与桌面运行时</small></div><button type="button" aria-label="关闭" onClick={() => settingsDialog.current?.close()}><X size={17} /></button></header>
        <section className="plugin-runtime-status" aria-label="Zotero 插件兼容状态">
          <div><span>插件运行时</span><strong>Web 原型</strong></div>
          <p>当前 Web 预览不安装或登记 XPI。正式桌面版直接使用 Zotero 9.0.6 的 Gecko、AddonManager、bootstrap 生命周期和 Zotero API。</p>
          <footer><span>Web 原型</span><b>XPI 不可用</b><span>桌面版</span><b>Zotero 9.0.* 原生插件</b></footer>
          <button className="v2-secondary-button" type="button" onClick={() => { settingsDialog.current?.close(); navigate("plugins"); }}>打开插件中心</button>
        </section>
        <section className="theme-scheme-control" aria-label="外观模式">
          {(["auto", "light", "dark"] as ThemeScheme[]).map((scheme) => <button type="button" key={scheme} aria-pressed={workspaceTheme.scheme === scheme} onClick={() => setWorkspaceTheme((theme) => ({ ...theme, scheme }))}>{scheme === "auto" ? "自动" : scheme === "light" ? "浅色" : "深色"}</button>)}
        </section>
        <section className="theme-editor">
          <div
            className="theme-canvas"
            ref={themeCanvas}
            style={{ backgroundImage: workspaceGradient }}
            onPointerDown={(event) => updateThemePointFromPointer(event)}
            onPointerMove={(event) => { if (draggingThemePointId) updateThemePointFromPointer(event, draggingThemePointId); }}
            onPointerUp={() => setDraggingThemePointId(null)}
            onPointerCancel={() => setDraggingThemePointId(null)}
          >
            {workspaceTheme.points.map((point) => <button
              className="theme-point"
              type="button"
              key={point.id}
              aria-label={`编辑颜色 ${point.color}`}
              aria-pressed={activeThemePointId === point.id}
              style={{ left: `${point.x}%`, top: `${point.y}%`, background: point.color }}
              onPointerDown={(event) => { event.stopPropagation(); setActiveThemePointId(point.id); setDraggingThemePointId(point.id); event.currentTarget.setPointerCapture(event.pointerId); }}
            />)}
            <div className="theme-editor-tools">
              <button type="button" aria-label="添加颜色" title="添加颜色" disabled={workspaceTheme.points.length >= 5} onClick={(event) => { event.stopPropagation(); addThemePoint(); }}><Plus size={15} /></button>
              <button type="button" aria-label="移除当前颜色" title="移除当前颜色" disabled={workspaceTheme.points.length <= 1} onClick={(event) => { event.stopPropagation(); removeThemePoint(); }}><Minus size={15} /></button>
              <label title="当前颜色"><input type="color" aria-label="当前颜色" value={activeThemePoint?.color ?? "#72e3a6"} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setWorkspaceTheme((theme) => ({ ...theme, points: theme.points.map((point) => point.id === activeThemePointId ? { ...point, color: event.target.value } : point) }))} /></label>
            </div>
          </div>
          <button className="theme-algorithm" type="button" aria-pressed={workspaceTheme.algorithm === "flow"} onClick={() => setWorkspaceTheme((theme) => ({ ...theme, algorithm: theme.algorithm === "free" ? "flow" : "free" }))}><Sparkles size={15} /><span><strong>{workspaceTheme.algorithm === "free" ? "自由渐变" : "流动配色"}</strong><small>{workspaceTheme.algorithm === "free" ? "拖动色点决定光晕位置" : "自动生成连续色彩走向"}</small></span></button>
        </section>
        <section className="theme-presets" aria-label="主题预设">
          {themePresets.map((preset) => <button type="button" key={preset.name} aria-label={preset.name} title={preset.name} style={{ background: `linear-gradient(135deg, ${preset.colors.join(", ")})` }} onClick={() => applyThemePreset(preset.colors)} />)}
        </section>
        <label className="theme-range"><span><Palette size={15} /><strong>色彩强度</strong></span><input type="range" min="18" max="100" value={workspaceTheme.opacity} onChange={(event) => setWorkspaceTheme((theme) => ({ ...theme, opacity: Number(event.target.value) }))} /><output>{workspaceTheme.opacity}%</output></label>
        <label className="theme-range"><span><Sparkles size={15} /><strong>纹理颗粒</strong></span><input type="range" min="0" max="100" value={workspaceTheme.texture} onChange={(event) => setWorkspaceTheme((theme) => ({ ...theme, texture: Number(event.target.value) }))} /><output>{workspaceTheme.texture}%</output></label>
        <label className="setting-toggle"><span><strong>紧凑条目</strong><small>在文库中显示更多论文</small></span><input type="checkbox" checked={compactRows} onChange={(event) => setCompactRows(event.target.checked)} /></label>
      </dialog>

      {toast && <div className="v2-toast" role="status">{toast}</div>}
      <button className="mobile-nav-toggle" type="button" aria-label="打开文库" onClick={() => setSidebarExpanded(true)}><Menu size={18} /></button>
    </main>
  );
}
