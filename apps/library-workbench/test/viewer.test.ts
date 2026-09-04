import { describe, expect, it } from "vitest";
import {
	imageMimeFromPath,
	isHtmlPath,
	isImagePath,
	isImageViewerSource,
	isPdfPath,
	preferredModeForPath,
} from "@/lib/workspace/viewer";

describe("viewer path helpers", () => {
	it("detects pdf / html / image extensions", () => {
		expect(isPdfPath("/vault/a.PDF")).toBe(true);
		expect(isHtmlPath("/vault/page.htm")).toBe(true);
		expect(isImagePath("/vault/fig.png")).toBe(true);
		expect(isImagePath("/vault/fig.JPEG")).toBe(true);
		expect(isImagePath("/vault/logo.svg")).toBe(true);
		expect(isImagePath("/vault/notes.md")).toBe(false);
	});

	it("maps image mime from extension", () => {
		expect(imageMimeFromPath("x.png")).toBe("image/png");
		expect(imageMimeFromPath("x.jpg")).toBe("image/jpeg");
		expect(imageMimeFromPath("x.svg")).toBe("image/svg+xml");
		expect(imageMimeFromPath("x.webp")).toBe("image/webp");
	});

	it("preferredModeForPath prefers media over markdown", () => {
		expect(preferredModeForPath("/a/b.pdf")).toBe("pdf");
		expect(preferredModeForPath("/a/b.html")).toBe("html");
		expect(preferredModeForPath("/a/b.png")).toBe("image");
		expect(preferredModeForPath("/a/b.md")).toBe("markdown");
		expect(preferredModeForPath(null)).toBe("markdown");
	});

	it("accepts blob and data URLs as image sources", () => {
		expect(isImageViewerSource("blob:http://localhost/1")).toBe(true);
		expect(isImageViewerSource("https://example.com/a.png")).toBe(true);
		expect(isImageViewerSource("data:image/png;base64,aa")).toBe(true);
		expect(isImageViewerSource("asset://localhost/a.png")).toBe(false);
		expect(isImageViewerSource(null)).toBe(false);
	});
});
