import { isTauri } from "@/lib/core/tauri";
import {
	deleteMarkFile,
	listMarkRaw,
	readMarkRaw,
	writeMarkFile,
} from "@/lib/pdf/selection/marks-io";

export type MarkStoreOptions<T extends { id: string }> = {
	parse: (raw: unknown) => T | null;
	sort: (a: T, b: T) => number;
	/** Transform an item before writing (e.g. refresh timestamps / enforce kind). */
	prepareWrite?: (item: T) => T;
	/** Also guard against empty ids in delete (translate is stricter). */
	requireIdOnDelete?: boolean;
	/** Skip the in-memory fallback (useful for legacy read-only consumers). */
	noMemory?: boolean;
};

export function createMarkStore<T extends { id: string }>(
	opts: MarkStoreOptions<T>,
) {
	const memoryStore = new Map<string, Map<string, T>>();

	function memoryBucket(paperAbsPath: string): Map<string, T> {
		let b = memoryStore.get(paperAbsPath);
		if (!b) {
			b = new Map();
			memoryStore.set(paperAbsPath, b);
		}
		return b;
	}

	async function list(paperAbsPath: string): Promise<T[]> {
		if (!paperAbsPath) return [];
		if (!isTauri()) {
			if (opts.noMemory) return [];
			return Array.from(memoryBucket(paperAbsPath).values()).sort(opts.sort);
		}
		const items: T[] = [];
		for (const raw of await listMarkRaw(paperAbsPath)) {
			const parsed = opts.parse(raw);
			if (parsed) items.push(parsed);
		}
		items.sort(opts.sort);
		return items;
	}

	async function read(paperAbsPath: string, id: string): Promise<T | null> {
		if (!isTauri()) {
			return memoryBucket(paperAbsPath).get(id) ?? null;
		}
		const raw = await readMarkRaw(paperAbsPath, id);
		return raw ? opts.parse(raw) : null;
	}

	async function write(paperAbsPath: string, item: T): Promise<void> {
		const next = opts.prepareWrite ? opts.prepareWrite(item) : item;
		if (!isTauri()) {
			memoryBucket(paperAbsPath).set(next.id, next);
			return;
		}
		await writeMarkFile(paperAbsPath, next.id, next);
	}

	async function remove(paperAbsPath: string, id: string): Promise<void> {
		if (!paperAbsPath) return;
		if (opts.requireIdOnDelete && !id) return;
		if (!isTauri()) {
			memoryBucket(paperAbsPath).delete(id);
			return;
		}
		await deleteMarkFile(paperAbsPath, id);
	}

	return { list, read, write, remove };
}
