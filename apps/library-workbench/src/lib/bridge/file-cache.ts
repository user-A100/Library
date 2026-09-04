const DB_NAME = "agentero-bridge-files";
const STORE_NAME = "files";
const MAX_CACHE_BYTES = 512 * 1024 * 1024;

export type BridgeFileVersion = {
	path: string;
	size: number;
	modifiedAt: number;
	sha256: string;
};

type CachedFile = BridgeFileVersion & {
	key: string;
	blob: Blob;
	accessedAt: number;
};

function cacheKey(file: BridgeFileVersion): string {
	return `bridge-file:${file.path}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === "undefined") return Promise.resolve(null);
	return new Promise((resolve) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE_NAME)) {
				request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
	});
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("IndexedDB request failed"));
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error("IndexedDB transaction failed"));
		transaction.onabort = () =>
			reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
	});
}

function matchesVersion(cached: CachedFile, file: BridgeFileVersion): boolean {
	return (
		cached.size === file.size &&
		cached.modifiedAt === file.modifiedAt &&
		cached.sha256 === file.sha256
	);
}

/** Read a versioned Bridge file from the WebView's app-sandbox cache. */
export async function getCachedBridgeFile(
	file: BridgeFileVersion,
): Promise<Blob | null> {
	const database = await openDatabase();
	if (!database) return null;
	try {
		const read = database.transaction(STORE_NAME, "readonly");
		const cached = (await requestResult(
			read.objectStore(STORE_NAME).get(cacheKey(file)),
		)) as CachedFile | undefined;
		await transactionDone(read);
		if (!cached || !matchesVersion(cached, file)) return null;

		const write = database.transaction(STORE_NAME, "readwrite");
		write.objectStore(STORE_NAME).put({ ...cached, accessedAt: Date.now() });
		await transactionDone(write);
		return cached.blob;
	} catch {
		return null;
	} finally {
		database.close();
	}
}

/** Persist a Bridge file and evict least-recently-used entries over 512 MiB. */
export async function putCachedBridgeFile(
	file: BridgeFileVersion,
	blob: Blob,
): Promise<void> {
	const database = await openDatabase();
	if (!database) return;
	try {
		const write = database.transaction(STORE_NAME, "readwrite");
		write.objectStore(STORE_NAME).put({
			...file,
			key: cacheKey(file),
			blob,
			accessedAt: Date.now(),
		} satisfies CachedFile);
		await transactionDone(write);

		const read = database.transaction(STORE_NAME, "readonly");
		const entries = (await requestResult(
			read.objectStore(STORE_NAME).getAll(),
		)) as CachedFile[];
		await transactionDone(read);
		let total = entries.reduce((sum, entry) => sum + entry.size, 0);
		if (total <= MAX_CACHE_BYTES) return;

		const prune = database.transaction(STORE_NAME, "readwrite");
		for (const entry of entries.sort((a, b) => a.accessedAt - b.accessedAt)) {
			if (total <= MAX_CACHE_BYTES) break;
			prune.objectStore(STORE_NAME).delete(entry.key);
			total -= entry.size;
		}
		await transactionDone(prune);
	} catch {
		// Cache failures must never prevent a paired desktop PDF from opening.
	} finally {
		database.close();
	}
}
