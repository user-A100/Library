import { describe, expect, it } from "vitest";
import { parseRecommendations } from "./parse";
import type { PlazaListing } from "./types";

const listings: PlazaListing[] = [1, 2, 3].map((n) => ({
	sourceId: "s",
	id: `id${n}`,
	title: `T${n}`,
	kind: "paper" as const,
	importPayload: null,
}));

describe("parseRecommendations", () => {
	it("parses the fenced json block into ordered cards", () => {
		const answer =
			'Here you go.\n```json\n{"recommendations":[{"index":2,"reason":"best match"},{"index":1,"reason":"also good"}]}\n```\nExplanation.';
		const { cards, parsedOk } = parseRecommendations(answer, listings);
		expect(parsedOk).toBe(true);
		expect(cards.map((c) => c.listing.id)).toEqual(["id2", "id1"]);
		expect(cards[0]?.reason).toBe("best match");
	});

	it("accepts a bare array payload", () => {
		const { cards, parsedOk } = parseRecommendations(
			'```json\n[{"index":3,"reason":"r"}]\n```',
			listings,
		);
		expect(parsedOk).toBe(true);
		expect(cards).toHaveLength(1);
	});

	it("drops out-of-range, duplicate and reason-less entries instead of failing", () => {
		const { cards, parsedOk } = parseRecommendations(
			'```json\n{"recommendations":[{"index":9,"reason":"x"},{"index":1,"reason":""},{"index":2,"reason":"ok"},{"index":2,"reason":"dup"}]}\n```',
			listings,
		);
		expect(parsedOk).toBe(true);
		expect(cards).toHaveLength(1);
		expect(cards[0]?.listing.id).toBe("id2");
	});

	it("caps at 8 cards", () => {
		const recs = Array.from({ length: 12 }, (_, i) => ({
			index: 1 + (i % 3),
			reason: `r${i}`,
		}));
		const { cards } = parseRecommendations(
			`\`\`\`json\n{"recommendations":${JSON.stringify(recs)}}\n\`\`\``,
			listings,
		);
		expect(cards.length).toBeLessThanOrEqual(8);
	});

	it("falls back to a brace span without fences", () => {
		const { cards, parsedOk } = parseRecommendations(
			'text {"recommendations":[{"index":1,"reason":"r"}]} tail',
			listings,
		);
		expect(parsedOk).toBe(true);
		expect(cards).toHaveLength(1);
	});

	it("returns parsedOk false on unparseable answers", () => {
		const { cards, parsedOk } = parseRecommendations(
			"I could not find JSON.",
			listings,
		);
		expect(parsedOk).toBe(false);
		expect(cards).toEqual([]);
	});
});
