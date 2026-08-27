import type { DocumentBBox, DocumentBlock, DocumentBlockType, ParsedDocument } from "./documentModel";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function flattenContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(flattenContent).filter(Boolean).join("");
  const item = record(value);
  if (!item) return "";
  if (typeof item.content === "string") return item.content;
  const preferredKeys = [
    "children", "title_content", "paragraph_content", "math_content", "list_items",
    "code_content", "algorithm_content", "table_body", "table_caption", "table_footnote",
    "image_caption", "image_footnote", "chart_caption", "chart_footnote",
    "page_footnote_content", "page_header_content", "page_footer_content", "page_aside_text_content",
  ];
  return preferredKeys.map((key) => flattenContent(item[key])).filter(Boolean).join("\n");
}

function blockType(sourceType: string, headingLevel = 0): DocumentBlockType {
  const type = sourceType.toLowerCase();
  if (headingLevel > 0 || type.includes("title")) return "title";
  if (type.includes("equation") || type.includes("formula") || type.includes("math")) return "equation";
  if (type.includes("table")) return "table";
  if (type.includes("image") || type.includes("chart") || type === "figure") return "image";
  if (type.includes("code") || type.includes("algorithm")) return "code";
  if (type.includes("ref_text") || type.includes("reference") || type === "index") return "reference";
  if (type.includes("list")) return "list";
  if (["header", "footer", "page_header", "page_footer", "page_number", "aside_text", "page_aside_text", "page_footnote"].some((name) => type.includes(name))) return "auxiliary";
  return "text";
}

function contentFormat(type: DocumentBlockType, value: string): DocumentBlock["contentFormat"] {
  if (type === "equation") return "latex";
  if (type === "table" && /<table[\s>]/i.test(value)) return "html";
  return "text";
}

function normalizeBBox(value: unknown, pageSize?: [number, number]): DocumentBBox | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const raw = value.slice(0, 4).map((item) => numberValue(item, Number.NaN));
  if (raw.some((item) => !Number.isFinite(item))) return null;
  const max = Math.max(...raw.map(Math.abs));
  let xScale = 1;
  let yScale = 1;
  if (max <= 1.001) {
    xScale = 1;
    yScale = 1;
  } else if (pageSize && pageSize[0] > 0 && pageSize[1] > 0) {
    xScale = pageSize[0];
    yScale = pageSize[1];
  } else {
    xScale = 1000;
    yScale = 1000;
  }
  const clamp = (number: number) => Math.max(0, Math.min(1, number));
  return [clamp(raw[0] / xScale), clamp(raw[1] / yScale), clamp(raw[2] / xScale), clamp(raw[3] / yScale)];
}

function legacyContent(item: JsonRecord, type: DocumentBlockType) {
  if (type === "table") return [flattenContent(item.table_caption), flattenContent(item.table_body), flattenContent(item.table_footnote)].filter(Boolean).join("\n") || flattenContent(item.text) || flattenContent(item.content);
  if (type === "code") return flattenContent(item.code_body) || flattenContent(item.algorithm_body) || flattenContent(item.text) || flattenContent(item.content);
  if (type === "image") return [flattenContent(item.image_caption), flattenContent(item.chart_caption), flattenContent(item.text), flattenContent(item.content)].filter(Boolean).join("\n");
  if (type === "list" || type === "reference") {
    const list = Array.isArray(item.list_items) ? item.list_items.map(flattenContent).filter(Boolean).join("\n") : flattenContent(item.list_items);
    return list || flattenContent(item.text) || flattenContent(item.content);
  }
  return flattenContent(item.text) || flattenContent(item.content);
}

function createBlock(input: {
  item: JsonRecord;
  paperId: string;
  page: number;
  order: number;
  pageSize?: [number, number];
  v2?: boolean;
}): DocumentBlock {
  const sourceType = String(input.item.type ?? input.item.label ?? "text");
  const contentObject = input.v2 ? record(input.item.content) : null;
  const headingLevel = numberValue(input.item.text_level, numberValue(contentObject?.level, 0));
  const type = blockType(sourceType, headingLevel);
  const content = input.v2 ? flattenContent(input.item.content) : legacyContent(input.item, type);
  return {
    id: `mu-p${input.page}-b${input.order}`,
    paperId: input.paperId,
    page: input.page,
    order: input.order,
    type,
    sourceType,
    content: content.replace(/\u0000/g, "").trim(),
    contentFormat: contentFormat(type, content),
    bbox: normalizeBBox(input.item.bbox, input.pageSize),
    headingLevel: type === "title" ? Math.max(1, headingLevel || 1) : undefined,
    aiEligible: type !== "auxiliary" && (Boolean(content.trim()) || type === "image"),
  };
}

