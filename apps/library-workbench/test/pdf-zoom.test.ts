import { describe, expect, it } from "vitest";

import {
	formatPdfZoomPercentage,
	parsePdfZoomPercentage,
} from "@/lib/pdf/zoom";

describe("parsePdfZoomPercentage", () => {
	it("accepts precise percentages with an optional percent sign", () => {
		expect(parsePdfZoomPercentage("112.5")).toBe(1.125);
		expect(parsePdfZoomPercentage(" 125% ")).toBe(1.25);
	});

	it("clamps percentages to the supported viewer range", () => {
		expect(parsePdfZoomPercentage("25")).toBe(0.5);
		expect(parsePdfZoomPercentage("450")).toBe(3);
	});

	it("rejects empty and non-numeric input", () => {
		expect(parsePdfZoomPercentage("")).toBeNull();
		expect(parsePdfZoomPercentage("%")).toBeNull();
		expect(parsePdfZoomPercentage("fit width")).toBeNull();
	});
});

describe("formatPdfZoomPercentage", () => {
	it("shows at most one decimal place without a trailing zero", () => {
		expect(formatPdfZoomPercentage(1.25)).toBe("125");
		expect(formatPdfZoomPercentage(1.125)).toBe("112.5");
	});
});
