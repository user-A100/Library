import { describe, expect, it } from "vitest";
import {
	LAYOUT_MODE_RIGHT_RATIOS,
	layoutModeRightRatio,
} from "@/lib/shell/layout-presets";

describe("layout presets", () => {
	it("allocates Agent half of the reading area in Agent mode", () => {
		expect(layoutModeRightRatio("agent")).toBe(0.5);
	});

	it("allocates one third to Agent in Notes mode", () => {
		expect(layoutModeRightRatio("notes")).toBeCloseTo(1 / 3);
	});

	it("collapses Agent in Reading mode", () => {
		expect(LAYOUT_MODE_RIGHT_RATIOS.reading).toBe(0);
	});
});
