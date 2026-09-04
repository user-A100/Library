/**
 * Normalize Agent `## Sources` path strings for display / open.
 * Host extract_sources should already extract jump targets; this is defense
 * for older transcripts and residual wrappers.
 */

function looksLikeSourcePath(s: string): boolean {
	const t = s.trim();
	if (!t) return false;
	if (t.startsWith("（") || t.startsWith("(")) return false;
	const lower = t.toLowerCase();
	if (
		lower.endsWith(".md") ||
		lower.endsWith(".tex") ||
		lower.endsWith(".pdf") ||
		lower.endsWith(".png") ||
		lower.endsWith(".jpg") ||
		lower.endsWith(".jpeg") ||
		lower.endsWith(".webp") ||
		lower.endsWith(".gif") ||
		lower.endsWith(".svg") ||
		lower.endsWith(".json") ||
		lower.endsWith(".bib") ||
		lower.endsWith(".csv")
	) {
		return t.includes("/") || !/\s/.test(t);
	}
	return t.includes("/") && !t.includes("（") && !t.includes("(");
}

/**
 * Extract the vault-relative jump target from a Sources bullet / stored string.
 *
 * Handles agent styles like:
 * - `` `papers/foo/PAPER.md`（§2.3，Figure 4）``
 * - `用户批注截图：`assets/image-….png``
 * - `- 'papers/a/NOTES.md'`
 */
export function normalizeAgentSourcePath(source: string): string {
	const trimmed = source
		.trim()
		.replace(/^[-*•]\s*/, "")
		.trim();
	if (!trimmed) return "";

	// 1) First backtick-wrapped path segment.
	let rest = trimmed;
	while (true) {
		const start = rest.indexOf("`");
		if (start < 0) break;
		const after = rest.slice(start + 1);
		const end = after.indexOf("`");
		if (end < 0) break;
		const inner = after.slice(0, end).trim();
		if (looksLikeSourcePath(inner)) return inner;
		rest = after.slice(end + 1);
	}

	// 2) Wikilink [[path|alias]].
	const wikiOpen = trimmed.indexOf("[[");
	if (wikiOpen >= 0) {
		const wikiClose = trimmed.indexOf("]]", wikiOpen + 2);
		if (wikiClose > wikiOpen) {
			const inner = trimmed.slice(wikiOpen + 2, wikiClose);
			const path = (inner.split("|")[0] ?? inner).trim();
			if (looksLikeSourcePath(path)) return path;
		}
	}

	// 3) Whole-line paired quotes.
	let cleaned = trimmed;
	if (cleaned.length >= 2) {
		const first = cleaned[0];
		const last = cleaned[cleaned.length - 1];
		if (
			(first === "'" && last === "'") ||
			(first === '"' && last === '"') ||
			(first === "`" && last === "`")
		) {
			cleaned = cleaned.slice(1, -1).trim();
		}
	}
	cleaned = cleaned.replace(/^['"`]+|['"`]+$/g, "").trim();

	// 4) Path before parenthetical note.
	const parenIdx = (() => {
		const cjk = cleaned.indexOf("（");
		const ascii = cleaned.indexOf(" (");
		if (cjk < 0) return ascii;
		if (ascii < 0) return cjk;
		return Math.min(cjk, ascii);
	})();
	if (parenIdx > 0) {
		const head = cleaned
			.slice(0, parenIdx)
			.replace(/^['"`]+|['"`]+$/g, "")
			.trim();
		if (looksLikeSourcePath(head)) return head;
	}

	// 5) Label：path  / Label: path
	for (const sep of ["：", ":"] as const) {
		const idx = cleaned.indexOf(sep);
		if (idx < 0) continue;
		const tail = cleaned
			.slice(idx + sep.length)
			.replace(/^['"`]+|['"`]+$/g, "")
			.trim();
		if (looksLikeSourcePath(tail)) return tail;
	}

	if (looksLikeSourcePath(cleaned)) return cleaned;
	// Last resort: return cleaned so open still has something to try.
	return cleaned;
}
