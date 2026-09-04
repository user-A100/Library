/**
 * Prompts for the Agent translation provider.
 * Generic surface + PDF selection variant.
 */

/** True when `text` is a numbered batch payload (`[[1]] …`, `[[2]] …`). */
function hasNumberedMarkers(text: string): boolean {
	return /\[{2}\s*\d+\s*\]{2}/.test(text);
}

export function buildTranslatePrompt(opts: {
	text: string;
	targetLangName: string;
	page?: number;
	surface?: string;
}): string {
	const text = opts.text.trim();
	const lang = opts.targetLangName;
	const parts = [
		"You are a professional academic translator working inside Agentero, a research paper workbench.",
		`Translate the text below into ${lang}.`,
		[
			"Rules:",
			`- The source is prose from a research paper, often extracted from a PDF text layer. Translate the meaning, not the word order: write natural, fluent ${lang} the way a researcher in the field would. Re-order clauses and split long sentences when that reads better.`,
			"- Keep mathematics, symbols, variable names, units, inline code, URLs and citation markers ([12], (Smith et al., 2020)) exactly as they appear, including any ⟦n⟧ placeholders.",
			"- Keep figure / table / section / equation numbers unchanged.",
			`- Use the established ${lang} term for each concept and stay consistent; on a term's first occurrence, follow it with the original in parentheses, e.g. 注意力机制（attention）.`,
			"- Do not add, drop, summarize or explain anything. No translator notes, no extra headings, no markdown fences.",
			"- Output only the translation.",
		].join("\n"),
	];
	if (opts.surface === "pdf-selection" && opts.page != null) {
		parts.push(`Source: research paper PDF, page ${opts.page}.`);
	}
	if (hasNumberedMarkers(text)) {
		parts.push(
			"The text contains several paragraphs, each prefixed with a [[n]] marker. " +
				"Translate every paragraph and keep the same [[n]] markers, in the same " +
				"order, with the same number of paragraphs. Do not merge paragraphs.",
		);
	}
	parts.push("Text:", text);
	return parts.join("\n\n");
}
