import type { PlazaListing, PlazaRecommendationCard } from "./types";

const CARD_CAP = 8;

type RawRecommendation = { index?: unknown; reason?: unknown };

function extractPayloads(answer: string): string[] {
	const payloads: string[] = [];
	const fence = /```(?:json)?\s*([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	while ((match = fence.exec(answer))) payloads.push(match[1].trim());
	const start = answer.indexOf("{");
	const end = answer.lastIndexOf("}");
	if (!payloads.length && start >= 0 && end > start) {
		payloads.push(answer.slice(start, end + 1));
	}
	return payloads;
}

function parseEntries(payload: string): RawRecommendation[] | null {
	try {
		const data: unknown = JSON.parse(payload);
		if (Array.isArray(data)) return data as RawRecommendation[];
		if (
			typeof data === "object" &&
			data !== null &&
			Array.isArray((data as { recommendations?: unknown }).recommendations)
		) {
			return (data as { recommendations: RawRecommendation[] }).recommendations;
		}
	} catch {
		// try next payload
	}
	return null;
}

/**
 * Extract the agent's fenced JSON recommendation block and join it with the
 * listing snapshot. Invalid / duplicate / out-of-range entries are dropped
 * rather than failing the whole parse; `parsedOk: false` degrades the UI to
 * the raw answer.
 */
export function parseRecommendations(
	answer: string,
	listings: PlazaListing[],
): { cards: PlazaRecommendationCard[]; parsedOk: boolean } {
	for (const payload of extractPayloads(answer)) {
		const entries = parseEntries(payload);
		if (!entries) continue;
		const seen = new Set<number>();
		const cards: PlazaRecommendationCard[] = [];
		for (const entry of entries) {
			const index = entry.index;
			const reason =
				typeof entry.reason === "string" ? entry.reason.trim() : "";
			if (typeof index !== "number" || !Number.isInteger(index)) continue;
			if (index < 1 || index > listings.length) continue;
			if (seen.has(index) || !reason) continue;
			seen.add(index);
			cards.push({ listing: listings[index - 1], reason });
			if (cards.length >= CARD_CAP) break;
		}
		return { cards, parsedOk: true };
	}
	return { cards: [], parsedOk: false };
}
