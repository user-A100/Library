import type { PdfTextRun } from "@embedpdf/models";

import type { PdfAskNormalizedRect } from "@/lib/pdf/ask/types";
import {
	isCaptionLayoutKind,
	isLayoutBodyTextKind,
} from "@/lib/pdf/layout/labels";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";

/** Semantic role of a caption box (from PDF text, not model label alone). */
export type CaptionRole =
	| "figure_main"
	| "table_main"
	| "algorithm_main"
	| "subpanel"
	| "other";

function runCenterInBbox(
	run: PdfTextRun,
	bbox: PdfAskNormalizedRect,
	pageWidth: number,
	pageHeight: number,
): boolean {
	if (pageWidth <= 0 || pageHeight <= 0) return false;
	const cx = (run.rect.origin.x + run.rect.size.width / 2) / pageWidth;
	const cy = (run.rect.origin.y + run.rect.size.height / 2) / pageHeight;
	return (
		cx >= bbox.x &&
		cx <= bbox.x + bbox.w &&
		cy >= bbox.y &&
		cy <= bbox.y + bbox.h
	);
}

/**
 * Collect PDF text runs whose centers fall inside a normalized caption box.
 */
export function textFromRunsInBbox(
	runs: PdfTextRun[],
	bbox: PdfAskNormalizedRect,
	pageWidth: number,
	pageHeight: number,
): string {
	const parts: string[] = [];
	for (const run of runs) {
		const t = run.text?.replace(/\s+/g, " ").trim();
		if (!t) continue;
		if (!runCenterInBbox(run, bbox, pageWidth, pageHeight)) continue;
		parts.push(t);
	}
	return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Classify caption text: main Figure/Table/Algorithm vs (a)(b) subpanel titles.
 */
export function captionRoleFromText(text: string): CaptionRole {
	const t = text.trim();
	if (!t) return "other";
	// (a) Concentration — panel subtitle, not the whole-figure caption.
	if (/^\(\s*[a-z]\s*\)/i.test(t)) return "subpanel";
	if (/^[a-z]\s*[).:]\s+\S/i.test(t) && t.length < 80) return "subpanel";
	if (/^table\s*\d/i.test(t) || /^tab\.\s*\d/i.test(t)) return "table_main";
	if (/^algorithm\s*\d/i.test(t) || /^alg\.\s*\d/i.test(t))
		return "algorithm_main";
	if (/^fig(?:ure)?\.?\s*\d/i.test(t)) return "figure_main";
	if (/^table\b/i.test(t)) return "table_main";
	if (/^algorithm\b/i.test(t)) return "algorithm_main";
	if (/^fig(?:ure)?\b/i.test(t)) return "figure_main";
	return "other";
}

/**
 * Geometry fallback when text is missing: short narrow boxes under panels
 * are subpanel titles; wide boxes are main captions.
 */
export function captionRoleFromGeometry(
	region: PdfLayoutRegion,
): CaptionRole | null {
	if (!isCaptionLayoutKind(region.kind)) return null;
	// Wide caption bar → likely main figure/table title.
	if (region.bbox.w >= 0.45 && region.bbox.h <= 0.2) {
		return region.kind === "figure_title" ? "figure_main" : "other";
	}
	// Narrow short box → (a)(b) style subpanel label.
	if (region.bbox.w <= 0.4 && region.bbox.h <= 0.1) {
		return "subpanel";
	}
	return null;
}

export function resolveCaptionRole(region: PdfLayoutRegion): CaptionRole {
	if (region.captionRole) return region.captionRole;
	const fromText = region.title ? captionRoleFromText(region.title) : "other";
	if (fromText !== "other") return fromText;
	return captionRoleFromGeometry(region) ?? "other";
}

/**
 * Write extracted text + role onto caption-like regions (figure_title / header)
 * and body text/abstract into `text`.
 * Formula / formula_number: no text parse — merge is geometry-only on model boxes.
 */
export function enrichCaptionRegionsWithText(
	regions: PdfLayoutRegion[],
	pageIndex: number,
	runs: PdfTextRun[],
	pageSize: { width: number; height: number },
): PdfLayoutRegion[] {
	return regions.map((region) => {
		if (region.pageIndex !== pageIndex) return region;

		if (isCaptionLayoutKind(region.kind)) {
			const title = textFromRunsInBbox(
				runs,
				region.bbox,
				pageSize.width,
				pageSize.height,
			);
			const text = title || region.title || "";
			const role = text
				? captionRoleFromText(text)
				: (captionRoleFromGeometry(region) ?? "other");
			// Model often labels "Table N: …" as figure_title — keep kind for
			// geometry but role drives merge (table_main → attach to table).
			// Mirror extract into `text` so bulk translate can pick it up.
			return {
				...region,
				title: text || region.title,
				text: text || region.text,
				captionRole: role,
			};
		}

		if (isLayoutBodyTextKind(region.kind) && region.kind !== "header") {
			// text / abstract — full body extract for debug + bulk translate.
			const body = textFromRunsInBbox(
				runs,
				region.bbox,
				pageSize.width,
				pageSize.height,
			);
			if (!body) return region;
			return { ...region, text: body };
		}

		return region;
	});
}

/**
 * Attach caption strings onto host regions that already have `titleBbox`.
 */
export function attachTitlesFromTextRuns(
	regions: PdfLayoutRegion[],
	pageIndex: number,
	runs: PdfTextRun[],
	pageSize: { width: number; height: number },
): PdfLayoutRegion[] {
	return regions.map((region) => {
		if (region.pageIndex !== pageIndex || !region.titleBbox) return region;
		const title = textFromRunsInBbox(
			runs,
			region.titleBbox,
			pageSize.width,
			pageSize.height,
		);
		if (!title) return region;
		return { ...region, title };
	});
}

/** @deprecated use captionRoleFromText */
export function looksLikeFigureCaption(text: string): boolean {
	const role = captionRoleFromText(text);
	return (
		role === "figure_main" || role === "table_main" || role === "algorithm_main"
	);
}
