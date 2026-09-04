import { describe, expect, it } from "vitest";

import {
	evictAgentTranslateSessionId,
	getAgentTranslateSessionId,
	setAgentTranslateSessionId,
} from "@/lib/pdf/translate/agent-session-cache";

describe("agent translate session cache", () => {
	it("builds keys that include paper, agent and model", () => {
		const paperKey = "papers/1706.03762";
		const agentId = "codex-1";
		const modelId = "o4-mini";

		expect(
			getAgentTranslateSessionId(paperKey, agentId, modelId),
		).toBeUndefined();

		setAgentTranslateSessionId(paperKey, agentId, modelId, "provider-thread-1");
		expect(getAgentTranslateSessionId(paperKey, agentId, modelId)).toBe(
			"provider-thread-1",
		);

		// Same paper + agent but different model should be a separate entry.
		expect(
			getAgentTranslateSessionId(paperKey, agentId, "other-model"),
		).toBeUndefined();
		// Same paper + model but different agent should be a separate entry.
		expect(
			getAgentTranslateSessionId(paperKey, "claude-1", modelId),
		).toBeUndefined();

		evictAgentTranslateSessionId(paperKey, agentId, modelId);
		expect(
			getAgentTranslateSessionId(paperKey, agentId, modelId),
		).toBeUndefined();
	});

	it("treats undefined modelId as a distinct key", () => {
		const paperKey = "papers/xyz";
		const agentId = "claude-1";

		setAgentTranslateSessionId(paperKey, agentId, undefined, "provider-a");
		expect(getAgentTranslateSessionId(paperKey, agentId, undefined)).toBe(
			"provider-a",
		);
		expect(getAgentTranslateSessionId(paperKey, agentId, "m1")).toBeUndefined();

		evictAgentTranslateSessionId(paperKey, agentId, undefined);
	});

	it("overwrites an existing value for the same key", () => {
		const paperKey = "papers/overwrite";
		const agentId = "codex-1";

		setAgentTranslateSessionId(paperKey, agentId, undefined, "first");
		expect(getAgentTranslateSessionId(paperKey, agentId, undefined)).toBe(
			"first",
		);

		setAgentTranslateSessionId(paperKey, agentId, undefined, "second");
		expect(getAgentTranslateSessionId(paperKey, agentId, undefined)).toBe(
			"second",
		);

		evictAgentTranslateSessionId(paperKey, agentId, undefined);
	});

	it("does not retain empty or whitespace provider ids", () => {
		const paperKey = "papers/empty";
		const agentId = "codex-1";

		setAgentTranslateSessionId(paperKey, agentId, undefined, "");
		expect(
			getAgentTranslateSessionId(paperKey, agentId, undefined),
		).toBeUndefined();

		setAgentTranslateSessionId(paperKey, agentId, undefined, "   ");
		expect(
			getAgentTranslateSessionId(paperKey, agentId, undefined),
		).toBeUndefined();
	});

	it("evicts the oldest entries when the cache grows past the limit", () => {
		const agentId = "codex-1";
		const ids: string[] = [];
		for (let i = 0; i < 55; i += 1) {
			const paperKey = `papers/lru-${i}`;
			const id = `provider-${i}`;
			ids.push(id);
			setAgentTranslateSessionId(paperKey, agentId, undefined, id);
		}

		// The first 5 entries should have been evicted.
		for (let i = 0; i < 5; i += 1) {
			expect(
				getAgentTranslateSessionId(`papers/lru-${i}`, agentId, undefined),
			).toBeUndefined();
		}

		// The remaining entries should still be present.
		for (let i = 5; i < 55; i += 1) {
			expect(
				getAgentTranslateSessionId(`papers/lru-${i}`, agentId, undefined),
			).toBe(`provider-${i}`);
		}

		// Clean up.
		for (let i = 5; i < 55; i += 1) {
			evictAgentTranslateSessionId(`papers/lru-${i}`, agentId, undefined);
		}
	});
});
