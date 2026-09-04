import { describe, expect, it } from "vitest";
import { layoutBackendsAfterClearingProvider } from "@/lib/pdf/layout/provider-config";
import {
	DEFAULT_LAYOUT_SETTINGS,
	type LayoutSettings,
} from "@/lib/pdf/layout/settings";

function layoutWith(
	partial: Partial<LayoutSettings> &
		Pick<LayoutSettings, "backend" | "parserBackend">,
): LayoutSettings {
	return {
		...DEFAULT_LAYOUT_SETTINGS,
		providerConfigs: {},
		...partial,
	};
}

describe("layoutBackendsAfterClearingProvider", () => {
	it("falls layout backend back to local when it pointed at the cleared provider", () => {
		const next = layoutBackendsAfterClearingProvider(
			layoutWith({ backend: "paddle", parserBackend: "local" }),
			"paddle",
		);
		expect(next).toEqual({ backend: "local", parserBackend: "local" });
	});

	it("falls parser backend back to local when it pointed at the cleared provider", () => {
		const next = layoutBackendsAfterClearingProvider(
			layoutWith({ backend: "local", parserBackend: "mineru" }),
			"mineru",
		);
		expect(next).toEqual({ backend: "local", parserBackend: "local" });
	});

	it("falls both backends when both pointed at the cleared provider", () => {
		const next = layoutBackendsAfterClearingProvider(
			layoutWith({ backend: "paddle", parserBackend: "paddle" }),
			"paddle",
		);
		expect(next).toEqual({ backend: "local", parserBackend: "local" });
	});

	it("leaves unrelated backends unchanged", () => {
		const next = layoutBackendsAfterClearingProvider(
			layoutWith({ backend: "mineru", parserBackend: "openaiCompatible" }),
			"paddle",
		);
		expect(next).toEqual({
			backend: "mineru",
			parserBackend: "openaiCompatible",
		});
	});

	it("only resets parserBackend for openaiCompatible (not a layout backend)", () => {
		const next = layoutBackendsAfterClearingProvider(
			layoutWith({ backend: "paddle", parserBackend: "openaiCompatible" }),
			"openaiCompatible",
		);
		expect(next).toEqual({
			backend: "paddle",
			parserBackend: "local",
		});
	});
});
