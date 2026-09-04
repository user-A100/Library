import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	fitEnd,
	fitStart,
	splitLineAroundFocus,
	windowAroundFocus,
} from "@/components/settings/panes/doctor-line-fit";

/**
 * Tests run in a node env, so canvas metrics are stubbed with a fixed advance
 * width per character. `10` differs from the module's no-context fallback (`7`)
 * so a missing stub fails loudly instead of silently passing.
 */
const CHAR_PX = 10;

beforeAll(() => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			createElement: () => ({
				getContext: () => ({
					font: "",
					measureText: (text: string) => ({ width: text.length * CHAR_PX }),
				}),
			}),
		},
	});
});

afterAll(() => {
	Reflect.deleteProperty(globalThis, "document");
});

describe("splitLineAroundFocus", () => {
	it("splits around the last occurrence of the focus", () => {
		expect(splitLineAroundFocus("see [[a]] and [[a]] too", "[[a]]")).toEqual({
			before: "see [[a]] and ",
			after: " too",
		});
	});

	it("keeps the whole line when the focus is absent or the line is empty", () => {
		expect(splitLineAroundFocus("plain line", "[[a]]")).toEqual({
			before: "plain line",
			after: "",
		});
		expect(splitLineAroundFocus(undefined, "[[a]]")).toEqual({
			before: "",
			after: "",
		});
	});
});

describe("fitEnd", () => {
	it("returns the text untouched when it already fits", () => {
		expect(fitEnd("abc", 100)).toBe("abc");
	});

	it("keeps the right end behind a leading ellipsis", () => {
		expect(fitEnd("abcdefghij", 50)).toBe("…ghij");
	});

	it("degrades to a bare ellipsis when there is no room for context", () => {
		expect(fitEnd("abcdefghij", CHAR_PX)).toBe("…");
	});

	it("returns empty for empty text or non-positive width", () => {
		expect(fitEnd("", 100)).toBe("");
		expect(fitEnd("abcdefghij", 0)).toBe("");
	});
});

describe("fitStart", () => {
	it("returns the text untouched when it already fits", () => {
		expect(fitStart("abc", 100)).toBe("abc");
	});

	it("keeps the left start ahead of a trailing ellipsis", () => {
		expect(fitStart("abcdefghij", 50)).toBe("abcd…");
	});

	it("degrades to a bare ellipsis when there is no room for context", () => {
		expect(fitStart("abcdefghij", CHAR_PX)).toBe("…");
	});

	it("returns empty for empty text or non-positive width", () => {
		expect(fitStart("", 100)).toBe("");
		expect(fitStart("abcdefghij", 0)).toBe("");
	});
});

describe("windowAroundFocus", () => {
	it("keeps both sides untouched when the container width is unknown", () => {
		expect(windowAroundFocus("left", "focus", "right", 0)).toEqual({
			before: "left",
			after: "right",
		});
	});

	it("keeps the whole line when it fits the container", () => {
		expect(windowAroundFocus("L", "F", "R", 500)).toEqual({
			before: "L",
			after: "R",
		});
	});

	it("splits the leftover budget evenly around the focus", () => {
		expect(
			windowAroundFocus("L".repeat(10), "FOCUS", "R".repeat(10), 150),
		).toEqual({ before: "…LLLL", after: "RRRR…" });
	});

	it("donates the unused left budget to the trailing context", () => {
		expect(windowAroundFocus("", "FOCUS", "R".repeat(10), 150)).toEqual({
			before: "",
			after: "RRRRRRRRRR",
		});
	});

	it("donates the unused right budget to the leading context", () => {
		expect(windowAroundFocus("L".repeat(10), "FOCUS", "", 150)).toEqual({
			before: "LLLLLLLLLL",
			after: "",
		});
	});
});
