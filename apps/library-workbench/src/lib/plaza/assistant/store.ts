import { useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { errorText } from "@/lib/core/error";
import { parseRecommendations } from "./parse";
import { buildPlazaAssistantPrompt } from "./prompt";
import { cancelPlazaAsk, runPlazaAsk } from "./run";
import type { PlazaListing, PlazaRecommendationCard } from "./types";

export type PlazaAskStatus =
	| "idle"
	| "collecting"
	| "running"
	| "done"
	| "error"
	| "cancelled";

export type PlazaAskSession = {
	status: PlazaAskStatus;
	question: string;
	/** Snapshot used for the run; card imports read from it. */
	listings: PlazaListing[];
	cards: PlazaRecommendationCard[];
	parsedOk: boolean;
	streamText: string;
	answer: string | null;
	error: string | null;
};

export const IDLE_ASK_SESSION: PlazaAskSession = {
	status: "idle",
	question: "",
	listings: [],
	cards: [],
	parsedOk: true,
	streamText: "",
	answer: null,
	error: null,
};

type PlazaAssistantState = {
	sessions: Record<string, PlazaAskSession>;
};

const BUSY: readonly PlazaAskStatus[] = ["collecting", "running"];

export const plazaAssistantStore = createStore<PlazaAssistantState>(() => ({
	sessions: {},
}));

/** Test-friendly raw state accessor. */
export function usePlazaAssistantStoreState(): PlazaAssistantState {
	return plazaAssistantStore.getState();
}

function setSession(sourceId: string, patch: Partial<PlazaAskSession>): void {
	plazaAssistantStore.setState((state) => ({
		sessions: {
			...state.sessions,
			[sourceId]: {
				...IDLE_ASK_SESSION,
				...state.sessions[sourceId],
				...patch,
			},
		},
	}));
}

export function resetPlazaAsk(sourceId: string): void {
	plazaAssistantStore.setState((state) => {
		const sessions = { ...state.sessions };
		delete sessions[sourceId];
		return { sessions };
	});
}

export function stopPlazaAsk(sourceId: string): void {
	cancelPlazaAsk(sourceId);
}

export async function askPlaza(opts: {
	sourceId: string;
	sourceLabel: string;
	question: string;
	collect: () => Promise<PlazaListing[]>;
}): Promise<void> {
	const current = plazaAssistantStore.getState().sessions[opts.sourceId];
	if (current && BUSY.includes(current.status)) return;
	setSession(opts.sourceId, {
		status: "collecting",
		question: opts.question,
		listings: [],
		cards: [],
		parsedOk: true,
		streamText: "",
		answer: null,
		error: null,
	});
	let listings: PlazaListing[];
	try {
		listings = await opts.collect();
	} catch (e) {
		setSession(opts.sourceId, { status: "error", error: errorText(e) });
		return;
	}
	if (!listings.length) {
		setSession(opts.sourceId, { status: "error", error: "emptyListings" });
		return;
	}
	setSession(opts.sourceId, { status: "running", listings });
	try {
		const prompt = buildPlazaAssistantPrompt({
			sourceLabel: opts.sourceLabel,
			question: opts.question,
			listings,
		});
		const result = await runPlazaAsk(opts.sourceId, prompt, (delta) => {
			const state = plazaAssistantStore.getState().sessions[opts.sourceId];
			if (!state || state.status !== "running") return;
			setSession(opts.sourceId, { streamText: state.streamText + delta });
		});
		if (result.cancelled) {
			setSession(opts.sourceId, {
				status: "cancelled",
				answer: result.answer || null,
			});
			return;
		}
		if (result.error) {
			setSession(opts.sourceId, {
				status: "error",
				error: result.error,
				answer: result.answer || null,
			});
			return;
		}
		const { cards, parsedOk } = parseRecommendations(result.answer, listings);
		setSession(opts.sourceId, {
			status: "done",
			answer: result.answer,
			cards,
			parsedOk,
		});
	} catch (e) {
		setSession(opts.sourceId, { status: "error", error: errorText(e) });
	}
}

/** React hook: the ask session for one plaza source. */
export function usePlazaAssistantSession(sourceId: string): PlazaAskSession {
	return useSyncExternalStore(
		plazaAssistantStore.subscribe,
		() => plazaAssistantStore.getState().sessions[sourceId] ?? IDLE_ASK_SESSION,
		() => IDLE_ASK_SESSION,
	);
}
