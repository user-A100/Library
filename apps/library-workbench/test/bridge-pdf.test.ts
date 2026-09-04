import { beforeEach, describe, expect, it, vi } from "vitest";

const { bridgeRpc, getCachedBridgeFile, putCachedBridgeFile } = vi.hoisted(
	() => ({
		bridgeRpc: vi.fn(),
		getCachedBridgeFile: vi.fn(),
		putCachedBridgeFile: vi.fn(),
	}),
);

vi.mock("@/lib/bridge/client", () => ({ bridgeRpc }));
vi.mock("@/lib/bridge/file-cache", () => ({
	getCachedBridgeFile,
	putCachedBridgeFile,
}));

import { bridgePdfTest, loadBridgePaperPdf } from "@/lib/bridge/pdf";

describe("Bridge PDF chunks", () => {
	beforeEach(() => {
		bridgeRpc.mockReset();
		getCachedBridgeFile.mockReset();
		putCachedBridgeFile.mockReset();
	});

	it("decodes URL-safe base64 chunks without padding", () => {
		const bytes = bridgePdfTest.decodeBase64Url("AAH-_w");
		expect([...bytes]).toEqual([0, 1, 254, 255]);
	});

	it("uses the versioned cache before downloading any chunks", async () => {
		const file = {
			path: "papers/example/source.pdf",
			size: 5,
			modifiedAt: 1,
			sha256: "abc",
		};
		const cached = new Blob(["hello"], { type: "application/pdf" });
		bridgeRpc.mockResolvedValue(file);
		getCachedBridgeFile.mockResolvedValue(cached);

		await expect(loadBridgePaperPdf("papers/example")).resolves.toBe(cached);
		expect(bridgeRpc).toHaveBeenCalledTimes(1);
		expect(putCachedBridgeFile).not.toHaveBeenCalled();
	});

	it("downloads and persists all verified chunks on a cache miss", async () => {
		const file = {
			path: "papers/example/source.pdf",
			size: 5,
			modifiedAt: 1,
			sha256: "abc",
		};
		bridgeRpc.mockResolvedValueOnce(file).mockResolvedValueOnce({
			file,
			offset: 0,
			bytesB64: "aGVsbG8",
		});
		getCachedBridgeFile.mockResolvedValue(null);

		const blob = await loadBridgePaperPdf("papers/example");
		expect(await blob.text()).toBe("hello");
		expect(bridgeRpc).toHaveBeenNthCalledWith(2, "bridge_read_bytes", {
			path: file.path,
			offset: 0,
			len: 256 * 1024,
		});
		expect(putCachedBridgeFile).toHaveBeenCalledWith(file, blob);
	});
});
