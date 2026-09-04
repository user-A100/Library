import { describe, expect, it } from "vitest";

import {
	displayHistoryTitle,
	isVisualAnnotationPromptText,
	stripPromptEnvelopeForDisplay,
} from "@/lib/agent/prompt-display";

const visualPrompt = `You are reviewing 1 visual annotation from a research paper PDF.

Answer every annotation separately and in the original order.

Use these exact headings:

## Annotation 1

For each annotation:
- Respond using the corresponding image (Image 1 maps to Annotation 1, and so on).
- Do not merge or skip annotations.
- Do not invent unreadable details.
- State uncertainty explicitly.

Annotation 1 — page 2
User comment: 这里最值得读的是什么?`;

describe("stripPromptEnvelopeForDisplay — visual annotation", () => {
	it("extracts user comment from visual annotation system prompt", () => {
		expect(stripPromptEnvelopeForDisplay(visualPrompt)).toBe(
			"这里最值得读的是什么?",
		);
	});

	it("extracts user question from continue prompt", () => {
		const cont = [
			"You are helping the user discuss a visual region from a research paper PDF in Agentero.",
			"Page: 2",
			"Original annotation comment: first",
			"User question:",
			"follow up please",
			"Answer based on the crop context and prior turns when possible. Be concise. If uncertain, say so.",
		].join("\n\n");
		expect(stripPromptEnvelopeForDisplay(cont)).toBe("follow up please");
	});

	it("displayHistoryTitle uses the human comment", () => {
		expect(displayHistoryTitle(visualPrompt)).toBe("这里最值得读的是什么?");
	});
});

describe("isVisualAnnotationPromptText", () => {
	it("detects visual annotation wrappers", () => {
		expect(isVisualAnnotationPromptText(visualPrompt)).toBe(true);
		expect(isVisualAnnotationPromptText("这里最值得读的是什么?")).toBe(false);
	});
});
