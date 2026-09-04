import { nanoid } from "nanoid";
import type { AgentLine } from "@/components/mobile/types";

/** Appends a stream chunk to the open streaming line, or opens a new one. */
export function appendStreamChunk(
	lines: AgentLine[],
	chunk: string,
): AgentLine[] {
	const last = lines.at(-1);
	if (last?.role === "assistant" && last.streaming) {
		return [...lines.slice(0, -1), { ...last, text: `${last.text}${chunk}` }];
	}
	return [
		...lines,
		{ id: nanoid(), role: "assistant", text: chunk, streaming: true },
	];
}

/**
 * Finalizes the run: closes the streaming line, or appends the final content
 * when no streaming line was produced.
 */
export function completeStream(
	lines: AgentLine[],
	content: string,
): AgentLine[] {
	const last = lines.at(-1);
	if (last?.role === "assistant" && last.streaming) {
		return [...lines.slice(0, -1), { ...last, streaming: false }];
	}
	return content
		? [...lines, { id: nanoid(), role: "assistant", text: content }]
		: lines;
}

/** Appends a plain assistant line (used for failures). */
export function appendAssistantLine(
	lines: AgentLine[],
	text: string,
): AgentLine[] {
	return [...lines, { id: nanoid(), role: "assistant", text }];
}

/** Appends a user line. */
export function appendUserLine(lines: AgentLine[], text: string): AgentLine[] {
	return [...lines, { id: nanoid(), role: "user", text }];
}
