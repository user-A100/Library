import { describe, expect, it } from "vitest";
import type { FeedItem } from "@/lib/plaza/feeds";
import type { RecommendItem } from "@/lib/recommend";
import type { SkillRepo } from "@/lib/plaza/skill-catalog";
import {
	listingsFromFeedItems,
	listingsFromRecommendItems,
	listingsFromSkillRepos,
	PLAZA_LISTING_CAP,
	requestFrameListings,
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

describe("requestFrameListings", () => {
	const ORIGIN = "http://library-modelscope.localhost";

	/** A frame whose contentWindow answers requestListings via the bridge. */
	function fakeFrame(reply: (requestId: string) => unknown) {
		let handler: ((e: MessageEvent) => void) | null = null;
		const frame = {
			contentWindow: {
				postMessage: (msg: unknown) => {
					const requestId = (msg as { requestId?: string }).requestId;
					if (typeof requestId === "string") {
						setTimeout(
							() =>
								handler?.({
									origin: ORIGIN,
									data: reply(requestId),
								} as MessageEvent),
							0,
						);
					}
				},
			},
		} as unknown as HTMLIFrameElement;
		const subscribe = (h: (e: MessageEvent) => void) => {
			handler = h;
			return () => {
				handler = null;
			};
		};
		return { frame, subscribe };
	}

	it("round-trips listings through the bridge", async () => {
		const { frame, subscribe } = fakeFrame((requestId) => ({
			source: "library-plaza",
			type: "listings",
			requestId,
			items: [
				{
					id: "2405.01234",
					title: "A Paper",
					url: "https://arxiv.org/abs/2405.01234",
					summary: "s",
				},
			],
		}));
		const out = await requestFrameListings(frame, ORIGIN, 1000, subscribe);
		expect(out[0]).toMatchObject({
			sourceId: "frame",
			id: "2405.01234",
			title: "A Paper",
			kind: "paper",
			importPayload: {
				id: "2405.01234",
				branch: "arxiv",
				url: "https://arxiv.org/abs/2405.01234",
				title: "A Paper",
			},
		});
	});

	it("ignores replies with a foreign origin, source or requestId", async () => {
		let handler: ((e: MessageEvent) => void) | null = null;
		const frame = {
			contentWindow: {
				postMessage: (msg: unknown) => {
					const requestId = (msg as { requestId?: string }).requestId;
					setTimeout(() => {
						handler?.({
							origin: "http://evil.localhost",
							data: {
								source: "library-plaza",
								type: "listings",
								requestId,
								items: [{ id: "x", title: "x" }],
							},
						} as MessageEvent);
						handler?.({
							origin: ORIGIN,
							data: {
								source: "somewhere-else",
								type: "listings",
								requestId,
								items: [{ id: "x", title: "x" }],
							},
						} as MessageEvent);
					}, 0);
				},
			},
		} as unknown as HTMLIFrameElement;
		const subscribe = (h: (e: MessageEvent) => void) => {
			handler = h;
			return () => {
				handler = null;
			};
		};
		await expect(
			requestFrameListings(frame, ORIGIN, 50, subscribe),
		).resolves.toEqual([]);
	});

	it("resolves [] on timeout", async () => {
		const frame = {
			contentWindow: { postMessage: () => {} },
		} as unknown as HTMLIFrameElement;
		await expect(
			requestFrameListings(frame, "http://x.localhost", 20, () => () => {}),
		).resolves.toEqual([]);
	});

	it("resolves [] without a frame", async () => {
		await expect(requestFrameListings(null, ORIGIN, 20)).resolves.toEqual([]);
	});
});
