export type DocumentBlockType =
  | "title"
  | "text"
  | "list"
  | "equation"
  | "table"
  | "image"
  | "code"
  | "reference"
  | "auxiliary";

export type DocumentBBox = [number, number, number, number];

export type DocumentBlock = {
  id: string;
  paperId: string;
  page: number;
  order: number;
  type: DocumentBlockType;
  sourceType: string;
  content: string;
  contentFormat: "text" | "markdown" | "latex" | "html";
  bbox: DocumentBBox | null;
  headingLevel?: number;
  aiEligible: boolean;
};

export type ParsedDocument = {
  schemaVersion: 1;
  paperId: string;
  parser: {
    name: "mineru";
    version: string;
    backend: string;
    sourceFormat: "content-list" | "content-list-v2" | "middle" | "vlm-model";
    importedAt: string;
  };
  pageCount: number;
  blocks: DocumentBlock[];
};

export type DocumentOutlineItem = {
  title: string;
  page: number;
  blockId: string;
  level: number;
};

export function parsedDocumentOutline(document: ParsedDocument | null | undefined): DocumentOutlineItem[] {
  if (!document) return [];
  return document.blocks
    .filter((block) => block.type === "title" && block.content.trim())
    .map((block) => ({
      title: block.content.replace(/\s+/g, " ").trim(),
      page: block.page,
      blockId: block.id,
      level: Math.max(1, Math.min(6, block.headingLevel ?? 1)),
    }));
}

function blockLabel(block: DocumentBlock) {
  const bbox = block.bbox ? block.bbox.map((value) => value.toFixed(3)).join(",") : "none";
  return `[block:${block.id} | p.${block.page} | bbox:${bbox} | ${block.type}]`;
}

export function parsedDocumentToAiText(document: ParsedDocument, maxLength = 60_000): string {
  const sections: string[] = [];
  let length = 0;
  for (const block of document.blocks) {
    if (!block.aiEligible || !block.content.trim()) continue;
    const section = `${blockLabel(block)}\n${block.content.trim()}`;
    if (length + section.length > maxLength) {
      const remaining = maxLength - length;
      if (remaining > 160) sections.push(section.slice(0, remaining));
      break;
    }
    sections.push(section);
    length += section.length + 2;
  }
  return sections.join("\n\n");
}

export function findDocumentBlock(document: ParsedDocument | null | undefined, blockId?: string, page?: number) {
  if (!document) return undefined;
  if (blockId) {
    const exact = document.blocks.find((block) => block.id === blockId);
    if (exact) return exact;
  }
  if (page) return document.blocks.find((block) => block.page === page && block.aiEligible && block.bbox);
  return document.blocks.find((block) => block.aiEligible && block.bbox);
}
