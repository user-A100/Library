import type { UpdateSnapshot } from "@/lib/update/types";

/**
 * In-app updates are disabled in this build; every entry point reports the
 * unsupported phase so the Settings / indicator UI degrades gracefully.
 */
const UNSUPPORTED: UpdateSnapshot = { phase: "unsupported" };

const listeners = new Set<(next: UpdateSnapshot) => void>();

export function getUpdateSnapshot(): UpdateSnapshot {
	return UNSUPPORTED;
}

export function subscribeUpdate(
	listener: (next: UpdateSnapshot) => void,
): () => void {
	listener(UNSUPPORTED);
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export async function checkForUpdate(): Promise<UpdateSnapshot> {
	return UNSUPPORTED;
}

export async function installAvailableUpdate(): Promise<UpdateSnapshot> {
	return UNSUPPORTED;
}
