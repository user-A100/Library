import { describe, expect, it } from "vitest";
import { HEADLESS_LAYOUT_RENDER_SCALE } from "@/lib/pdf/layout/headless-analyze";

describe("HEADLESS_LAYOUT_RENDER_SCALE", () => {
	it("stays below the 2x baseline so headless analysis stays cheap", () => {
		expect(HEADLESS_LAYOUT_RENDER_SCALE).toBeLessThan(2);
		expect(HEADLESS_LAYOUT_RENDER_SCALE).toBeGreaterThanOrEqual(1);
	});
});
