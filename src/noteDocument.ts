import type { NoteDocument, NoteDocumentNode, ResearchNote } from "./data";

export const NOTE_SCHEMA_VERSION = 1 as const;

function textNode(text: string): NoteDocumentNode {
  return { type: "text", text };
}

export function plainTextToDocument(value: string): NoteDocument {
  const normalized = value.replace(/\r\n?/g, "\n");
  const paragraphs = normalized.split("\n").map((line) => ({
    type: "paragraph",
    content: line ? [textNode(line)] : undefined,
  }));

  return {
    schemaVersion: NOTE_SCHEMA_VERSION,
    content: { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] },
    markdown: normalized,
  };
}

export function normalizeResearchNote(note: ResearchNote): ResearchNote {
  if (note.document?.schemaVersion === NOTE_SCHEMA_VERSION && note.document.content?.type === "doc") return note;
  return { ...note, document: plainTextToDocument(note.body) };
}

export function createResearchNote(
  input: Omit<ResearchNote, "document"> & { document?: ResearchNote["document"] },
): ResearchNote {
  return normalizeResearchNote(input as ResearchNote);
}

export function notePreview(note: ResearchNote, maxLength = 118): string {
  const value = note.body.replace(/\s+/g, " ").trim();
  return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}…` : value;
}
