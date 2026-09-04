import { basenameOf } from "@/lib/core/path";

/**
 * Client-side defaults for local PDF import (mirrors Host `title_from_stem`).
 */

/** Filename stem (no extension). */
export function stemFromPath(path: string): string {
	const base = basenameOf(path);
	const i = base.lastIndexOf(".");
	if (i <= 0) return base;
	return base.slice(0, i);
}

/** Human title from a filename stem (underscores → spaces). */
export function titleFromStem(stem: string): string {
	const spaced = stem
		.trim()
		.replace(/_/g, " ")
		.split(/\s+/)
		.filter(Boolean)
		.join(" ");
	return spaced || "Untitled";
}

export function titleFromPdfPath(path: string): string {
	return titleFromStem(stemFromPath(path));
}
