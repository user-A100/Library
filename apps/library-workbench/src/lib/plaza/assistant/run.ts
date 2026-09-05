import {
	cancelAgentRun,
	listenAgentCompleted,
	listenAgentFailed,
	listenAgentStream,
	runOnce,
	type RunOnceAccepted,
} from "@/lib/agent";
import { errorText } from "@/lib/core/error";

export type PlazaAskResult = {
	answer: string;
	cancelled: boolean;
	error?: string;
};

/** Per-sourceId cancel handles for in-flight assistant runs. */
const cancellers = new Map<string, () => void>();

/** Cancel the in-flight run for a source (no-op when idle). */
export function cancelPlazaAsk(sourceId: string): void {
	cancellers.get(sourceId)?.();
}

/**
 * One-shot ACP run for a plaza assistant question — the same
 * `runOnce` → `agent_run_once` → ACP agent chain paper-reader uses.
 * Resolves with the final answer text (or the streamed prefix when
 * cancelled / failed).
 */
export async function runPlazaAsk(
	sourceId: string,
	prompt: string,
	onStream: (delta: string) => void,
): Promise<PlazaAskResult> {
	const accepted: RunOnceAccepted = await runOnce({
		prompt,
		workflow: "plaza_ask",
		autoApprove: true,
		hideFromChatHistory: true,
	});
	const sessionId = accepted.sessionId;

	return new Promise<PlazaAskResult>((resolve) => {
		let settled = false;
		let stream = "";
		const unsubs: Array<() => void> = [];
		const finish = (result: PlazaAskResult) => {
			if (settled) return;
			settled = true;
			cancellers.delete(sourceId);
			for (const u of unsubs) {
				try {
					u();
				} catch {
					// ignore
				}
			}
			resolve(result);
		};
		cancellers.set(sourceId, () => {
			void cancelAgentRun(sessionId).catch(() => {});
			finish({ answer: stream, cancelled: true });
		});
		void (async () => {
			try {
				unsubs.push(
					await listenAgentStream((ev) => {
						if (ev.sessionId !== sessionId || ev.kind === "thought") return;
						stream += ev.chunk;
						onStream(ev.chunk);
					}),
				);
				unsubs.push(
					await listenAgentCompleted((ev) => {
						if (ev.sessionId !== sessionId) return;
						finish({ answer: ev.content || stream, cancelled: false });
					}),
				);
				unsubs.push(
					await listenAgentFailed((ev) => {
						if (ev.sessionId !== sessionId) return;
						finish({
							answer: stream,
							cancelled: false,
							error: ev.error || "agent failed",
						});
					}),
				);
			} catch (e) {
				finish({ answer: stream, cancelled: false, error: errorText(e) });
			}
		})();
	});
}
