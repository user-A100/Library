import { describe, expect, it } from "vitest";
import type { FeedItem } from "@/lib/plaza/feeds";
import type { RecommendItem } from "@/lib/recommend";
import type { SkillRepo } from "@/lib/plaza/skill-catalog";
import {
	listingsFromFeedItems,
	listingsFromRecommendItems,
	listingsFromSkillRepos,
	PLAZA_LISTING_CAP,
} from "./listings";

const repo: SkillRepo = {
	owner: "WUBING2023",
	repo: "PaperSpine",
	url: "https://github.com/WUBING2023/PaperSpine",
	description: "从高水平论文里拆动机、结构和写法。",
	stars: 4805,
};

describe("listingsFromSkillRepos", () => {
	it("maps a repo to a skill listing with import payload", () => {
		const out = listingsFromSkillRepos([repo], "figures");
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			sourceId: "skills",
			id: "WUBING2023/PaperSpine",
			title: "WUBING2023/PaperSpine",
			kind: "skill",
			url: repo.url,
			summary: repo.description,
			importPayload: { kind: "skill", url: repo.url },
		});
	});

	it("caps at PLAZA_LISTING_CAP", () => {
		const many = Array.from({ length: PLAZA_LISTING_CAP + 20 }, (_, i) => ({
			...repo,
			repo: `r${i}`,
		}));
		expect(listingsFromSkillRepos(many, "reading")).toHaveLength(
			PLAZA_LISTING_CAP,
		);
	});
});

describe("listingsFromFeedItems", () => {
	const feed: FeedItem = {
		id: "f1",
		subscriptionId: "s1",
		subscriptionTitle: "cs.AI",
		title: "A Paper",
		url: "https://example.com/a",
		publishedAt: null,
		summaryText: "Summary".repeat(100),
		contentHtml: null,
		paperUrl: "https://arxiv.org/abs/2405.01234",
		importedAt: null,
		bodyMarkdown: null,
	};

	it("maps a paper feed item with an arXiv import payload and truncates summary", () => {
		const out = listingsFromFeedItems([feed]);
		expect(out[0]?.summary?.length).toBeLessThanOrEqual(283);
		expect(out[0]?.importPayload).toEqual({
			id: "f1",
			branch: "arxiv",
			url: feed.paperUrl,
			title: "A Paper",
		});
	});

	it("leaves importPayload null when the item has no paperUrl", () => {
		const out = listingsFromFeedItems([{ ...feed, paperUrl: null }]);
		expect(out[0]?.importPayload).toBeNull();
	});
});

describe("listingsFromRecommendItems", () => {
	it("maps a recommend item", () => {
		const item: RecommendItem = {
			arxivId: "2607.24653",
			title: "T",
			abstract: "abs",
			url: "https://arxiv.org/abs/2607.24653",
			publishedAt: null,
			score: 0.9,
		};
		const out = listingsFromRecommendItems([item]);
		expect(out[0]).toMatchObject({
			sourceId: "arxiv-rec",
			id: "2607.24653",
			kind: "paper",
		});
	});
});