function finalize(paperId: string, blocks: DocumentBlock[], source: Partial<ParsedDocument["parser"]>): ParsedDocument {
  if (!blocks.length) throw new Error("没有识别到 MinerU 内容块；请选择 content_list.json、content_list_v2.json 或 middle.json");
  return {
    schemaVersion: 1,
    paperId,
    parser: {
      name: "mineru",
      version: source.version || "unknown",
      backend: source.backend || "unknown",
      sourceFormat: source.sourceFormat || "content-list",
      importedAt: new Date().toISOString(),
    },
    pageCount: Math.max(...blocks.map((block) => block.page), 1),
    blocks,
  };
}

function adaptFlatContentList(items: unknown[], paperId: string, metadata: JsonRecord | null): ParsedDocument {
  const blocks = items.flatMap((value, index) => {
    const item = record(value);
    if (!item) return [];
    const page = Math.max(1, numberValue(item.page_idx, 0) + 1);
    return [createBlock({ item, paperId, page, order: index + 1 })];
  });
  return finalize(paperId, blocks, {
    version: String(metadata?._version_name ?? "unknown"),
    backend: String(metadata?._backend ?? "unknown"),
    sourceFormat: "content-list",
  });
}

function adaptPagedContent(items: unknown[][], paperId: string, metadata: JsonRecord | null): ParsedDocument {
  let order = 0;
  const isV2 = items.some((page) => page.some((value) => Boolean(record(value)?.content && typeof record(value)?.content === "object")));
  const blocks = items.flatMap((pageItems, pageIndex) => pageItems.flatMap((value) => {
    const item = record(value);
    if (!item) return [];
    order += 1;
    return [createBlock({ item, paperId, page: pageIndex + 1, order, v2: isV2 })];
  }));
  return finalize(paperId, blocks, {
    version: String(metadata?._version_name ?? "unknown"),
    backend: String(metadata?._backend ?? (isV2 ? "unknown" : "vlm")),
    sourceFormat: isV2 ? "content-list-v2" : "vlm-model",
  });
}

function nestedBlocks(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const block = record(item);
    if (!block) return [];
    const children = nestedBlocks(block.blocks);
    return children.length ? children : [block];
  });
}

function middleBlockContent(item: JsonRecord) {
  const lines = Array.isArray(item.lines) ? item.lines : [];
  const fromLines = lines.map((line) => {
    const lineItem = record(line);
    return flattenContent(lineItem?.spans);
  }).filter(Boolean).join("\n");
  return fromLines || legacyContent(item, blockType(String(item.type ?? "text")));
}

function adaptMiddle(root: JsonRecord, paperId: string): ParsedDocument {
  const pages = Array.isArray(root.pdf_info) ? root.pdf_info : [];
  let order = 0;
  const blocks = pages.flatMap((pageValue, pageIndex) => {
    const page = record(pageValue);
    if (!page) return [];
    const pageSizeValue = Array.isArray(page.page_size) ? page.page_size : [];
    const pageSize: [number, number] | undefined = pageSizeValue.length >= 2
      ? [numberValue(pageSizeValue[0]), numberValue(pageSizeValue[1])]
      : undefined;
    const candidates = nestedBlocks(page.para_blocks ?? page.preproc_blocks);
    return candidates.map((item) => {
      order += 1;
      const enriched = { ...item, text: middleBlockContent(item) };
      return createBlock({ item: enriched, paperId, page: numberValue(page.page_idx, pageIndex) + 1, order, pageSize });
    });
  });
  return finalize(paperId, blocks, {
    version: String(root._version_name ?? "unknown"),
    backend: String(root._backend ?? "unknown"),
    sourceFormat: "middle",
  });
}

export function adaptMineruOutput(raw: unknown, paperId: string): ParsedDocument {
  if (!paperId) throw new Error("缺少文献标识，无法关联 MinerU 解析结果");
  const root = record(raw);
  if (root && Array.isArray(root.pdf_info)) return adaptMiddle(root, paperId);

  const wrapped = root && (root.content_list_v2 ?? root.content_list ?? root.data ?? root.result);
  const source = Array.isArray(wrapped) ? wrapped : raw;
  if (!Array.isArray(source)) throw new Error("无法识别 MinerU JSON 顶层结构");
  if (source.every(Array.isArray)) return adaptPagedContent(source as unknown[][], paperId, root);
  return adaptFlatContentList(source, paperId, root);
}
