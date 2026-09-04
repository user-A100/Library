/**
 * Enqueue liteparse PDF → PAPER.md as a JobCenter `parseBody` job.
 *
 * The `job:changed` projection owns the tasks-panel row, progress, and
 * cancellation (§7.4 入口②). Omitting `taskId` lets the runner default it to
 * the job id, so the worker's `background-task:progress` events route to the
 * projected row.
 */

import { errorText } from "@/lib/core/error";
import { invokeApi } from "@/lib/core/ipc";
import { logger } from "@/lib/core/logger";

const queuedPapers = new Set<string>();

function normalizePaperKey(vaultPath: string, paperRelPath: string): string {
	return `${vaultPath.replace(/[/\\]+$/, "")}:${paperRelPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")}`;
}

export type EnqueuePaperPdfParseOptions = {
	vaultPath: string;
	paperRelPath: string;
	paperLabel?: string;
};

/**
 * Ensure PAPER.md is generated for a paper folder. No-op when a job for this
 * paper is already queued this session.
 */
export function enqueuePaperPdfParse(opts: EnqueuePaperPdfParseOptions): void {
	const vaultPath = opts.vaultPath.trim();
	const paperRelPath = opts.paperRelPath.trim().replace(/\\/g, "/");
	if (!vaultPath || !paperRelPath) return;

	const key = normalizePaperKey(vaultPath, paperRelPath);
	if (queuedPapers.has(key)) return;
	queuedPapers.add(key);

	void (async () => {
		try {
			await invokeApi(
				"job_parse_body_enqueue",
				{
					args: {
						vaultPath,
						path: paperRelPath,
						force: false,
					},
				},
				{ fallback: "PDF body parse failed" },
			);
		} catch (e) {
			logger.warn("enqueue paper pdf parse failed", {
				vaultPath,
				paperRelPath,
				error: errorText(e),
			});
		} finally {
			queuedPapers.delete(key);
		}
	})();
}
