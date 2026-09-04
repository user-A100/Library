import { describe, expect, it } from "vitest";
import {
	mergeAgentSources,
	pickAgentId,
} from "@/components/mobile/agent-sources";
import type {
	AgentDescriptor,
	AgentListResponse,
	CatalogScanResponse,
} from "@/lib/agent/api";

function agent(overrides: Partial<AgentDescriptor> = {}): AgentDescriptor {
	return {
		id: "agent-a",
		name: "Agent A",
		template: "claude",
		command: "claude",
		args: [],
		env: {},
		available: true,
		...overrides,
	};
}

function list(overrides: Partial<AgentListResponse> = {}): AgentListResponse {
	return { agents: [], defaultId: null, enabled: true, ...overrides };
}

function catalog(
	overrides: Partial<CatalogScanResponse> = {},
): CatalogScanResponse {
	return {
		entries: [],
		customAgents: [],
		defaultId: null,
		enabled: true,
		proxyEnabled: false,
		proxyUrl: "",
		...overrides,
	};
}

describe("mergeAgentSources", () => {
	it("keeps registered agents and merges custom agents by id", () => {
		const custom = agent({ id: "custom-1", name: "Custom" });
		const merged = mergeAgentSources(
			list({ agents: [agent()] }),
			catalog({ customAgents: [custom] }),
		);
		expect(merged.map((entry) => entry.id)).toEqual(["agent-a", "custom-1"]);
	});

	it("surfaces ready catalog entries that are not registered", () => {
		const merged = mergeAgentSources(
			list(),
			catalog({
				entries: [
					{
						templateId: "codex",
						name: "Codex",
						description: "",
						command: "codex",
						args: ["acp"],
						installHint: "",
						binaryAvailable: true,
						acpCommandAvailable: true,
						acpStatus: "ready",
						registeredId: "codex-acp",
						isDefault: false,
						acpAgentName: "Codex ACP",
					},
				],
			}),
		);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toMatchObject({
			id: "codex-acp",
			name: "Codex ACP",
			command: "codex",
			args: ["acp"],
			available: true,
		});
	});

	it("skips catalog entries that are not ready or already registered", () => {
		const registered = agent({ id: "codex-acp" });
		const merged = mergeAgentSources(
			list({ agents: [registered] }),
			catalog({
				entries: [
					{
						templateId: "codex",
						name: "Codex",
						description: "",
						command: "codex",
						args: [],
						installHint: "",
						binaryAvailable: true,
						acpCommandAvailable: false,
						acpStatus: "ready",
						registeredId: "codex-acp",
						isDefault: false,
					},
					{
						templateId: "claude",
						name: "Claude",
						description: "",
						command: "claude",
						args: [],
						installHint: "",
						binaryAvailable: false,
						acpCommandAvailable: false,
						acpStatus: "missing",
						registeredId: "claude-acp",
						isDefault: false,
					},
				],
			}),
		);
		expect(merged.map((entry) => entry.id)).toEqual(["codex-acp"]);
	});
});

describe("pickAgentId", () => {
	const agents = [
		agent({ id: "a", available: false }),
		agent({ id: "b", available: true }),
	];

	it("keeps the current selection when it still exists", () => {
		expect(pickAgentId(agents, "a", ["b"])).toBe("a");
	});

	it("prefers the provided defaults in order", () => {
		expect(pickAgentId(agents, null, [null, "a"])).toBe("a");
	});

	it("falls back to the first available agent", () => {
		expect(pickAgentId(agents, null, [])).toBe("b");
	});

	it("falls back to the first agent when none is available", () => {
		const unavailable = [agent({ id: "a", available: false })];
		expect(pickAgentId(unavailable, null, [])).toBe("a");
	});

	it("returns preferred ids as-is even when absent from the list", () => {
		expect(pickAgentId([], "gone", ["also-gone"])).toBe("also-gone");
	});

	it("returns null without any candidate", () => {
		expect(pickAgentId([], null, [null])).toBeNull();
	});
});
