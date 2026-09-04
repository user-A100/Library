/**
 * In-memory map from Agent runtime session id → traces awaiting completion.
 * Used so complete/fail handlers can patch answerSnapshot / providerSessionId.
 *
 * Lifecycle:
 * - remember on successful send (after marks are written)
 * - take on complete / fail / cancel
 * - prune orphans by age / max size so long-lived app sessions cannot leak
 * - after take, keep a short grace window so concurrent list+reconcile does not
 *   mark a just-finalizing pin as "interrupted"
 */

export type PendingVisualTraceWrite = {
	paperAbsPath: string;
	traceId: string;
};

type PendingEntry = {
	writes: PendingVisualTraceWrite[];
	/** Wall time when the entry was first remembered (or last extended). */
	updatedAt: number;
};

/** Drop pending sessions older than this (ms). Long Agent runs still re-touch via remember merge. */
const PENDING_TTL_MS = 60 * 60 * 1000; // 1h
/** Soft cap on concurrent pending sessions (LRU by updatedAt). */
const PENDING_MAX_SESSIONS = 64;
/** After take(), treat session as still "active" this long so reconcile races cannot fail a completing mark. */
const FINALIZE_GRACE_MS = 30_000;

const pendingByRuntimeSession = new Map<string, PendingEntry>();
/** sessionId → when take() ran (grace against list/reconcile races). */
const recentlyTakenAt = new Map<string, number>();

function nowMs(): number {
	return Date.now();
}

function pruneStale(now = nowMs()): void {
	for (const [id, entry] of pendingByRuntimeSession) {
		if (now - entry.updatedAt > PENDING_TTL_MS) {
			pendingByRuntimeSession.delete(id);
		}
	}
	for (const [id, at] of recentlyTakenAt) {
		if (now - at > FINALIZE_GRACE_MS) {
			recentlyTakenAt.delete(id);
		}
	}
	// LRU-ish: drop oldest pending sessions when over the soft cap.
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

export function rememberPendingVisualTraces(
	runtimeSessionId: string,
	writes: PendingVisualTraceWrite[],
): void {
	if (!runtimeSessionId || !writes.length) return;
	pruneStale();
	const existing = pendingByRuntimeSession.get(runtimeSessionId);
	pendingByRuntimeSession.set(runtimeSessionId, {
		writes: [...(existing?.writes ?? []), ...writes],
		updatedAt: nowMs(),
	});
}

export function takePendingVisualTraces(
	runtimeSessionId: string,
): PendingVisualTraceWrite[] {
	const entry = pendingByRuntimeSession.get(runtimeSessionId);
	pendingByRuntimeSession.delete(runtimeSessionId);
	const writes = entry?.writes ?? [];
	if (writes.length) {
		recentlyTakenAt.set(runtimeSessionId, nowMs());
	}
	pruneStale();
	return writes;
}

/** True while a runtime session still owns pending mark finalizers (or just took them). */
export function isVisualTraceSessionPending(runtimeSessionId: string): boolean {
	if (!runtimeSessionId) return false;
	pruneStale();
	if (pendingByRuntimeSession.has(runtimeSessionId)) return true;
	const takenAt = recentlyTakenAt.get(runtimeSessionId);
	return takenAt != null && nowMs() - takenAt < FINALIZE_GRACE_MS;
}

/** Test helper — clear maps between unit cases. */
export function resetPendingVisualTracesForTests(): void {
	pendingByRuntimeSession.clear();
	recentlyTakenAt.clear();
}
