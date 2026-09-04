import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	hydrateSessionTitles,
	mergeImportedSessions,
	sanitizeChatLines,
	titleFromLoadedHistory,
} from "@/components/agent/hooks/use-agent-history";
import * as agentApi from "@/lib/agent";
import type { AgentSessionRecord } from "@/lib/agent/agent-session-store";
import type { AcpSessionInfo } from "@/lib/agent/api";

vi.mock("@/lib/agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/agent")>();
	return {
		...actual,
		loadSession: vi.fn(),
	};
});

function makeRecord(
	opts: Partial<AgentSessionRecord> & { id: string },
): AgentSessionRecord {
	return {
		id: opts.id,
		agentId: opts.agentId ?? "agent-1",
		source: opts.source ?? "external",
		title: opts.title ?? "",
		agentName: opts.agentName ?? "Agent",
		startedAt: opts.startedAt ?? "2026/8/21 19:11:00",
		lines: opts.lines ?? [],
		status: opts.status ?? "completed",
		providerSessionId: opts.providerSessionId ?? null,
		...opts,
	};
}

function makeAcpSession(
	opts: Partial<AcpSessionInfo> & { sessionId: string },
): AcpSessionInfo {
	return {
		sessionId: opts.sessionId,
		cwd: opts.cwd ?? "/vault",
		title: opts.title ?? null,
		updatedAt: opts.updatedAt ?? "2026-08-21T19:11:00Z",
		...opts,
	};
}

describe("sanitizeChatLines", () => {
	it("preserves visualAnnotations and images on user turns", () => {
		const lines = [
			{
				id: "l1",
				kind: "user" as const,
				text: "explain",
				visualAnnotations: [
					{
						id: "v1",
						page: 1,
						comment: "region",
						image: { data: "base64", mimeType: "image/png" },
					},
				],
				images: [{ data: "base64", mimeType: "image/png" }],
			},
		];
		const out = sanitizeChatLines(lines);
		expect(out).toHaveLength(1);
		expect(out[0]?.visualAnnotations).toHaveLength(1);
		expect(out[0]?.visualAnnotations?.[0]?.id).toBe("v1");
		expect(out[0]?.images).toHaveLength(1);
	});

	it("drops empty user turns that have no text, visuals, or images", () => {
		const lines = [
			{
				id: "l1",
				kind: "user" as const,
				text: "   ",
			},
		];
		expect(sanitizeChatLines(lines)).toHaveLength(0);
	});

	it("keeps user turns that are visual-only", () => {
		const lines = [
			{
				id: "l1",
				kind: "user" as const,
				text: "",
				visualAnnotations: [
					{
						id: "v1",
						page: 1,
						comment: "region",
						image: { data: "base64", mimeType: "image/png" },
					},
				],
			},
		];
		expect(sanitizeChatLines(lines)).toHaveLength(1);
	});
});

describe("titleFromLoadedHistory", () => {
	it("uses the first user turn when present", () => {
		const history = {
			sessionId: "s1",
			lines: [
				{ id: "l1", kind: "agent" as const, text: "hello" },
				{ id: "l2", kind: "user" as const, text: "summarize this paper" },
			],
		};
		expect(titleFromLoadedHistory(history)).toBe("summarize this paper");
	});

	it("falls back to the ACP-provided title when there is no user turn", () => {
		const history = {
			sessionId: "s1",
			title: "ACP title",
			lines: [{ id: "l1", kind: "agent" as const, text: "hello" }],
		};
		expect(titleFromLoadedHistory(history)).toBe("ACP title");
	});

	it("returns empty string when neither user turn nor ACP title exists", () => {
		const history = {
			sessionId: "s1",
			lines: [{ id: "l1", kind: "agent" as const, text: "hello" }],
		};
		expect(titleFromLoadedHistory(history)).toBe("");
	});
});

