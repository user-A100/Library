/**
 * PDF page paper tone (white / sepia / green / dark, independent of app theme).
 * Persisted per install and broadcast so every open viewer follows the switch.
 *
 * The storage key and event name predate paper tones, when the preference was a
 * two-state colour scheme; both are kept so existing installs and already-open
 * windows keep working, with legacy "light" read as "white".
 */

import { readJsonStorage, writeJsonStorage } from "@/lib/core/storage";
import { isPdfPaperTone, type PdfPaperTone } from "@/lib/pdf/page-theme";

const PDF_COLOR_SCHEME_STORAGE_KEY = "agentero-pdf-color-scheme";
export const PDF_PAPER_TONE_EVENT = "agentero:pdf-color-scheme";

function getDocumentTone(): PdfPaperTone {
	if (typeof document === "undefined") return "white";
	return document.documentElement.classList.contains("dark") ? "dark" : "white";
}

/** Stored preference, falling back to the app theme on first use. */
export function readPdfPaperTone(): PdfPaperTone {
	const stored = readJsonStorage<string | null>(
		PDF_COLOR_SCHEME_STORAGE_KEY,
		null,
	);
	if (isPdfPaperTone(stored)) return stored;
	if (stored === "light") return "white";
	return getDocumentTone();
}

export function writePdfPaperTone(next: PdfPaperTone): void {
	writeJsonStorage(PDF_COLOR_SCHEME_STORAGE_KEY, next);
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent<PdfPaperTone>(PDF_PAPER_TONE_EVENT, { detail: next }),
		);
	}
}
