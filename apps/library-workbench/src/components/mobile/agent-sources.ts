import type {
	AgentDescriptor,
	AgentListResponse,
	CatalogScanResponse,
} from "@/lib/agent/api";

/**
 * Merges the registered agent list with the catalog scan. Custom agents and
 * ready catalog entries that are not registered yet are surfaced so the
 * backend switcher can offer every runnable agent.
 */
export function mergeAgentSources(
	result: AgentListResponse,
	catalog: CatalogScanResponse,
): AgentDescriptor[] {
	const byId = new Map(result.agents.map((agent) => [agent.id, agent]));
	for (const agent of catalog.customAgents) {
		byId.set(agent.id, agent);
	}
	for (const entry of catalog.entries) {
		if (entry.acpStatus !== "ready" || !entry.registeredId) continue;
		if (byId.has(entry.registeredId)) continue;
		byId.set(entry.registeredId, {
			id: entry.registeredId,
			name: entry.acpAgentName ?? entry.name,
			template: entry.templateId as AgentDescriptor["template"],
			command: entry.command,
			args: entry.args,
			env: {},
			available: true,
			lastProbeOk: true,
		});
	}
	return [...byId.values()];
}

/** Keeps the current selection when it still exists, else falls back to defaults. */
export function pickAgentId(
	agents: AgentDescriptor[],
	current: string | null,
	preferred: Array<string | null | undefined>,
): string | null {
	if (current && agents.some((agent) => agent.id === current)) return current;
	for (const id of preferred) {
		if (id) return id;
	}
	return agents.find((agent) => agent.available)?.id ?? agents[0]?.id ?? null;
}
