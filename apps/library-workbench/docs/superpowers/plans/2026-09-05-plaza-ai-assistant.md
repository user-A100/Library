# Plaza AI 助手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在广场五个面板（ModelScope / Cool Papers / Skill Store / Feeds / arXiv Daily）内让用户用自然语言提问，AI 扫描当前可见条目并返回"推荐卡片（标题+匹配理由+一键入库）"。

**Architecture:** **不新建任何 AI 引擎**。执行层 100% 复用现有 ACP 链路：`runOnce()`（`src/lib/agent/api.ts:452`，invoke `agent_run_once` → 用户配置的 ACP agent 进程），与 paper-reader（`src/lib/paper/reader.ts`）完全同源。新增代码只做三件事：①收集当前面板可见条目（原生面板直接取 TS 状态；iframe 面板经既有 `library-plaza` postMessage 桥请求）②拼提示词走 `runOnce` ③把 agent 回答里的 JSON 块解析成卡片渲染。导入复用 `src/lib/plaza/import.ts` 既有函数。

**Tech Stack:** React 19 + TS + zustand/vanilla + vitest（前端，全部在 `apps/library-workbench`）；Rust（仅 Phase 2 桥接，`modelscope_proxy.rs` / `coolpapers/proxy.rs`）。

**Spec:** `C:\Users\111222\.claude\plans\declarative-soaring-wigderson.md`（已批准的功能方案）

## Global Constraints

- 所有命令在 `D:\Mycraft\tencent-fight\apps\library-workbench` 下执行：`pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench <cmd>`（后台命令必须用 --dir 形式，cwd 会重置）
- 代码风格：**Tab 缩进**、biome 格式（提交前 `pnpm exec biome format <files> --write`）、i18n JSON 也是 Tab
- 测试：vitest，与源码同目录 `*.test.ts`；运行 `pnpm vitest run <path>`
- Rust 测试：`pnpm exec cargo test -p library` （在 src-tauri 下实际执行：`cargo test --manifest-path src-tauri/Cargo.toml` 按仓库现有方式）
- **commit 一律不带任何 AI 署名 / Co-Authored-By**；不得在代码/注释/文档中出现上游项目名
- UI 文案全部走 i18n（`sidebar` namespace），禁止硬编码中英文
- 每个 sourceId 一个独立 session；`runOnce` 必须带 `hideFromChatHistory: true`（不污染聊天历史，与 paper-reader 一致）

## 已核实的依赖签名（执行者直接使用，勿改）

```ts
// src/lib/agent/api.ts
export async function runOnce(request: {
	prompt: string; agentId?: string; sessionId?: string; vaultPath?: string;
	workflow?: string; target?: string; skillIds?: string[];
	autoApprove?: boolean; permissionMode?: string; responseLanguage?: string;
	personalPrompt?: string; hideFromChatHistory?: boolean; /* … */
}): Promise<RunOnceAccepted>;
export type RunOnceAccepted = { sessionId: string; messageId: string; agentId: string };
export type AgentStreamEvent = { sessionId: string; chunk: string; kind?: "message" | "thought" };
export type AgentResultPayload = { sessionId: string; messageId: string; content: string; /* … */ };
export type AgentFailedEvent = { sessionId: string; error: string /* 或近似；含 error 字段 */ };
export async function listenAgentStream(h: (e: AgentStreamEvent) => void): Promise<() => void>;
export async function listenAgentCompleted(h: (e: AgentResultPayload) => void): Promise<() => void>;
export async function listenAgentFailed(h: (e: AgentFailedEvent) => void): Promise<() => void>;
export async function cancelAgentRun(sessionId: string): Promise<void>;

// src/lib/plaza/import.ts
export type PlazaImportRequest = { id: string; branch?: string; url: string; title: string | null };
export async function importPlazaPaper(request: PlazaImportRequest): Promise<boolean>;
export async function importPlazaSkillRepo(url: string): Promise<void>;

// src/lib/plaza/skill-catalog.ts
export type SkillThemeId = "reading" | "writing" | "figures" | "reproduce" | "submit";
export type SkillRepo = { owner: string; repo: string; url: string; description: string; stars: number };

// src/lib/plaza/feeds.ts
export type FeedItem = { id: string; subscriptionId: string; subscriptionTitle: string; title: string;
	url: string | null; publishedAt: string | null; summaryText: string; contentHtml: string | null;
	paperUrl: string | null; importedAt: string | null; bodyMarkdown: string | null };

// src/lib/recommend/index.ts
export type RecommendItem = { arxivId: string; title: string; abstract: string; url: string; publishedAt: string | null; score: number };

// 其他
import { openExternalUrl } from "@/lib/core/open-external";
import { errorText } from "@/lib/core/error";
import { cn } from "@/lib/core/utils";
```

---

### Task 1: PlazaListing 类型 + 三个原生面板的条目收集器

**Files:**
- Create: `src/lib/plaza/assistant/types.ts`
- Create: `src/lib/plaza/assistant/listings.ts`
- Test: `src/lib/plaza/assistant/listings.test.ts`

**Interfaces:**
- Consumes: 上方签名区的 `SkillRepo` / `FeedItem` / `RecommendItem` / `PlazaImportRequest`
- Produces（后续 Task 全部依赖）:
  ```ts
  export type SkillImportPayload = { kind: "skill"; url: string };
  export type PlazaListing = {
  	sourceId: string; id: string; title: string; subtitle?: string;
  	url?: string | null; summary?: string; kind: "paper" | "skill";
  	importPayload: PlazaImportRequest | SkillImportPayload | null;
  };
  export function listingsFromSkillRepos(repos: readonly SkillRepo[], themeId: SkillThemeId): PlazaListing[];
  export function listingsFromFeedItems(items: readonly FeedItem[]): PlazaListing[];
  export function listingsFromRecommendItems(items: readonly RecommendItem[]): PlazaListing[];
  export const PLAZA_LISTING_CAP = 50;
  ```

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/plaza/assistant/listings.test.ts
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
	owner: "WUBING2023", repo: "PaperSpine", url: "https://github.com/WUBING2023/PaperSpine",
	description: "从高水平论文里拆动机、结构和写法。", stars: 4805,
};

