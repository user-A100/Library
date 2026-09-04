import { bridgeRpc } from "@/lib/bridge/client";
import {
	type BridgeFileVersion,
	getCachedBridgeFile,
	putCachedBridgeFile,
} from "@/lib/bridge/file-cache";

export const BRIDGE_READ_CHUNK_BYTES = 256 * 1024;

const pendingPdfLoads = new Map<string, Promise<Blob>>();

type BridgeReadBytesResult = {
	file: BridgeFileVersion;
	offset: number;
	bytesB64: string;
};

function decodeBase64Url(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	const binary = atob(padded);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function fetchBridgePaperPdf(paperPath: string): Promise<Blob> {
	const file = await bridgeRpc<BridgeFileVersion>("bridge_paper_pdf_info", {
		paperPath,
	});
	const cached = await getCachedBridgeFile(file);
	if (cached) return cached;

	const chunks: Uint8Array[] = [];
	let offset = 0;
	while (offset < file.size) {
		const result = await bridgeRpc<BridgeReadBytesResult>("bridge_read_bytes", {
			path: file.path,
			offset,
			len: BRIDGE_READ_CHUNK_BYTES,
		});
		if (
			result.offset !== offset ||
			result.file.size !== file.size ||
			result.file.modifiedAt !== file.modifiedAt ||
			result.file.sha256 !== file.sha256
		) {
			throw new Error("The desktop PDF changed while it was being downloaded");
		}
		const chunk = decodeBase64Url(result.bytesB64);
		if (chunk.byteLength === 0) {
			throw new Error("The desktop PDF ended before the advertised size");
		}
		chunks.push(chunk);
		offset += chunk.byteLength;
	}
	const blob = new Blob(chunks, { type: "application/pdf" });
	await putCachedBridgeFile(file, blob);
	return blob;
}

/** Fetch a paper PDF over the paired Bridge, preferring the app-sandbox cache. */
export function loadBridgePaperPdf(paperPath: string): Promise<Blob> {
	const existing = pendingPdfLoads.get(paperPath);
	if (existing) return existing;
	const pending = fetchBridgePaperPdf(paperPath).finally(() => {
		pendingPdfLoads.delete(paperPath);
	});
	pendingPdfLoads.set(paperPath, pending);
	return pending;
}

export const bridgePdfTest = { decodeBase64Url };
