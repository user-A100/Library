/**
 * In-memory map from Agent runtime session id → ask threads awaiting the
 * assistant turn (PDF selection → Agent chat → conversation card).
 *
 * Same lifecycle idea as agent-trace pending: remember on send, take on
 * complete/fail, TTL so long-lived sessions cannot leak.
 */

export type PendingAskThreadWrite = {
	paperAbsPath: string;
	threadId: string;
};

type PendingEntry = {
	writes: PendingAskThreadWrite[];
	updatedAt: number;
};

const PENDING_TTL_MS = 60 * 60 * 1000;
const PENDING_MAX_SESSIONS = 64;

const pendingByRuntimeSession = new Map<string, PendingEntry>();

function nowMs(): number {
	return Date.now();
}

function pruneStale(now = nowMs()): void {
	for (const [id, entry] of pendingByRuntimeSession) {
		if (now - entry.updatedAt > PENDING_TTL_MS) {
			pendingByRuntimeSession.delete(id);
		}
	}
	if (pendingByRuntimeSession.size <= PENDING_MAX_SESSIONS) return;
	const ordered = [...pendingByRuntimeSession.entries()].sort(
		(a, b) => a[1].updatedAt - b[1].updatedAt,
	);
	const drop = ordered.length - PENDING_MAX_SESSIONS;
	for (let i = 0; i < drop; i++) {
		const id = ordered[i]?.[0];
		if (id) pendingByRuntimeSession.delete(id);
	}
}

export function rememberPendingAskThreads(
	runtimeSessionId: string,
	writes: PendingAskThreadWrite[],
): void {
	if (!runtimeSessionId || !writes.length) return;
	pruneStale();
	const existing = pendingByRuntimeSession.get(runtimeSessionId);
	pendingByRuntimeSession.set(runtimeSessionId, {
		writes: [...(existing?.writes ?? []), ...writes],
		updatedAt: nowMs(),
	});
}

export function takePendingAskThreads(
	runtimeSessionId: string,
): PendingAskThreadWrite[] {
	const entry = pendingByRuntimeSession.get(runtimeSessionId);
	pendingByRuntimeSession.delete(runtimeSessionId);
	pruneStale();
	return entry?.writes ?? [];
}

/** Test helper — clear maps between unit cases. */
export function resetPendingAskThreadsForTests(): void {
	pendingByRuntimeSession.clear();
}
