/**
 * Get PDF page count without full layout analysis.
 * Uses headless @embedpdf stack to read page count on demand.
 */

import { PluginRegistry } from "@embedpdf/core";
import type { DocumentManagerCapability } from "@embedpdf/plugin-document-manager";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager";
import { RenderPluginPackage } from "@embedpdf/plugin-render";

import { findLocalPdfPath, localFileToArrayBuffer } from "@/lib/paper";
import { getHeadlessPdfEngine } from "@/lib/pdf/layout/headless-analyze";

function taskToPromise<T>(task: {
	wait: (ok: (v: T) => void, err: (e: unknown) => void) => void;
}): Promise<T> {
	return new Promise((resolve, reject) => {
		task.wait(resolve, reject);
	});
}

/**
 * Get PDF page count for a paper folder.
 * Returns null if no PDF found or failed to read.
 */
export async function getPdfPageCount(
	paperAbsPath: string,
): Promise<number | null> {
	try {
		const pdfPath = await findLocalPdfPath(paperAbsPath);
		if (!pdfPath) return null;

		const buffer = await localFileToArrayBuffer(pdfPath);
		if (!buffer) return null;

		const engine = await getHeadlessPdfEngine();
		const documentId = `page-count-${Date.now().toString(36)}`;
		const registry = new PluginRegistry(engine);
		registry.registerPlugin(DocumentManagerPluginPackage, {});
		registry.registerPlugin(RenderPluginPackage);

		await registry.initialize();
		await registry.pluginsReady();

		const docPlugin = registry.getPlugin("document-manager");
		if (!docPlugin) return null;

		const docCap = (
			docPlugin as unknown as { provides: () => DocumentManagerCapability }
		).provides();

		const openRes = await taskToPromise(
			docCap.openDocumentBuffer({
				buffer,
				documentId,
				name: "page-count",
				autoActivate: true,
			}),
		);
		const doc = await taskToPromise(openRes.task);
		const pageCount = doc.pageCount ?? 0;

		return pageCount > 0 ? pageCount : null;
	} catch {
		return null;
	}
}
