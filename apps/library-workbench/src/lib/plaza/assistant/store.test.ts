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
	sourceId: "skills",
	id: "a/b",
	title: "a/b",
	kind: "skill",
	importPayload: null,
};

beforeEach(() => {
	runPlazaAskMock.mockReset();
	resetPlazaAsk("skills");
});

describe("plazaAssistantStore.askPlaza", () => {
	it("errors with emptyListings and never calls the agent when collect returns []", async () => {
		await askPlaza({
			sourceId: "skills",
			sourceLabel: "Skill Store",
			question: "q",
			collect: async () => [],
		});
		expect(runPlazaAskMock).not.toHaveBeenCalled();
		expect(usePlazaAssistantStoreState().sessions.skills?.error).toBe(
			"emptyListings",
		);
	});

	it("runs, streams, and parses cards on success", async () => {
		runPlazaAskMock.mockImplementation(
			async (_id: string, _p: string, onStream: (d: string) => void) => {
				onStream("partial");
				return {
					answer:
						'```json\n{"recommendations":[{"index":1,"reason":"r"}]}\n```\ndone',
					cancelled: false,
				};
			},
		);
		await askPlaza({
			sourceId: "skills",
			sourceLabel: "Skill Store",
			question: "q",
			collect: async () => [listing],
		});
		const session = usePlazaAssistantStoreState().sessions.skills;
		expect(session?.status).toBe("done");
		expect(session?.cards).toHaveLength(1);
		expect(session?.cards[0]?.reason).toBe("r");
		expect(session?.streamText).toContain("partial");
	});

	it("guards against double ask while busy", async () => {
		runPlazaAskMock.mockImplementation(() => new Promise(() => {})); // never settles
		const first = askPlaza({
			sourceId: "skills",
			sourceLabel: "S",
			question: "q1",
			collect: async () => [listing],
		});
		await askPlaza({
			sourceId: "skills",
			sourceLabel: "S",
			question: "q2",
			collect: async () => [listing],
		});
		expect(runPlazaAskMock).toHaveBeenCalledTimes(1);
		void first;
	});

	it("records agent errors", async () => {
		runPlazaAskMock.mockResolvedValue({
			answer: "",
			cancelled: false,
			error: "boom",
		});
		await askPlaza({
			sourceId: "skills",
			sourceLabel: "S",
			question: "q",
			collect: async () => [listing],
		});
		expect(usePlazaAssistantStoreState().sessions.skills?.status).toBe("error");
		expect(usePlazaAssistantStoreState().sessions.skills?.error).toBe("boom");
	});
});

void IDLE_ASK_SESSION;
