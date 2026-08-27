export type ZoteroCreator = {
  firstName?: string;
  lastName?: string;
  name?: string;
  creatorType: "author" | "editor" | "contributor";
};

export type ZoteroAttachment = {
  id: string;
  title: string;
  mimeType: string;
  linkMode: "imported_file" | "linked_file" | "web_link";
  path?: string;
};

export type Paper = {
  id: string;
  title: string;
  authors: string;
  year: string;
  meta: string;
  tone: "violet" | "amber" | "cyan";
  journal: string;
  tags: string[];
  attachment: string;
  attachmentId: string | null;
  collectionIds: string[];
  noteCount: number;
  citationState: "verified" | "pending";
  zoteroKey?: string;
  itemType?: "journalArticle" | "book" | "webpage" | "report" | "note";
  creators?: ZoteroCreator[];
  DOI?: string;
  url?: string;
  abstractNote?: string;
  attachments?: ZoteroAttachment[];
  dateAdded?: string;
  dateModified?: string;
  deletedAt?: string | null;
  pdfPath?: string;
  pageCount?: number;
  language?: string;
};

export type ResearchNote = {
  id: string;
  title: string;
  body: string;
  source: string;
  page: number;
  createdAt: string;
  paperId?: string;
  annotationId?: string;
  tags?: string[];
  document?: NoteDocument;
};

export type NoteDocumentNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: NoteDocumentNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

export type NoteDocument = {
  schemaVersion: 1;
  content: NoteDocumentNode;
  markdown: string;
};

export type AnnotationType = "highlight" | "underline" | "note" | "area" | "ink";

export type PaperAnnotation = {
  id: string;
  paperId: string;
  attachmentId: string;
  type: AnnotationType;
  text: string;
  comment: string;
  color: string;
  pageLabel: string;
  sortIndex: string;
  position: {
    pageIndex: number;
    rects?: number[][];
    paths?: number[][];
    blockId?: string;
    startOffset?: number;
    endOffset?: number;
  };
  tags: string[];
  authorName: string;
  dateModified: string;
  readOnly?: boolean;
};

export type LibraryCollection = {
  id: string;
  name: string;
  parentId: string | null;
  itemIds: string[];
};

export type LibraryTag = {
  name: string;
  color: string;
  position: number;
};

export type VerificationItem = {
  id: string;
  claim: string;
  citation: string;
  issue: string;
  status: "pending" | "verified" | "rejected";
};

export const initialPapers: Paper[] = [
  {
    id: "ccl-information-retrieval-2024",
    title: "大语言模型时代的信息检索综述",
    authors: "庞亮，邓竞成，顾佳，沈华伟，程学旗",
    year: "2024",
    meta: "22 页 · 中文全文 · CCL 2024",
    tone: "cyan",
    journal: "第二十三届中国计算语言学大会论文集",
    tags: ["大语言模型", "信息检索", "中文文献"],
    attachment: "PDF",
    attachmentId: "attachment-ccl-information-retrieval-2024",
    collectionIds: ["collection-project", "collection-core"],
    noteCount: 0,
    citationState: "verified",
    itemType: "journalArticle",
    url: "https://aclanthology.org/2024.ccl-2.6/",
    abstractNote: "本文综述大语言模型对信息检索领域的影响，讨论其对索引、检索和排序环节的性能提升，以及对传统信息获取模式和内容生态的潜在改变。",
    pdfPath: "/papers/2024-ccl-information-retrieval-llm.pdf",
    pageCount: 22,
    language: "中文",
    dateAdded: "2026-08-23T16:00:00+08:00",
  },
  {
    id: "grounded-reader",
    title: "Evaluating Evidence-Grounded Research Assistants",
    authors: "Demo corpus · Method paper",
    year: "2026",
    meta: "14 pages · 23 annotations",
    tone: "violet",
    journal: "Project working paper",
    tags: ["evidence", "evaluation", "core"],
    attachment: "PDF",
    attachmentId: "attachment-grounded-reader",
    collectionIds: ["collection-project", "collection-core"],
    noteCount: 4,
    citationState: "verified",
    dateAdded: "2026-08-23T09:10:00+08:00",
  },
  {
    id: "rag",
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    authors: "Lewis et al.",
    year: "2020",
    meta: "18 pages · 8 annotations",
    tone: "cyan",
    journal: "NeurIPS",
    tags: ["RAG", "retrieval", "core"],
    attachment: "PDF",
    attachmentId: "attachment-rag",
    collectionIds: ["collection-project", "collection-core"],
    noteCount: 2,
    citationState: "verified",
    dateAdded: "2026-08-22T14:30:00+08:00",
  },
  {
    id: "hallucination",
    title: "A Survey on Hallucination in Large Language Models",
    authors: "Huang et al.",
    year: "2023",
    meta: "32 pages · 11 annotations",
    tone: "amber",
    journal: "ACM Computing Surveys",
    tags: ["hallucination", "survey"],
    attachment: "PDF",
    attachmentId: "attachment-hallucination",
    collectionIds: ["collection-project"],
    noteCount: 3,
    citationState: "pending",
    dateAdded: "2026-08-20T11:20:00+08:00",
  },
  {
    id: "judge",
    title: "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena",
    authors: "Zheng et al.",
    year: "2023",
    meta: "29 pages · 6 annotations",
    tone: "violet",
    journal: "NeurIPS Datasets and Benchmarks",
    tags: ["LLM judge", "evaluation"],
    attachment: "PDF",
    attachmentId: "attachment-judge",
    collectionIds: ["collection-evaluation"],
    noteCount: 1,
    citationState: "pending",
    dateAdded: "2026-08-18T16:45:00+08:00",
  },
  {
    id: "citation",
    title: "ALCE: Enabling Large Language Models to Generate Text with Citations",
    authors: "Gao et al.",
    year: "2023",
    meta: "24 pages · 9 annotations",
    tone: "cyan",
    journal: "EMNLP",
    tags: ["citation", "attribution"],
    attachment: "PDF",
    attachmentId: "attachment-citation",
    collectionIds: ["collection-project", "collection-evaluation"],
    noteCount: 2,
    citationState: "verified",
    dateAdded: "2026-08-17T08:40:00+08:00",
  },
  {
    id: "reader-core",
    title: "Reader Core Integration Notes",
    authors: "Project team",
    year: "2026",
    meta: "12 pages · 5 annotations",
    tone: "amber",
    journal: "Engineering note",
    tags: ["reader", "implementation", "core"],
    attachment: "MD",
    attachmentId: "attachment-reader-core",
    collectionIds: [],
    noteCount: 2,
    citationState: "verified",
    dateAdded: "2026-08-23T12:05:00+08:00",
  },
];

