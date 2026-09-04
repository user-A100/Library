/**
 * Refresh the library (debounced, quiet) when JobCenter jobs that mutate the
 * catalog or assets settle. The file watcher already refreshes the tree for
 * on-disk changes; catalog edits (e.g. `body_source` after a download or
 * `PAPER.md` parse) are watcher-ignored, so the library needs this nudge.
 *
 * Stays on raw `job:changed` rather than the `job:completed` / `job:failed`
 * lifecycle events because `cancelled` and `skipped` also count as settled
 * here, and those have no lifecycle event.
 */

import type {
	JobChangedSnapshot,
	JobKind,
	JobState,
} from "@/lib/core/job-center";
import { listenSafe } from "@/lib/core/tauri-events";
import { scheduleLibraryRefresh } from "@/lib/paper/library-store";

const REFRESH_ON_KINDS: ReadonlySet<JobKind> = new Set([
	"downloadAssets",
	"parseBody",
	// Recognition upserts metadata (and may rename/merge folders) — the
	// library rows need the refetch when the job settles.
	"recognizeMetadata",
]);

function isTerminalJobState(state: JobState): boolean {
	return (
		state === "succeeded" ||
		state === "failed" ||
		state === "cancelled" ||
		state === "skipped"
	);
}

/** Caller owns the returned disposer. */
export function startJobCompletionRefresh(): () => void {
	return listenSafe<{ job: JobChangedSnapshot }>("job:changed", ({ job }) => {
		if (!REFRESH_ON_KINDS.has(job.kind)) return;
		if (!isTerminalJobState(job.state)) return;
		scheduleLibraryRefresh();
	});
}
