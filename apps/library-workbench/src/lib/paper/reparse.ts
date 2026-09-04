import { invokeApi } from "@/lib/core/ipc";

export type ParseResultScope = "layout" | "paper" | "all";

export type ClearParseResultsResult = {
	papersScanned: number;
	filesRemoved: number;
};

export type ClearAndReparseResult = ClearParseResultsResult & {
	layoutEnqueued: number;
	paperEnqueued: number;
};

export async function clearParseResults(
	vaultPath: string,
	scope: ParseResultScope,
): Promise<ClearParseResultsResult> {
	return invokeApi<ClearParseResultsResult>(
		"clear_parse_results",
		{ args: { vaultPath, scope } },
		{ fallback: "Failed to clear parse results" },
	);
}

export async function clearAndReparse(
	vaultPath: string,
	scope: ParseResultScope,
): Promise<ClearAndReparseResult> {
	return invokeApi<ClearAndReparseResult>(
		"clear_and_reparse",
		{ args: { vaultPath, scope } },
		{ fallback: "Failed to clear and reparse" },
	);
}
