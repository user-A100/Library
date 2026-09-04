/**
 * Per-paper durable ACP session id cache for Agent-backed PDF translations.
 *
 * Selection translate and layout bulk translate share this cache so that all
 * translations for one paper reuse the same provider session until the Agent or
 * model changes, the session fails, or the LRU bound evicts it.
 */

const MAX_ENTRIES = 50;

const cache = new Map<string, string>();

function buildKey(
	paperKey: string | null | undefined,
	agentId: string,
	modelId: string | null | undefined,
): string {
	return JSON.stringify([paperKey ?? "", agentId, modelId ?? ""]);
}

export function getAgentTranslateSessionId(
	paperKey: string | null | undefined,
	agentId: string,
	modelId?: string | null,
): string | undefined {
	if (!paperKey) return undefined;
	return cache.get(buildKey(paperKey, agentId, modelId));
}

export function setAgentTranslateSessionId(
	paperKey: string | null | undefined,
	agentId: string,
	modelId: string | null | undefined,
	providerSessionId: string,
): void {
	if (!paperKey) return;
	const id = providerSessionId.trim();
	if (!id) return;
	const key = buildKey(paperKey, agentId, modelId);
	// Re-insert to move to the MRU side.
	cache.delete(key);
	cache.set(key, id);
	while (cache.size > MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (typeof oldest === "string") {
			cache.delete(oldest);
		} else {
			break;
		}
	}
}

export function evictAgentTranslateSessionId(
	paperKey: string | null | undefined,
	agentId: string,
	modelId?: string | null,
): void {
	if (!paperKey) return;
	cache.delete(buildKey(paperKey, agentId, modelId));
}
