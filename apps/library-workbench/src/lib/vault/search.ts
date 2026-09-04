/**
 * Vault-wide full-text Markdown search via Host `vault_search`.
 * Powers the command palette's "In contents" tier (see command-palette.tsx).
 */

import { track } from "@/lib/activity";
import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";

export type SearchHit = {
	/** Vault-relative md file, e.g. papers/x/NOTES.md */
	path: string;
	/** Vault-relative paper folder when the hit is inside papers/… */
	paperPath?: string;
	title: string;
	snippet: string;
	/** 1-based line of the first match (0 when unknown). */
	line: number;
	score: number;
};

export type VaultSearchResult = {
	hits: SearchHit[];
	truncated: boolean;
};

const EMPTY: VaultSearchResult = { hits: [], truncated: false };

/** Full-text search over the Vault's Markdown files. Returns empty off-desktop. */
export async function searchVault(opts: {
	vaultPath: string;
	query: string;
	limit?: number;
}): Promise<VaultSearchResult> {
	if (!isTauri()) return EMPTY;
	const query = opts.query.trim();
	if (!query) return EMPTY;
	const result = await invokeApi<VaultSearchResult>(
		"vault_search",
		{ args: { vaultPath: opts.vaultPath, query, limit: opts.limit } },
		{ fallback: "vault_search failed" },
	);
	track("search.query", {
		extra: { q: query, hits: result.hits.length, truncated: result.truncated },
	});
	return result;
}
