import type { PlazaImportRequest } from "@/lib/plaza/import";

export type SkillImportPayload = { kind: "skill"; url: string };

/** One visible plaza item collected for an assistant run. */
export type PlazaListing = {
	sourceId: string;
	/** Stable per-item id: arxivId, paperId, "owner/repo", feed item id. */
	id: string;
	title: string;
	subtitle?: string;
	url?: string | null;
	/** Abstract / repo description, truncated at collection time. */
	summary?: string;
	kind: "paper" | "skill";
	/** Paper rows: the plaza import request; skill rows: repo URL; null = not importable. */
	importPayload: PlazaImportRequest | SkillImportPayload | null;
};

/** Agent-picked recommendation rendered as a card. */
export type PlazaRecommendationCard = {
	listing: PlazaListing;
	reason: string;
};
