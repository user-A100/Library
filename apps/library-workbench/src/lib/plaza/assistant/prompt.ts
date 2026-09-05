import { PLAZA_LISTING_CAP } from "./listings";
import type { PlazaListing } from "./types";

/**
 * Prompt for a plaza assistant run. The agent must pick from the PROVIDED
 * list only — no web browsing, no invented items — and answer with a fenced
 * JSON block the app parses into cards, followed by a short explanation.
 * Reply language is forced by `runOnce`'s responseLanguage envelope.
 */
export function buildPlazaAssistantPrompt(opts: {
	sourceLabel: string;
	question: string;
	listings: PlazaListing[];
}): string {
	const capped = opts.listings.slice(0, PLAZA_LISTING_CAP);
	const items = capped.map((l, i) => ({
		index: i + 1,
		id: l.id,
		title: l.title,
		summary: l.summary ?? "",
	}));
	const includedNote =
		capped.length < opts.listings.length
			? `\n(${capped.length} of ${opts.listings.length} visible items included)`
			: "";
	return [
		`You are a research assistant inside the "${opts.sourceLabel}" panel of Library.`,
		"The user is browsing a listing of items. Recommend the items that best match the user's request, USING ONLY the provided list. Do not browse the web, do not invent items, do not suggest anything not in the list.",
		"",
		"User request:",
		opts.question,
		"",
		"Available items (index | title | summary):",
		"```json",
		JSON.stringify(items, null, 2),
		"```",
		"",
		"Respond in EXACTLY this format:",
		"1. First, a single fenced ```json block:",
		'{"recommendations":[{"index":1,"reason":"one or two sentences: why this matches the request"}]}',
		"Order by relevance, best first. Include 1-8 items; use an empty array if nothing matches.",
		"2. Then a short markdown explanation (2-5 sentences).",
		"The `index` values MUST come from the list above. Never output URLs of your own.",
		includedNote,
	]
		.filter((line) => line !== undefined)
		.join("\n");
}
