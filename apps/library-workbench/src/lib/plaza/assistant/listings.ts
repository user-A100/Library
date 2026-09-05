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

/** Frame→host listing item (bridge protocol; see modelscope_proxy.rs). */
export type FrameListing = {
	id: string;
	title: string;
	url?: string;
	summary?: string;
};

type MessageSubscriber = (h: (e: MessageEvent) => void) => () => void;

const subscribeWindowMessages: MessageSubscriber = (h) => {
	window.addEventListener("message", h);
	return () => window.removeEventListener("message", h);
};

/**
 * Ask an embedded proxy frame for the listings currently visible in it.
 *
 * Posts `{source:"library-plaza-host", type:"requestListings", requestId}` at
 * `embedOrigin` and resolves with the items from the frame's first
 * `{source:"library-plaza", type:"listings", requestId, items}` reply, or []
 * on timeout (empty page, wrong tab, or a frame without the bridge).
 */
export async function requestFrameListings(
	frame: HTMLIFrameElement | null,
	embedOrigin: string,
	timeoutMs = 1500,
	subscribe: MessageSubscriber = subscribeWindowMessages,
): Promise<PlazaListing[]> {
	const win = frame?.contentWindow;
	if (!win) return [];
	const requestId =
		globalThis.crypto?.randomUUID?.() ?? `plaza-${Date.now()}-${Math.random()}`;
	return new Promise<PlazaListing[]>((resolve) => {
		const unlisten = subscribe((event) => {
			if (event.origin !== embedOrigin) return;
			const data = event.data as {
				source?: string;
				type?: string;
				requestId?: string;
				items?: FrameListing[];
			} | null;
			if (
				!data ||
				data.source !== "library-plaza" ||
				data.type !== "listings" ||
				data.requestId !== requestId
			) {
				return;
			}
			clearTimeout(timer);
			unlisten();
			resolve(collectListings(data.items ?? []));
		});
		const timer = setTimeout(() => {
			unlisten();
			resolve([]);
		}, timeoutMs);
		win.postMessage(
			{ source: "library-plaza-host", type: "requestListings", requestId },
			embedOrigin,
		);
	});
}

function collectListings(items: readonly FrameListing[]): PlazaListing[] {
	const seen = new Set<string>();
	const listings: PlazaListing[] = [];
	for (const item of items) {
		if (!item.id || seen.has(item.id)) continue;
		seen.add(item.id);
		listings.push({
			sourceId: "frame",
			id: item.id,
			title: item.title,
			url: item.url ?? null,
			summary: item.summary ? truncate(item.summary, 300) : undefined,
			kind: "paper",
			importPayload: item.url
				? { id: item.id, branch: "arxiv", url: item.url, title: item.title }
				: null,
		});
		if (listings.length >= PLAZA_LISTING_CAP) break;
	}
	return listings;
}