describe("mergeImportedSessions", () => {
	it("flags untitled external sessions as hydration candidates", () => {
		const prev: AgentSessionRecord[] = [];
		const chatSessions = [makeAcpSession({ sessionId: "s1", title: null })];

		const { sessions, hydrationCandidates } = mergeImportedSessions(
			prev,
			chatSessions,
			"agent-1",
			"Agent",
			"zh-CN",
		);

		expect(sessions).toHaveLength(1);
		expect(sessions[0].title).toBe("s1");
		expect(hydrationCandidates).toHaveLength(1);
		expect(hydrationCandidates[0].id).toBe("s1");
	});

	it("does not flag titled external sessions", () => {
		const prev: AgentSessionRecord[] = [];
		const chatSessions = [
			makeAcpSession({ sessionId: "s1", title: "Already named" }),
		];

		const { sessions, hydrationCandidates } = mergeImportedSessions(
			prev,
			chatSessions,
			"agent-1",
			"Agent",
			"zh-CN",
		);

		expect(sessions[0].title).toBe("Already named");
		expect(hydrationCandidates).toHaveLength(0);
	});

	it("keeps existing local title when session has lines", () => {
		const prev = [
			makeRecord({
				id: "s1",
				source: "local",
				title: "Local title",
				lines: [
					{
						id: "l1",
						kind: "user" as const,
						text: "local question",
					},
				],
				providerSessionId: "s1",
			}),
		];
		const chatSessions = [makeAcpSession({ sessionId: "s1", title: null })];

		const { sessions, hydrationCandidates } = mergeImportedSessions(
			prev,
			chatSessions,
			"agent-1",
			"Agent",
			"zh-CN",
		);

		expect(sessions[0].title).toBe("Local title");
		expect(hydrationCandidates).toHaveLength(0);
	});

	it("flags existing local sessions without lines when ACP title is empty", () => {
		const prev = [
			makeRecord({
				id: "s1",
				source: "local",
				title: "s1",
				lines: [],
				providerSessionId: "s1",
			}),
		];
		const chatSessions = [makeAcpSession({ sessionId: "s1", title: null })];

		const { sessions, hydrationCandidates } = mergeImportedSessions(
			prev,
			chatSessions,
			"agent-1",
			"Agent",
			"zh-CN",
		);

		expect(sessions[0].title).toBe("s1");
		expect(hydrationCandidates).toHaveLength(1);
		expect(hydrationCandidates[0].id).toBe("s1");
	});
});

describe("hydrateSessionTitles", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("loads untitled sessions and updates their titles", async () => {
		const mockedLoadSession = vi.mocked(agentApi.loadSession);
		mockedLoadSession.mockResolvedValue({
			sessionId: "s1",
			lines: [
				{ id: "l1", kind: "user" as const, text: "what is the main claim?" },
			],
		});

		const setSessionHistory = vi.fn();
		const historyGenRef = { current: 1 };
		const items = [makeRecord({ id: "s1", providerSessionId: "s1" })];

		await hydrateSessionTitles(items, {
			generation: 1,
			historyGenRef,
			selectedAgentId: "agent-1",
			vaultPath: "/vault",
			setSessionHistory,
		});

		expect(mockedLoadSession).toHaveBeenCalledWith({
			agentId: "agent-1",
			sessionId: "s1",
			vaultPath: "/vault",
		});

		expect(setSessionHistory).toHaveBeenCalledTimes(1);
		const updater = setSessionHistory.mock.calls[0][0] as (
			prev: AgentSessionRecord[],
		) => AgentSessionRecord[];
		const next = updater(items);
		expect(next[0].title).toBe("what is the main claim?");
	});

	it("does nothing when generation changes", async () => {
		const mockedLoadSession = vi.mocked(agentApi.loadSession);
		const setSessionHistory = vi.fn();
		const historyGenRef = { current: 2 };

		await hydrateSessionTitles([makeRecord({ id: "s1" })], {
			generation: 1,
			historyGenRef,
			selectedAgentId: "agent-1",
			vaultPath: null,
			setSessionHistory,
		});

		expect(mockedLoadSession).not.toHaveBeenCalled();
		expect(setSessionHistory).not.toHaveBeenCalled();
	});

	it("ignores failed loads silently", async () => {
		const mockedLoadSession = vi.mocked(agentApi.loadSession);
		mockedLoadSession.mockRejectedValue(new Error("network"));

		const setSessionHistory = vi.fn();
		const historyGenRef = { current: 1 };

		await hydrateSessionTitles([makeRecord({ id: "s1" })], {
			generation: 1,
			historyGenRef,
			selectedAgentId: "agent-1",
			vaultPath: null,
			setSessionHistory,
		});

		expect(mockedLoadSession).toHaveBeenCalledTimes(1);
		expect(setSessionHistory).not.toHaveBeenCalled();
	});
});
