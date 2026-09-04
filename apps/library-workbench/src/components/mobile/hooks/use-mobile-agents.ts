import { useCallback, useEffect, useState } from "react";
import {
	mergeAgentSources,
	pickAgentId,
} from "@/components/mobile/agent-sources";
import type {
	AgentDescriptor,
	AgentListResponse,
	CatalogScanResponse,
} from "@/lib/agent/api";
import { bridgeRpc } from "@/lib/bridge/client";

/**
 * Loads the runnable agent list (registered agents + catalog scan) when the
 * agent tab is active and maintains the selected backend id.
 */
export function useMobileAgents({
	paired,
	connected,
	agentVisible,
}: {
	paired: boolean;
	connected: boolean;
	agentVisible: boolean;
}) {
	const [agents, setAgents] = useState<AgentDescriptor[]>([]);
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!paired) {
			setAgents([]);
			setSelectedAgentId(null);
			return;
		}
		if (!connected || !agentVisible) return;
		let active = true;
		setLoading(true);
		void Promise.all([
			bridgeRpc<AgentListResponse>("agent_list_agents"),
			bridgeRpc<CatalogScanResponse>("agent_scan_catalog"),
		])
			.then(([result, catalog]) => {
				if (!active) return;
				const nextAgents = mergeAgentSources(result, catalog);
				setAgents(nextAgents);
				setSelectedAgentId((current) =>
					pickAgentId(nextAgents, current, [
						result.defaultId,
						catalog.defaultId,
					]),
				);
			})
			.catch(() => {
				if (active) setAgents([]);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [agentVisible, connected, paired]);

	/** Switches the backend; the caller is responsible for resetting the session. */
	const selectAgent = useCallback((agentId: string) => {
		setSelectedAgentId(agentId);
	}, []);

	const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);

	return {
		agents,
		loading,
		selectedAgent,
		selectedAgentId,
		selectAgent,
	};
}
