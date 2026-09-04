import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";

export type ActivityRecord = {
	ts?: string;
	vault?: string;
	kind: string;
	path?: string;
	mode?: string;
	durMs?: number;
	extra?: Record<string, unknown>;
};

export type UsageEvent = {
	id: number;
	ts: string;
	vault: string | null;
	kind: string;
	path: string | null;
	paperPath?: string | null;
	mode: string | null;
	facet?: string | null;
	status?: string | null;
	durMs: number | null;
	qty?: number | null;
	extra: Record<string, unknown> | null;
};

export type UsageKindCount = {
	kind: string;
	count: number;
	durMs: number;
};

export async function recordActivityEvents(
	events: ActivityRecord[],
): Promise<number> {
	if (!isTauri() || events.length === 0) return 0;
	return invokeApi<number>(
		"activity_record_events",
		{ args: { events } },
		{ fallback: "activity_record_events failed" },
	);
}

export async function listUsageEvents(opts?: {
	vault?: string;
	kind?: string;
	path?: string;
	since?: string;
	limit?: number;
}): Promise<UsageEvent[]> {
	if (!isTauri()) return [];
	return invokeApi<UsageEvent[]>(
		"usage_list",
		{ args: opts ?? {} },
		{ fallback: "usage_list failed" },
	);
}

export async function summarizeUsage(opts?: {
	vault?: string;
	since?: string;
}): Promise<UsageKindCount[]> {
	if (!isTauri()) return [];
	return invokeApi<UsageKindCount[]>(
		"usage_summary",
		{ args: opts ?? {} },
		{ fallback: "usage_summary failed" },
	);
}

export async function clearUsage(vault?: string): Promise<number> {
	if (!isTauri()) return 0;
	return invokeApi<number>(
		"usage_clear",
		{ args: { vault } },
		{ fallback: "usage_clear failed" },
	);
}