// Legacy prototype compatibility; the active application uses initialPapers.
export const papers = initialPapers;

export const initialNotes: ResearchNote[] = [
  {
    id: "note-1",
    title: "开放式评测不能只看单一参考答案",
    body: "把事实支持、引用完整性、术语、不确定性和用户可纠错性拆成独立维度。",
    source: "Evaluating Evidence-Grounded Research Assistants",
    page: 4,
    createdAt: "今天 09:42",
    paperId: "grounded-reader",
  },
  {
    id: "note-2",
    title: "引用存在不等于引用支持主张",
    body: "需要在主张级别检查原文是否支持回答的范围，尤其要阻止从相关性升级为因果。",
    source: "ALCE: Enabling Large Language Models to Generate Text with Citations",
    page: 7,
    createdAt: "昨天 21:18",
    paperId: "citation",
  },
];

export const initialCollections: LibraryCollection[] = [
  { id: "collection-project", name: "论文助手文库", parentId: null, itemIds: ["ccl-information-retrieval-2024", "grounded-reader", "rag", "hallucination", "citation"] },
  { id: "collection-core", name: "核心方法", parentId: "collection-project", itemIds: ["ccl-information-retrieval-2024", "grounded-reader", "rag"] },
  { id: "collection-evaluation", name: "评测与引用", parentId: null, itemIds: ["judge", "citation"] },
];

export const libraryTags: LibraryTag[] = [
  { name: "中文文献", color: "var(--color-annotation-mint)", position: 0 },
  { name: "大语言模型", color: "var(--color-annotation-blue)", position: 1 },
  { name: "信息检索", color: "var(--color-annotation-amber)", position: 2 },
  { name: "evidence", color: "var(--color-annotation-violet)", position: 3 },
  { name: "evaluation", color: "var(--color-annotation-blue)", position: 4 },
  { name: "core", color: "var(--color-annotation-amber)", position: 5 },
  { name: "citation", color: "var(--color-annotation-mint)", position: 6 },
];

export const initialAnnotations: PaperAnnotation[] = [
  {
    id: "annotation-a3",
    paperId: "grounded-reader",
    attachmentId: "attachment-grounded-reader",
    type: "highlight",
    text: "A useful system preserves a reversible path from every generated claim to the exact source span.",
    comment: "把“可追溯”拆成可定位、可核对、可驳回三个动作。",
    color: "var(--color-annotation-yellow)",
    pageLabel: "6",
    sortIndex: "00006|000120|00000",
    position: {
      pageIndex: 5,
      rects: [[92, 286, 514, 334]],
      blockId: "trace-quote",
      startOffset: 0,
      endOffset: 96,
    },
    tags: ["evidence", "evaluation"],
    authorName: "项目成员",
    dateModified: "刚刚",
  },
  {
    id: "annotation-rag-1",
    paperId: "rag",
    attachmentId: "attachment-rag",
    type: "underline",
    text: "The model combines parametric and non-parametric memory for language generation.",
    comment: "对照证据可追溯性：检索到文档不等于解释已绑定到主张。",
    color: "var(--color-annotation-blue)",
    pageLabel: "3",
    sortIndex: "00003|000064|00000",
    position: { pageIndex: 2, rects: [[84, 240, 501, 268]] },
    tags: ["RAG", "core"],
    authorName: "项目成员",
    dateModified: "昨天",
  },
  {
    id: "annotation-citation-1",
    paperId: "citation",
    attachmentId: "attachment-citation",
    type: "note",
    text: "",
    comment: "检查引用正确性与引用完整性是否被分别报告。",
    color: "var(--color-annotation-violet)",
    pageLabel: "7",
    sortIndex: "00007|000092|00000",
    position: { pageIndex: 6 },
    tags: ["citation", "evaluation"],
    authorName: "项目成员",
    dateModified: "2 天前",
  },
];

export const initialVerificationItems: VerificationItem[] = [
  {
    id: "verify-1",
    claim: "RAG 可以完全消除大模型幻觉。",
    citation: "Lewis et al., 2020 · p. 8",
    issue: "原文只报告知识密集任务上的改进，不支持“完全消除”。",
    status: "pending",
  },
  {
    id: "verify-2",
    claim: "模型评审与人类偏好的相关性足以替代人工评审。",
    citation: "Zheng et al., 2023 · p. 11",
    issue: "需要核对位置偏差与自我增强偏差的限制条件。",
    status: "pending",
  },
  {
    id: "verify-3",
    claim: "主张级引用能显著提升用户纠错能力。",
    citation: "Project working paper · p. 6",
    issue: "证据锚点存在，但“显著提升”仍缺少用户研究数据。",
    status: "pending",
  },
];
