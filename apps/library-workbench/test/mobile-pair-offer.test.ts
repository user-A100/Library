import { describe, expect, it } from "vitest";
import { isPairOfferUrl } from "@/components/mobile/hooks/use-pair-offer-links";

describe("isPairOfferUrl", () => {
	it("accepts a well-formed pair offer url", () => {
		expect(isPairOfferUrl("agentero://pair#offer=abc123")).toBe(true);
	});

	it("rejects other schemes", () => {
		expect(isPairOfferUrl("https://pair#offer=abc123")).toBe(false);
	});

	it("rejects other hosts", () => {
		expect(isPairOfferUrl("agentero://open#offer=abc123")).toBe(false);
	});

	it("rejects missing offer fragment", () => {
		expect(isPairOfferUrl("agentero://pair#token=abc123")).toBe(false);
	});

	it("rejects invalid urls", () => {
		expect(isPairOfferUrl("not a url")).toBe(false);
	});
});