describe("listingsFromSkillRepos", () => {
	it("maps a repo to a skill listing with import payload", () => {
		const out = listingsFromSkillRepos([repo], "figures");
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			sourceId: "skills", id: "WUBING2023/PaperSpine",
			title: "WUBING2023/PaperSpine", kind: "skill", url: repo.url,
			summary: repo.description,
			importPayload: { kind: "skill", url: repo.url },
		});
	});

	it("caps at PLAZA_LISTING_CAP", () => {
		const many = Array.from({ length: PLAZA_LISTING_CAP + 20 }, (_, i) => ({ ...repo, repo: `r${i}` }));
		expect(listingsFromSkillRepos(many, "reading")).toHaveLength(PLAZA_LISTING_CAP);
	});
});

describe("listingsFromFeedItems", () => {
	const feed: FeedItem = {
		id: "f1", subscriptionId: "s1", subscriptionTitle: "cs.AI",
		title: "A Paper", url: "https://example.com/a", publishedAt: null,
		summaryText: "Summary".repeat(100), contentHtml: null,
		paperUrl: "https://arxiv.org/abs/2405.01234", importedAt: null, bodyMarkdown: null,
	};

	it("maps a paper feed item with an arXiv import payload and truncates summary", () => {
		const out = listingsFromFeedItems([feed]);
		expect(out[0]?.summary?.length).toBeLessThanOrEqual(283);
		expect(out[0]?.importPayload).toEqual({
			id: "f1", branch: "arxiv", url: feed.paperUrl, title: "A Paper",
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
			arxivId: "2607.24653", title: "T", abstract: "abs", url: "https://arxiv.org/abs/2607.24653",
			publishedAt: null, score: 0.9,
		};
		const out = listingsFromRecommendItems([item]);
		expect(out[0]).toMatchObject({ sourceId: "arxiv-rec", id: "2607.24653", kind: "paper" });
	});
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run src/lib/plaza/assistant/listings.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 types.ts 与 listings.ts**

```ts
// src/lib/plaza/assistant/types.ts
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
```

```ts
// src/lib/plaza/assistant/listings.ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run src/lib/plaza/assistant/listings.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaza/assistant/
git commit -m "feat(plaza): listing collectors for the plaza AI assistant"
```

---

### Task 2: 提示词构造器

**Files:**
- Create: `src/lib/plaza/assistant/prompt.ts`
- Test: `src/lib/plaza/assistant/prompt.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PlazaListing`
- Produces:
  ```ts
  export function buildPlazaAssistantPrompt(opts: {
  	sourceLabel: string; question: string; listings: PlazaListing[];
  }): string;
  ```

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/plaza/assistant/prompt.test.ts
import { describe, expect, it } from "vitest";
import { buildPlazaAssistantPrompt } from "./prompt";
import type { PlazaListing } from "./types";

const listing: PlazaListing = {
	sourceId: "skills", id: "a/b", title: "a/b", summary: "Nature 文风绘图",
	kind: "skill", importPayload: { kind: "skill", url: "https://github.com/a/b" },
};

describe("buildPlazaAssistantPrompt", () => {
	it("embeds the question, a numbered item list as JSON, and the output contract", () => {
		const p = buildPlazaAssistantPrompt({
			sourceLabel: "Skill Store", question: "找 nature 风格的 skill", listings: [listing],
		});
		expect(p).toContain("Skill Store");
		expect(p).toContain("找 nature 风格的 skill");
		expect(p).toContain('"index": 1');
		expect(p).toContain("recommendations");
		expect(p).toMatch(/```json/);
	});

	it("states the included count when listings exceed the cap", () => {
		const many = Array.from({ length: 60 }, (_, i) => ({ ...listing, id: `r${i}`, title: `r${i}` }));
		const p = buildPlazaAssistantPrompt({ sourceLabel: "X", question: "q", listings: many });
		expect(p).toContain("50 of 60");
	});
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run src/lib/plaza/assistant/prompt.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/plaza/assistant/prompt.ts
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
		JSON.stringify(items),
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
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run src/lib/plaza/assistant/prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaza/assistant/prompt.ts src/lib/plaza/assistant/prompt.test.ts
git commit -m "feat(plaza): assistant prompt builder"
```

---

### Task 3: 回答解析器（JSON 块 → 推荐卡片）

**Files:**
- Create: `src/lib/plaza/assistant/parse.ts`
- Test: `src/lib/plaza/assistant/parse.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PlazaListing` / `PlazaRecommendationCard`
- Produces:
  ```ts
  export function parseRecommendations(
  	answer: string,
  	listings: PlazaListing[],
  ): { cards: PlazaRecommendationCard[]; parsedOk: boolean };
  ```

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/plaza/assistant/parse.test.ts
import { describe, expect, it } from "vitest";
import { parseRecommendations } from "./parse";
import type { PlazaListing } from "./types";

const listings: PlazaListing[] = [1, 2, 3].map((n) => ({
	sourceId: "s", id: `id${n}`, title: `T${n}`, kind: "paper" as const, importPayload: null,
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
			"```json\n[{\"index\":3,\"reason\":\"r\"}]\n```",
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
		const recs = Array.from({ length: 12 }, (_, i) => ({ index: 1 + (i % 3), reason: `r${i}` }));
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
		const { cards, parsedOk } = parseRecommendations("I could not find JSON.", listings);
		expect(parsedOk).toBe(false);
		expect(cards).toEqual([]);
	});
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run src/lib/plaza/assistant/parse.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/plaza/assistant/parse.ts
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
			typeof data === "object" && data !== null &&
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
			const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
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
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run src/lib/plaza/assistant/parse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaza/assistant/parse.ts src/lib/plaza/assistant/parse.test.ts
git commit -m "feat(plaza): assistant answer parser"
```

---

### Task 4: ACP 运行包装 + 会话 store

**Files:**
- Create: `src/lib/plaza/assistant/run.ts`
- Create: `src/lib/plaza/assistant/store.ts`
- Test: `src/lib/plaza/assistant/store.test.ts`

**Interfaces:**
- Consumes: 签名区的 `runOnce` / `listenAgent*` / `cancelAgentRun`；Task 2 `buildPlazaAssistantPrompt`；Task 3 `parseRecommendations`；Task 1 类型
- Produces（Task 5/6 组件依赖）:
  ```ts
  // run.ts
  export type PlazaAskResult = { answer: string; cancelled: boolean; error?: string };
  export function cancelPlazaAsk(sourceId: string): void;
  export function runPlazaAsk(sourceId: string, prompt: string,
  	onStream: (delta: string) => void): Promise<PlazaAskResult>;
  // store.ts
  export type PlazaAskStatus = "idle" | "collecting" | "running" | "done" | "error" | "cancelled";
  export type PlazaAskSession = {
  	status: PlazaAskStatus; question: string; listings: PlazaListing[];
  	cards: PlazaRecommendationCard[]; parsedOk: boolean;
  	streamText: string; answer: string | null; error: string | null;
  };
  export const plazaAssistantStore: { getState(): PlazaAssistantState; subscribe(f: () => void): () => void; };
  export const IDLE_ASK_SESSION: PlazaAskSession;
  export function askPlaza(opts: { sourceId: string; sourceLabel: string;
  	question: string; collect: () => Promise<PlazaListing[]>; }): Promise<void>;
  export function stopPlazaAsk(sourceId: string): void;
  export function resetPlazaAsk(sourceId: string): void;
  export function usePlazaAssistantSession(sourceId: string): PlazaAskSession; // React hook (useSyncExternalStore)
  ```

- [ ] **Step 1: 写 store 失败测试（run 用 vi.mock 打桩）**

```ts
// src/lib/plaza/assistant/store.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlazaListing } from "./types";

const runPlazaAskMock = vi.hoisted(() => vi.fn());
vi.mock("./run", () => ({
	runPlazaAsk: runPlazaAskMock,
	cancelPlazaAsk: vi.fn(),
}));

import {
	IDLE_ASK_SESSION,
	askPlaza,
	resetPlazaAsk,
	usePlazaAssistantStoreState, // 见下：测试直接读 store state
} from "./store";

const listing: PlazaListing = {
	sourceId: "skills", id: "a/b", title: "a/b", kind: "skill", importPayload: null,
};

beforeEach(() => {
	runPlazaAskMock.mockReset();
	resetPlazaAsk("skills");
});

describe("plazaAssistantStore.askPlaza", () => {
	it("errors with emptyListings and never calls the agent when collect returns []", async () => {
		await askPlaza({
			sourceId: "skills", sourceLabel: "Skill Store",
			question: "q", collect: async () => [],
		});
		expect(runPlazaAskMock).not.toHaveBeenCalled();
		expect(usePlazaAssistantStoreState().sessions.skills?.error).toBe("emptyListings");
	});

	it("runs, streams, and parses cards on success", async () => {
		runPlazaAskMock.mockImplementation(async (_id: string, _p: string, onStream: (d: string) => void) => {
			onStream("partial");
			return {
				answer: '```json\n{"recommendations":[{"index":1,"reason":"r"}]}\n```\ndone',
				cancelled: false,
			};
		});
		await askPlaza({
			sourceId: "skills", sourceLabel: "Skill Store",
			question: "q", collect: async () => [listing],
		});
		const session = usePlazaAssistantStoreState().sessions.skills;
		expect(session?.status).toBe("done");
		expect(session?.cards).toHaveLength(1);
		expect(session?.cards[0]?.reason).toBe("r");
		expect(session?.streamText).toContain("partial");
	});

	it("guards against double ask while busy", async () => {
		runPlazaAskMock.mockImplementation(() => new Promise(() => {})); // never settles
		const first = askPlaza({ sourceId: "skills", sourceLabel: "S", question: "q1", collect: async () => [listing] });
		await askPlaza({ sourceId: "skills", sourceLabel: "S", question: "q2", collect: async () => [listing] });
		expect(runPlazaAskMock).toHaveBeenCalledTimes(1);
		void first;
	});

	it("records agent errors", async () => {
		runPlazaAskMock.mockResolvedValue({ answer: "", cancelled: false, error: "boom" });
		await askPlaza({ sourceId: "skills", sourceLabel: "S", question: "q", collect: async () => [listing] });
		expect(usePlazaAssistantStoreState().sessions.skills?.status).toBe("error");
		expect(usePlazaAssistantStoreState().sessions.skills?.error).toBe("boom");
	});
});
```

（注：store 导出一个 `usePlazaAssistantStoreState()` 仅用于测试读取原始 state；组件用 `usePlazaAssistantSession`。若实现中发现多余可改为直接导出 store 对象，测试相应改为 `store.getState()`——二选一，保持一致性。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run src/lib/plaza/assistant/store.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 run.ts（仿 reader.ts 的 listen+resolve 模式）**

```ts
// src/lib/plaza/assistant/run.ts
import {
	cancelAgentRun,
	listenAgentCompleted,
	listenAgentFailed,
	listenAgentStream,
	runOnce,
	type RunOnceAccepted,
} from "@/lib/agent";
import { errorText } from "@/lib/core/error";

export type PlazaAskResult = {
	answer: string;
	cancelled: boolean;
	error?: string;
};

/** Per-sourceId cancel handles for in-flight assistant runs. */
const cancellers = new Map<string, () => void>();

/** Cancel the in-flight run for a source (no-op when idle). */
export function cancelPlazaAsk(sourceId: string): void {
	cancellers.get(sourceId)?.();
}

/**
 * One-shot ACP run for a plaza assistant question — the same
 * `runOnce` → `agent_run_once` → ACP agent chain paper-reader uses.
 * Resolves with the final answer text (or the streamed prefix when
 * cancelled / failed).
 */
export async function runPlazaAsk(
	sourceId: string,
	prompt: string,
	onStream: (delta: string) => void,
): Promise<PlazaAskResult> {
	const accepted: RunOnceAccepted = await runOnce({
		prompt,
		workflow: "plaza_ask",
		autoApprove: true,
		hideFromChatHistory: true,
	});
	const sessionId = accepted.sessionId;

	return new Promise<PlazaAskResult>((resolve) => {
		let settled = false;
		let stream = "";
		const unsubs: Array<() => void> = [];
		const finish = (result: PlazaAskResult) => {
			if (settled) return;
			settled = true;
			cancellers.delete(sourceId);
			for (const u of unsubs) {
				try {
					u();
				} catch {
					// ignore
				}
			}
			resolve(result);
		};
		cancellers.set(sourceId, () => {
			void cancelAgentRun(sessionId).catch(() => {});
			finish({ answer: stream, cancelled: true });
		});
		void (async () => {
			try {
				unsubs.push(
					await listenAgentStream((ev) => {
						if (ev.sessionId !== sessionId || ev.kind === "thought") return;
						stream += ev.chunk;
						onStream(ev.chunk);
					}),
				);
				unsubs.push(
					await listenAgentCompleted((ev) => {
						if (ev.sessionId !== sessionId) return;
						finish({ answer: ev.content || stream, cancelled: false });
					}),
				);
				unsubs.push(
					await listenAgentFailed((ev) => {
						if (ev.sessionId !== sessionId) return;
						finish({ answer: stream, cancelled: false, error: ev.error || "agent failed" });
					}),
				);
			} catch (e) {
				finish({ answer: stream, cancelled: false, error: errorText(e) });
			}
		})();
	});
}
```

- [ ] **Step 4: 实现 store.ts（zustand vanilla + useSyncExternalStore hook）**

```ts
// src/lib/plaza/assistant/store.ts
import { useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { errorText } from "@/lib/core/error";
import { buildPlazaAssistantPrompt } from "./prompt";
import { parseRecommendations } from "./parse";
import { runPlazaAsk, cancelPlazaAsk } from "./run";
import type { PlazaListing, PlazaRecommendationCard } from "./types";

export type PlazaAskStatus =
	| "idle"
	| "collecting"
	| "running"
	| "done"
	| "error"
	| "cancelled";

export type PlazaAskSession = {
	status: PlazaAskStatus;
	question: string;
	/** Snapshot used for the run; card imports read from it. */
	listings: PlazaListing[];
	cards: PlazaRecommendationCard[];
	parsedOk: boolean;
	streamText: string;
	answer: string | null;
	error: string | null;
};

export const IDLE_ASK_SESSION: PlazaAskSession = {
	status: "idle",
	question: "",
	listings: [],
	cards: [],
	parsedOk: true,
	streamText: "",
	answer: null,
	error: null,
};

type PlazaAssistantState = {
	sessions: Record<string, PlazaAskSession>;
};

const BUSY: readonly PlazaAskStatus[] = ["collecting", "running"];

export const plazaAssistantStore = createStore<PlazaAssistantState>({
	sessions: {},
});

/** Test-friendly raw state accessor. */
export function usePlazaAssistantStoreState(): PlazaAssistantState {
	return plazaAssistantStore.getState();
}

function setSession(sourceId: string, patch: Partial<PlazaAskSession>): void {
	plazaAssistantStore.setState((state) => ({
		sessions: {
			...state.sessions,
			[sourceId]: { ...state.sessions[sourceId], ...IDLE_ASK_SESSION, ...patch },
		},
	}));
}

export function resetPlazaAsk(sourceId: string): void {
	plazaAssistantStore.setState((state) => {
		const sessions = { ...state.sessions };
		delete sessions[sourceId];
		return { sessions };
	});
}

export function stopPlazaAsk(sourceId: string): void {
	cancelPlazaAsk(sourceId);
}

export async function askPlaza(opts: {
	sourceId: string;
	sourceLabel: string;
	question: string;
	collect: () => Promise<PlazaListing[]>;
}): Promise<void> {
	const current = plazaAssistantStore.getState().sessions[opts.sourceId];
	if (current && BUSY.includes(current.status)) return;
	setSession(opts.sourceId, {
		status: "collecting",
		question: opts.question,
		listings: [],
		cards: [],
		parsedOk: true,
		streamText: "",
		answer: null,
		error: null,
	});
	let listings: PlazaListing[];
	try {
		listings = await opts.collect();
	} catch (e) {
		setSession(opts.sourceId, { status: "error", error: errorText(e) });
		return;
	}
	if (!listings.length) {
		setSession(opts.sourceId, { status: "error", error: "emptyListings" });
		return;
	}
	setSession(opts.sourceId, { status: "running", listings });
	try {
		const prompt = buildPlazaAssistantPrompt({
			sourceLabel: opts.sourceLabel,
			question: opts.question,
			listings,
		});
		const result = await runPlazaAsk(opts.sourceId, prompt, (delta) => {
			const state = plazaAssistantStore.getState().sessions[opts.sourceId];
			if (!state || state.status !== "running") return;
			setSession(opts.sourceId, { streamText: state.streamText + delta });
		});
		if (result.cancelled) {
			setSession(opts.sourceId, {
				status: "cancelled",
				answer: result.answer || null,
			});
			return;
		}
		if (result.error) {
			setSession(opts.sourceId, { status: "error", error: result.error, answer: result.answer || null });
			return;
		}
		const { cards, parsedOk } = parseRecommendations(result.answer, listings);
		setSession(opts.sourceId, {
			status: "done",
			answer: result.answer,
			cards,
			parsedOk,
		});
	} catch (e) {
		setSession(opts.sourceId, { status: "error", error: errorText(e) });
	}
}

/** React hook: the ask session for one plaza source. */
export function usePlazaAssistantSession(sourceId: string): PlazaAskSession {
	return useSyncExternalStore(
		plazaAssistantStore.subscribe,
		() => plazaAssistantStore.getState().sessions[sourceId] ?? IDLE_ASK_SESSION,
		() => IDLE_ASK_SESSION,
	);
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run src/lib/plaza/assistant/store.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 6: Commit**

```bash
git add src/lib/plaza/assistant/run.ts src/lib/plaza/assistant/store.ts src/lib/plaza/assistant/store.test.ts
git commit -m "feat(plaza): assistant run wrapper and per-source session store"
```

---

### Task 5: PlazaAssistant 组件 + i18n

**Files:**
- Create: `src/components/plaza/assistant/plaza-assistant.tsx`
- Modify: `src/i18n/locales/en/sidebar.json`（`plaza` 下加 `assistant` 对象）
- Modify: `src/i18n/locales/zh-CN/sidebar.json`（同上）

**Interfaces:**
- Consumes: Task 4 的 `usePlazaAssistantSession` / `askPlaza` / `stopPlazaAsk` / `resetPlazaAsk` / `PlazaAskStatus`；`importPlazaPaper` / `importPlazaSkillRepo`；`openExternalUrl`；shadcn `Button` / `Input`（`@/components/ui/*`）
- Produces:
  ```ts
  export function PlazaAssistant(props: {
  	sourceId: string; sourceLabel: string;
  	collect: () => Promise<PlazaListing[]>;
  }): ReactNode;
  ```

- [ ] **Step 1: 添加 i18n key**

`en/sidebar.json` 的 `"plaza"` 对象内（`"skills"` 平级）加：

```json
"assistant": {
	"askPlaceholder": "Ask AI to search this list…",
	"ask": "Ask AI",
	"stop": "Stop",
	"collecting": "Collecting visible items…",
	"thinking": "Thinking…",
	"emptyListings": "No visible items to search. Open a listing first.",
	"noCards": "No matching items in the current list.",
	"parseFailed": "Could not parse recommendations; showing the raw answer.",
	"import": "Import",
	"showRaw": "Show raw answer",
	"hideRaw": "Hide raw answer",
	"agentError": "AI run failed.",
	"openSettings": "Open Agent settings"
}
```

`zh-CN/sidebar.json` 同位置：

```json
"assistant": {
	"askPlaceholder": "让 AI 在当前列表里帮你找…",
	"ask": "问 AI",
	"stop": "停止",
	"collecting": "正在收集当前列表…",
	"thinking": "思考中…",
	"emptyListings": "当前没有可检索的条目，请先打开一个列表。",
	"noCards": "当前列表中没有匹配项。",
	"parseFailed": "无法解析推荐结果，显示原始回答。",
	"import": "入库",
	"showRaw": "显示原始回答",
	"hideRaw": "收起原始回答",
	"agentError": "AI 运行失败。",
	"openSettings": "打开 Agent 设置"
}
```

- [ ] **Step 2: 实现组件**

```tsx
// src/components/plaza/assistant/plaza-assistant.tsx
/**
 * Plaza AI assistant strip: ask a natural-language question about the items
 * currently visible in a plaza panel; the configured ACP agent (same chain
 * as paper-reader) picks matches from the collected snapshot and the answer
 * is rendered as recommendation cards with one-click import.
 */

import { Download, Loader2, Settings, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openExternalUrl } from "@/lib/core/open-external";
import { cn } from "@/lib/core/utils";
import { importPlazaPaper, importPlazaSkillRepo } from "@/lib/plaza/import";
import {
	askPlaza,
	resetPlazaAsk,
	stopPlazaAsk,
	usePlazaAssistantSession,
} from "@/lib/plaza/assistant/store";
import type { PlazaListing } from "@/lib/plaza/assistant/types";

function ListingCard({ listing, reason }: { listing: PlazaListing; reason: string }) {
	const { t } = useTranslation("sidebar");
	const [busy, setBusy] = useState(false);

	const onImport = useCallback(async () => {
		if (busy || !listing.importPayload) return;
		setBusy(true);
		try {
			if (listing.importPayload.kind === "skill") {
				await importPlazaSkillRepo(listing.importPayload.url);
			} else {
				await importPlazaPaper(listing.importPayload);
			}
		} finally {
			setBusy(false);
		}
	}, [busy, listing.importPayload]);

	return (
		<div className="rounded-lg border bg-background p-2.5">
			<button
				type="button"
				disabled={!listing.url}
				onClick={() => listing.url && openExternalUrl(listing.url)}
				className="text-left font-medium text-sm hover:underline disabled:no-underline"
			>
				{listing.title}
			</button>
			<p className="mt-1 text-muted-foreground text-xs leading-snug">{reason}</p>
			<Button
				type="button"
				variant="outline"
				size="icon-xs"
				disabled={busy || !listing.importPayload}
				onClick={() => void onImport()}
				aria-label={t("plaza.assistant.import")}
				className="mt-1.5 h-6 gap-1 px-2 text-[11px]"
			>
				{busy ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
				{t("plaza.assistant.import")}
			</Button>
		</div>
	);
}

export function PlazaAssistant({
	sourceId,
	sourceLabel,
	collect,
}: {
	sourceId: string;
	sourceLabel: string;
	collect: () => Promise<PlazaListing[]>;
}) {
	const { t } = useTranslation("sidebar");
	const session = usePlazaAssistantSession(sourceId);
	const [question, setQuestion] = useState("");
	const [showRaw, setShowRaw] = useState(false);

	useEffect(() => () => resetPlazaAsk(sourceId), [sourceId]);

	const busy = session.status === "collecting" || session.status === "running";

	const submit = useCallback(() => {
		const q = question.trim();
		if (!q || busy) return;
		setShowRaw(false);
		void askPlaza({ sourceId, sourceLabel, question: q, collect });
	}, [busy, collect, question, sourceId, sourceLabel]);

	return (
		<div className="flex shrink-0 flex-col gap-1.5 border-b px-2 py-1.5">
			<div className="flex items-center gap-1.5">
				<Sparkles className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
				<Input
					value={question}
					onChange={(e) => setQuestion(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") submit();
					}}
					placeholder={t("plaza.assistant.askPlaceholder")}
					disabled={busy}
					className="h-7 text-xs"
				/>
				{busy ? (
					<Button
						type="button"
						variant="outline"
						size="icon-xs"
						aria-label={t("plaza.assistant.stop")}
						onClick={() => stopPlazaAsk(sourceId)}
					>
						<Square className="size-3" />
					</Button>
				) : (
					<Button
						type="button"
						variant="outline"
						size="icon-xs"
						aria-label={t("plaza.assistant.ask")}
						disabled={!question.trim()}
						onClick={submit}
					>
						{session.status === "collecting" ? (
							<Loader2 className="size-3 animate-spin" />
						) : (
							<Sparkles className="size-3" />
						)}
					</Button>
				)}
			</div>

			{busy ? (
				<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<Loader2 className="size-3 animate-spin" />
					{session.status === "collecting"
						? t("plaza.assistant.collecting")
						: t("plaza.assistant.thinking")}
					{session.streamText ? (
						<span className="min-w-0 truncate">{session.streamText.slice(-120)}</span>
					) : null}
				</p>
			) : null}

			{session.status === "error" ? (
				<p className="flex items-center gap-1.5 text-destructive text-xs">
					{session.error === "emptyListings"
						? t("plaza.assistant.emptyListings")
						: t("plaza.assistant.agentError")}
					{session.error === "emptyListings" ? null : (
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							className="h-5 gap-1 px-1.5 text-[11px]"
							onClick={() => openExternalUrl("library-settings://agent")}
						>
							<Settings className="size-3" />
							{t("plaza.assistant.openSettings")}
						</Button>
					)}
				</p>
			) : null}

			{session.status === "done" || session.status === "cancelled" ? (
				<div className="library-scroll max-h-[45%] space-y-1.5 overflow-y-auto">
					{session.status === "done" && !session.cards.length ? (
						<p className="text-muted-foreground text-xs">
							{session.parsedOk
								? t("plaza.assistant.noCards")
								: t("plaza.assistant.parseFailed")}
						</p>
					) : null}
					{session.cards.map((card) => (
						<ListingCard key={card.listing.id} listing={card.listing} reason={card.reason} />
					))}
					{session.answer ? (
						<div>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								className="h-5 px-1.5 text-[11px] text-muted-foreground"
								onClick={() => setShowRaw((v) => !v)}
							>
								{showRaw ? t("plaza.assistant.hideRaw") : t("plaza.assistant.showRaw")}
							</Button>
							{showRaw ? (
								<pre className={cn("mt-1 whitespace-pre-wrap text-muted-foreground text-xs")}>
									{session.answer}
								</pre>
							) : null}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
```

**注意**：①"打开 Agent 设置"的跳转方式在实现时先查现有代码怎么打开设置窗口——`plaza-arxiv-rec-view.tsx:63` 附近有先例（`openSettings` 之类），照抄那个调用，**不要**用上面占位的 `library-settings://agent` URL；②若 `@/components/ui/input` 不存在，用项目里现成的输入组件（查 `plaza-feeds-view.tsx` 的订阅输入框用的哪个组件）。

- [ ] **Step 3: 类型检查 + 格式化**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench exec tsc --noEmit && pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench exec biome format src/components/plaza/assistant src/lib/plaza/assistant src/i18n/locales/en/sidebar.json src/i18n/locales/zh-CN/sidebar.json --write`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/components/plaza/assistant src/i18n/locales/en/sidebar.json src/i18n/locales/zh-CN/sidebar.json
git commit -m "feat(plaza): AI assistant strip component and strings"
```

---

### Task 6: 挂载到三个原生面板

**Files:**
- Modify: `src/components/plaza/plaza-skills-view.tsx`
- Modify: `src/components/plaza/plaza-feeds-view.tsx`
- Modify: `src/components/plaza/plaza-arxiv-rec-view.tsx`

**Interfaces:**
- Consumes: Task 5 的 `PlazaAssistant`；Task 1 的三个收集器
- Produces: 可用的 AI 助手 UI（Phase 1 交付完成）

- [ ] **Step 1: Skills 面板挂载**（`plaza-skills-view.tsx`）

在 `PlazaSkillsView` 顶部（`<h1>` 之前）插入；收集"当前全部主题的 repo"（该视图无过滤态，全量即当前可见）：

```tsx
import { PlazaAssistant } from "@/components/plaza/assistant/plaza-assistant";
import { listingsFromSkillRepos } from "@/lib/plaza/assistant/listings";
import { SKILL_THEMES, type SkillRepo } from "@/lib/plaza/skill-catalog";

function allSkillListings() {
	const listings = SKILL_THEMES.flatMap((theme) =>
		listingsFromSkillRepos(theme.repos, theme.id),
	);
	// 收集器按主题各自 cap 50；跨主题再 cap 一次保持总预算
	return listings.slice(0, 50);
}
```

```tsx
{/* 在 return 的最外层 div 内、<h1> 之前 */}
<PlazaAssistant
	sourceId="skills"
	sourceLabel={t("plaza.skills.title")}
	collect={async () => allSkillListings()}
/>
```

- [ ] **Step 2: Feeds 面板挂载**（`plaza-feeds-view.tsx`）

先读该文件确认"当前显示的 items"状态变量名（订阅过滤/分页后传给列表的那个数组），然后在其容器顶部插入：

```tsx
<PlazaAssistant
	sourceId="feeds"
	sourceLabel={t("plaza.feeds.label")}
	collect={async () => listingsFromFeedItems(visibleItems)}
/>
```

（`visibleItems` 替换为实际变量名；若列表分页，就用当前页数组。）

- [ ] **Step 3: arXiv Daily 面板挂载**（`plaza-arxiv-rec-view.tsx`）

同上，items 状态在 111 行附近：

```tsx
<PlazaAssistant
	sourceId="arxiv-rec"
	sourceLabel={t("plaza.arxivRec.label")}
	collect={async () => listingsFromRecommendItems(items)}
/>
```

- [ ] **Step 4: 类型检查 + 全量测试**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench exec tsc --noEmit && pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run`
Expected: 0 type errors；全部测试通过（既有 998+ 不回归）

- [ ] **Step 5: 手动冒烟（dev 已在跑则热更新）**

1. Skill Store 面板 → 输入"帮我找 nature 风格稿件设计的 skill" → 出卡片（`Yuan1z0825/nature-skills`、`Boom5426/Nature-Paper-Skills` 等应在列）→ 点入库走魔棒安装对话框
2. arXiv Daily → 有推荐结果时中文提问 → 回答为中文、卡片可入库
3. 停止按钮可中断；空列表面板提示"当前没有可检索的条目"

- [ ] **Step 6: Commit**

```bash
git add src/components/plaza
git commit -m "feat(plaza): mount AI assistant in skills, feeds and arXiv daily panels"
```

---

### Task 7: ModelScope iframe 桥 — 可见列表导出

**Files:**
- Modify: `src-tauri/src/features/paper/discovery/modelscope_proxy.rs`（`NAV_BRIDGE` 常量内的 JS）
- Test: 同文件内既有 `#[test]`（约 245-264 行断言脚本内容处）

**Interfaces:**
- Consumes: 既有 `library-plaza-host` → frame 消息通道（`NAV_BRIDGE` 内 `window.addEventListener("message", …)`，约 319-336 行）、既有 `paperId()` / `titleOf()` 辅助（137 / 172 行）
- Produces（Task 9 消费）: 桥协议
  - host→frame: `{source:"library-plaza-host", type:"requestListings", requestId:"<uuid>"}`
  - frame→host: `{source:"library-plaza", type:"listings", requestId, items:[{id,title,url,summary}]}`（≤50 条，summary ≤300 字符）

- [ ] **Step 1: 在 NAV_BRIDGE 的 JS 里新增收集函数与消息分支**

在既有 message handler 里加分支（与现有 `source === "library-plaza-host"` 判断并列）：

```js
function collectListings() {
	var seen = new Set();
	var items = [];
	var anchors = document.querySelectorAll('a[href^="/papers/"]');
	for (var i = 0; i < anchors.length && items.length < 50; i++) {
		var a = anchors[i];
		try {
			var u = new URL(a.href, location.origin);
			var m = u.pathname.match(/^\/papers\/([^/?#]+)/);
			if (!m) continue;
			var id = m[1];
			if (seen.has(id)) continue;
			seen.add(id);
			var title = (a.textContent || "").replace(/\s+/g, " ").trim();
			if (!title) continue;
			var card = a.closest("div,li,article") || a.parentElement;
			var summary = card
				? (card.textContent || "").replace(/\s+/g, " ").trim()
				: "";
			// 去掉标题前缀后截断
			if (summary.startsWith(title)) summary = summary.slice(title.length).trim();
			items.push({
				id: id,
				title: title,
				url: "https://modelscope.cn/papers/" + id,
				summary: summary.slice(0, 300),
			});
		} catch (e) {
			/* skip bad anchor */
		}
	}
	return items;
}
// handler 内：
if (data.type === "requestListings") {
	post({
		source: "library-plaza",
		type: "listings",
		requestId: data.requestId,
		items: collectListings(),
	});
	return;
}
```

（`post` 用桥内既有的 parent.postMessage 包装函数；若该文件没有统一 `post`，就 `parent.postMessage(payload, "*")`。）

- [ ] **Step 2: 扩展既有 Rust 测试断言**

在现有断言桥内容的 `#[test]` 中追加：

```rust
assert!(NAV_BRIDGE.contains("requestListings"));
assert!(NAV_BRIDGE.contains("collectListings"));
```

- [ ] **Step 3: 运行 Rust 测试**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench exec cargo test --manifest-path src-tauri/Cargo.toml modelscope`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/features/paper/discovery/modelscope_proxy.rs
git commit -m "feat(plaza): modelscope bridge exports visible listings on request"
```

---

### Task 8: Cool Papers iframe 桥 — 同协议

**Files:**
- Modify: `src-tauri/src/features/paper/discovery/coolpapers/proxy.rs`
- Test: 同文件既有 `#[test]`

**Interfaces:**
- Consumes/Produces: 与 Task 7 完全相同的消息协议
- 页面结构差异：行标题元素是 `[id^="title-"]`（`id` 形如 `title-2405.01234`），标题取 `textContent`，简介取所在行的其余文本

- [ ] **Step 1: 加同款 `collectListings()`（选择器换成 Cool Papers 的）**

```js
function collectListings() {
	var items = [];
	var nodes = document.querySelectorAll('[id^="title-"]');
	for (var i = 0; i < nodes.length && items.length < 50; i++) {
		var el = nodes[i];
		var id = el.id.slice("title-".length);
		if (!id) continue;
		var title = (el.textContent || "").replace(/\s+/g, " ").trim();
		if (!title) continue;
		var row = el.closest("tr,div,li") || el.parentElement;
		var summary = row ? (row.textContent || "").replace(/\s+/g, " ").trim() : "";
		if (summary.startsWith(title)) summary = summary.slice(title.length).trim();
		items.push({
			id: id,
			title: title,
			url: "https://papers.cool/arxiv/" + id,
			summary: summary.slice(0, 300),
		});
	}
	return items;
}
// handler 内同 Task 7 加 requestListings 分支
```

- [ ] **Step 2: 扩展测试断言并运行**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench exec cargo test --manifest-path src-tauri/Cargo.toml coolpapers`
Expected: PASS（含新断言 `contains("requestListings")`）

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/features/paper/discovery/coolpapers/proxy.rs
git commit -m "feat(plaza): cool papers bridge exports visible listings on request"
```

---

### Task 9: iframe 收集器 + WebFrame 接线

**Files:**
- Modify: `src/lib/plaza/assistant/listings.ts`（加 `requestFrameListings`）
- Test: `src/lib/plaza/assistant/listings.test.ts`（追加用例）
- Modify: `src/components/plaza/plaza-web-frame.tsx`
- Modify: `src/components/plaza/plaza-view.tsx`

**Interfaces:**
- Consumes: Task 7/8 的桥协议；Task 5 的 `PlazaAssistant`
- Produces:
  ```ts
  export function requestFrameListings(frame: HTMLIFrameElement | null,
  	embedOrigin: string, timeoutMs?: number): Promise<PlazaListing[]>;
  ```

- [ ] **Step 1: 追加失败测试**（模拟 postMessage 往返与超时）

```ts
// 追加到 listings.test.ts
import { requestFrameListings } from "./listings";

describe("requestFrameListings", () => {
	function fakeFrame(origin: string) {
		const listener = { handler: null as ((e: MessageEvent) => void) | null };
		const frame = {
			contentWindow: {
				postMessage: (msg: unknown, target: string) => {
					if (msg && (msg as { type?: string }).type === "requestListings") {
						const data = {
							source: "library-plaza",
							type: "listings",
							requestId: (msg as { requestId: string }).requestId,
							items: [{ id: "2405.01234", title: "T", url: "u", summary: "s" }],
						};
						setTimeout(() =>
							listener.handler?.({ origin, data } as MessageEvent), 0);
					}
				},
			},
		} as unknown as HTMLIFrameElement;
		const subscribe = (h: (e: MessageEvent) => void) => {
			listener.handler = h;
		};
		return { frame, subscribe };
	}

	it("round-trips listings through the bridge", async () => {
		const { frame } = fakeFrame("http://library-modelscope.localhost");
		const realAdd = window.addEventListener;
		vi.spyOn(window, "addEventListener").mockImplementation(
			((type: string, h: EventListener) => {
				if (type === "message") (h as unknown as (e: MessageEvent) => void);
				return realAdd.call(window, type, h as EventListener);
			}) as typeof window.addEventListener,
		);
		// 简化：直接用注入的 subscribe 覆盖 window 监听不可行时，改为把
		// requestFrameListings 设计成可注入 onMessage（见实现），测试传 subscribe。
		const out = await requestFrameListings(
			frame, "http://library-modelscope.localhost", 1000, () => fakeFrameSubscribe,
		);
		expect(out[0]?.id).toBe("2405.01234");
	});

	it("resolves [] on timeout", async () => {
		const frame = { contentWindow: { postMessage: () => {} } } as unknown as HTMLIFrameElement;
		await expect(requestFrameListings(frame, "http://x.localhost", 20)).resolves.toEqual([]);
	});
});
```

（第一条用例若 mock window 监听过于繁琐，允许给 `requestFrameListings` 增加第 4 个可选参数 `subscribe?: (h: (e: MessageEvent) => void) => () => void` 供测试注入——实现与测试保持一致即可，默认走 `window.addEventListener`。）

- [ ] **Step 2: 实现**

```ts
// 追加到 listings.ts
/** Frame→host listing item (bridge protocol; see modelscope_proxy.rs). */
export type FrameListing = {
	id: string;
	title: string;
	url?: string;
	summary?: string;
};

export async function requestFrameListings(
	frame: HTMLIFrameElement | null,
	embedOrigin: string,
	timeoutMs = 1500,
	subscribe: (h: (e: MessageEvent) => void) => () => void = (h) => {
		window.addEventListener("message", h);
		return () => window.removeEventListener("message", h);
	},
): Promise<PlazaListing[]> {
	if (!frame?.contentWindow) return [];
	const requestId =
		globalThis.crypto?.randomUUID?.() ?? `plaza-${Date.now()}-${Math.random()}`;
	return new Promise<PlazaListing[]>((resolve) => {
		const done = (items: PlazaListing[]) => {
			clearTimeout(timer);
			unlisten();
			resolve(items);
		};
		const unlisten = subscribe((event) => {
			if (event.origin !== embedOrigin) return;
			const data = event.data as
				| { source?: string; type?: string; requestId?: string; items?: FrameListing[] }
				| null;
			if (
				!data || data.source !== "library-plaza" ||
				data.type !== "listings" || data.requestId !== requestId
			) {
				return;
			}
			const seen = new Set<string>();
			const listings: PlazaListing[] = [];
			for (const item of data.items ?? []) {
				if (!item.id || seen.has(item.id)) continue;
				seen.add(item.id);
				listings.push({
					sourceId: "frame",
					id: item.id,
					title: item.title,
					url: item.url ?? null,
					summary: item.summary ? truncate(item.summary, SUMMARY_MAX) : undefined,
					kind: "paper",
					importPayload: item.url
						? { id: item.id, branch: "arxiv", url: item.url, title: item.title }
						: null,
				});
				if (listings.length >= PLAZA_LISTING_CAP) break;
			}
			done(listings);
		});
		const timer = setTimeout(() => done([]), timeoutMs);
		frame.contentWindow.postMessage(
			{ source: "library-plaza-host", type: "requestListings", requestId },
			embedOrigin,
		);
	});
}
```

- [ ] **Step 3: web-frame 接线**（`plaza-web-frame.tsx`）

加 props `sourceId` / `sourceLabel`；在导航工具栏 `</div>` 之后、`<div className="relative min-h-0 flex-1">` 之前插入：

```tsx
{embedOrigin ? (
	<PlazaAssistant
		sourceId={sourceId}
		sourceLabel={sourceLabel}
		collect={() => requestFrameListings(frameRef.current, embedOrigin)}
	/>
) : null}
```

import 相应补：`PlazaAssistant`、`requestFrameListings`。

- [ ] **Step 4: plaza-view 传参**（`plaza-view.tsx` 的 `PlazaWebFrame` 调用处）

```tsx
<PlazaWebFrame
	homeUrl={source.url}
	embedOrigin={source.embedOrigin?.() ?? null}
	title={plazaSourceLabel(source)}
	sourceId={source.id}
	sourceLabel={plazaSourceLabel(source)}
	className={className}
/>
```

- [ ] **Step 5: 类型检查 + 全量测试**

Run: `pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench exec tsc --noEmit && pnpm --dir D:/Mycraft/tencent-fight/apps/library-workbench vitest run`
Expected: 全绿

- [ ] **Step 6: 手动冒烟**

1. ModelScope 面板（dev 重启使 Rust 桥生效）→ 打开论文列表页 → 提问 → 卡片返回并可入库
2. 在 ModelScope 论文详情页提问 → "当前没有可检索的条目"
3. 前进/后退导航后再次提问正常（frame epoch 重挂不破坏收集）

- [ ] **Step 7: Commit**

```bash
git add src/lib/plaza/assistant src/components/plaza
git commit -m "feat(plaza): AI assistant on embedded modelscope and cool papers frames"
```

---

## Self-Review 结论

- **Spec 覆盖**：五个数据源（3 原生 Task 1/6 + 2 iframe Task 7/8/9）、ACP 复用（Task 4 全文强调同链路）、卡片+导入（Task 5）、i18n（Task 5）、空列表/超时/解析失败/防重复提问边界（Task 3/4/9）——全部有对应 Task
- **占位符**：仅两处"实现时先查现有先例"（设置窗口跳转方式、Input 组件名）——这是避免拍脑袋写错 API 的确认动作，不是逻辑留空
- **类型一致性**：`PlazaListing`/`importPayload`（Task 1 定义，Task 4/5/9 使用）、`requestFrameListings` 签名（Task 9 定义与测试一致）、`runPlazaAsk(sourceId, prompt, onStream)`（Task 4 内部自洽）已交叉核对

## 验证（端到端）

Task 6 Step 5 与 Task 9 Step 6 的手动清单 + 最终 `pnpm vitest run` 全量、`cargo test -p library`、`tsc --noEmit`、`biome check`，然后在 dev 应用里完整走一遍：Skill Store 提问 → 卡片入库；ModelScope 列表页提问 → 卡片入库；详情页提问 → 空列表提示；运行中停止；中英文回答语言跟随设置。
