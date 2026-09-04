import { describe, expect, it } from "vitest";
import {
	appendAssistantLine,
	appendStreamChunk,
	appendUserLine,
	completeStream,
} from "@/components/mobile/chat-lines";
import type { AgentLine } from "@/components/mobile/types";

function line(overrides: Partial<AgentLine> = {}): AgentLine {
	return { id: "l1", role: "assistant", text: "hello", ...overrides };
}

describe("appendStreamChunk", () => {
	it("opens a streaming line when the timeline is empty", () => {
		const next = appendStreamChunk([], "Hi");
		expect(next).toHaveLength(1);
		expect(next[0]).toMatchObject({
			role: "assistant",
			text: "Hi",
			streaming: true,
		});
	});

	it("appends to an open streaming line", () => {
		const next = appendStreamChunk(
			[line({ text: "Hi", streaming: true })],
			"!",
		);
		expect(next).toHaveLength(1);
		expect(next[0]?.text).toBe("Hi!");
		expect(next[0]?.streaming).toBe(true);
	});

	it("opens a new line when the last line is not streaming", () => {
		const next = appendStreamChunk([line({ streaming: false })], "more");
		expect(next).toHaveLength(2);
		expect(next[1]).toMatchObject({ text: "more", streaming: true });
	});

	it("opens a new line when the last line is a user line", () => {
		const next = appendStreamChunk([line({ role: "user" })], "answer");
		expect(next).toHaveLength(2);
		expect(next[1]?.role).toBe("assistant");
	});
});

describe("completeStream", () => {
	it("closes the open streaming line", () => {
		const next = completeStream([line({ streaming: true })], "");
		expect(next[0]?.streaming).toBe(false);
	});

	it("appends final content when no streaming line exists", () => {
		const next = completeStream([line({ role: "user" })], "done");
		expect(next).toHaveLength(2);
		expect(next[1]).toMatchObject({ role: "assistant", text: "done" });
	});

	it("keeps the timeline unchanged for empty content without a streaming line", () => {
		const lines = [line({ role: "user" })];
		expect(completeStream(lines, "")).toEqual(lines);
	});
});

describe("appendUserLine / appendAssistantLine", () => {
	it("appends lines with the requested role", () => {
		const withUser = appendUserLine([], "question");
		const withAssistant = appendAssistantLine(withUser, "answer");
		expect(withAssistant.map((entry) => entry.role)).toEqual([
			"user",
			"assistant",
		]);
		expect(withAssistant[1]?.text).toBe("answer");
	});
});
