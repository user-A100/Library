import type { FeedItem } from "@/lib/plaza/feeds";
import type { SkillRepo, SkillThemeId } from "@/lib/plaza/skill-catalog";
import type { RecommendItem } from "@/lib/recommend";
import type { PlazaListing } from "./types";

export const PLAZA_LISTING_CAP = 50;
const SUMMARY_MAX = 280;

function truncate(text: string, max = SUMMARY_MAX): string {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

export function listingsFromSkillRepos(
	repos: readonly SkillRepo[],
	themeId: SkillThemeId,
): PlazaListing[] {
	return repos.slice(0, PLAZA_LISTING_CAP).map((repo) => ({
		sourceId: "skills",
		id: `${repo.owner}/${repo.repo}`,
		title: `${repo.owner}/${repo.repo}`,
		subtitle: themeId,
		url: repo.url,
		summary: truncate(repo.description),
		kind: "skill" as const,
		importPayload: { kind: "skill" as const, url: repo.url },
	}));
}

export function listingsFromFeedItems(
	items: readonly FeedItem[],
): PlazaListing[] {
	return items.slice(0, PLAZA_LISTING_CAP).map((item) => ({
		sourceId: "feeds",
		id: item.id,
		title: item.title,
		subtitle: item.subscriptionTitle,
		url: item.url,
		summary: truncate(item.summaryText),
		kind: "paper" as const,
		importPayload: item.paperUrl
			? { id: item.id, branch: "arxiv", url: item.paperUrl, title: item.title }
			: null,
	}));
}

export function listingsFromRecommendItems(
	items: readonly RecommendItem[],
): PlazaListing[] {
	return items.slice(0, PLAZA_LISTING_CAP).map((item) => ({
		sourceId: "arxiv-rec",
		id: item.arxivId,
		title: item.title,
		url: item.url,
		summary: truncate(item.abstract),
		kind: "paper" as const,
		importPayload: {
			id: item.arxivId,
			branch: "arxiv",
			url: item.url,
			title: item.title,
		},
	}));
}
