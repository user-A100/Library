import type { FontFallbackConfig } from "@embedpdf/engines/pdfium";
import { FontCharset } from "@embedpdf/models";
import { errorText } from "@/lib/core/error";
import { invokeApi } from "@/lib/core/ipc";
import { logger } from "@/lib/core/logger";
import { isMobileApp, isTauri } from "@/lib/core/tauri";

type SystemCjkFontPayload = {
	path: string;
	bytesBase64: string;
};

let fontFallbackPromise: Promise<FontFallbackConfig | null> | null = null;

function decodeBase64(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * Load one local CJK font for PDFium's missing-font callback.
 *
 * PDFium runs in a WASM context (and usually a Web Worker), so CSS system
 * fonts are not visible to it. The Host locates a displayable system CJK font;
 * this exposes its bytes as a local blob URL that both direct and worker
 * PDFium engines can fetch without a network request.
 */
export function loadSystemCjkFontFallback(): Promise<FontFallbackConfig | null> {
	if (!isTauri() || isMobileApp()) return Promise.resolve(null);
	if (fontFallbackPromise) return fontFallbackPromise;

	fontFallbackPromise = invokeApi<SystemCjkFontPayload>(
		"export_system_cjk_font",
		undefined,
		{ fallback: "export_system_cjk_font failed" },
	)
		.then((payload) => {
			if (!payload?.bytesBase64) return null;
			const bytes = decodeBase64(payload.bytesBase64);
			if (bytes.byteLength === 0) return null;

			const mimeType = /\.otf$/i.test(payload.path) ? "font/otf" : "font/ttf";
			const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
			logger.info("pdf: system CJK font fallback ready", {
				path: payload.path,
				bytes: bytes.byteLength,
			});
			return {
				fonts: {
					[FontCharset.GB2312]: { url, weight: 400 },
				},
			};
		})
		.catch((error: unknown) => {
			logger.warn("pdf: system CJK font fallback unavailable", {
				error: errorText(error),
			});
			return null;
		});

	return fontFallbackPromise;
}
