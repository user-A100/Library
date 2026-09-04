/**
 * Session history: provider session listing (resume support), opening a
 * history row (local hydrate vs remote session/load), and the cross-window
 * agent-session open request (visual-trace rebuild + fallback).
 */
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type {
	AgentPanelRefs,
	AgentPanelT,
} from "@/components/agent/hooks/use-agent-panel-context";
import { useUiStore } from "@/hooks/use-app-stores";
import {
	type AcpLoadSessionResult,
	type AcpSessionInfo,
	listSessions,
	loadSession,
} from "@/lib/agent";
import {
	type AgentSessionRecord,
	agentSessionStore,
} from "@/lib/agent/agent-session-store";
import {
	type AgentOption,
	type AgentPart,
	type ChatLine,
	type ChatSessionHistoryItem,
	errorChatLine,
	errorText,
	isBackgroundWorkflowHistoryTitle,
	mapToolStatus,
	providerSessionIdForHistoryLoad,
} from "@/lib/agent/chat-state";
import {
	displayHistoryTitle,
	stripPromptEnvelopeForDisplay,
} from "@/lib/agent/prompt-display";
import { isTauri } from "@/lib/core/tauri";
import { mapLimit } from "@/lib/core/utils";
import {
	buildVisualTraceHistoryItem,
	visualTraceHistoryId,
} from "@/lib/pdf/agent-trace/open-session";
import { nextLineId, nextPartId } from "@/lib/pdf-visual/ids";
import { clearAgentSessionOpenRequest } from "@/lib/shell/ui-store";

/** Strip Host/Codex machine envelopes so Chat never shows system preamble. */
export const sanitizeChatLines = (raw: ChatLine[]): ChatLine[] =>
	raw
		.map((line) => {
			if (line.kind !== "user") return line;
			const text = stripPromptEnvelopeForDisplay(line.text);
			const hasVisual = Boolean(line.visualAnnotations?.length);
			const hasImages = Boolean(line.images?.length);
			if (!text && !hasVisual && !hasImages) return null;
			return {
				...line,
				text: text || "",
				...(line.visualAnnotations?.length
					? { visualAnnotations: line.visualAnnotations }
					: {}),
				...(line.images?.length ? { images: line.images } : {}),
			};
		})
		.filter((line): line is ChatLine => line !== null);

/** Derive a human-readable title from a loaded ACP session's first user turn. */
export function titleFromLoadedHistory(history: AcpLoadSessionResult): string {
	const firstUser = history.lines.find((line) => line.kind === "user");
	if (firstUser) {
		return displayHistoryTitle(firstUser.text, history.title ?? "");
	}
	return displayHistoryTitle(history.title ?? "");
}

type HydrateTitleOptions = {
	generation: number;
	historyGenRef: { current: number };
	selectedAgentId: string;
	vaultPath: string | null;
	setSessionHistory: (
		update:
			| AgentSessionRecord[]
			| ((prev: AgentSessionRecord[]) => AgentSessionRecord[]),
	) => void;
};

/** Background-hydrate titles for ACP sessions that arrived without one. */
export async function hydrateSessionTitles(
	items: AgentSessionRecord[],
	opts: HydrateTitleOptions,
): Promise<void> {
	const {
		generation,
		historyGenRef,
		selectedAgentId,
		vaultPath,
		setSessionHistory,
	} = opts;
	if (generation !== historyGenRef.current) return;

	const started = Date.now();
	const BUDGET_MS = 5000;

	await mapLimit(items, 3, async (item) => {
		if (generation !== historyGenRef.current) return;
		if (Date.now() - started > BUDGET_MS) return;

		try {
			const providerSessionId = providerSessionIdForHistoryLoad(item);
			const history = await loadSession({
				agentId: selectedAgentId,
				sessionId: providerSessionId,
				vaultPath: vaultPath ?? undefined,
			});
			if (generation !== historyGenRef.current) return;

			const title = titleFromLoadedHistory(history);
			if (!title) return;

			setSessionHistory((prev) =>
				prev.map((s) =>
					s.id === item.id && s.agentId === item.agentId ? { ...s, title } : s,
				),
			);
		} catch {
			// Title is supplementary; a failed load must not block the drawer.
		}
	});
}

type MergeImportedSessionsResult = {
	sessions: AgentSessionRecord[];
	hydrationCandidates: AgentSessionRecord[];
};

/**
 * Merge ACP `session/list` results with the local session store.
 * Returns the merged list plus external sessions that lack an ACP title and
 * have no local transcript — these are candidates for background title hydration.
 */
export function mergeImportedSessions(
	prev: AgentSessionRecord[],
	chatSessions: AcpSessionInfo[],
	selectedAgentId: string,
	agentName: string,
	i18nLanguage: string,
): MergeImportedSessionsResult {
	const existingForAgent = prev.filter(
		(item) => item.agentId === selectedAgentId,
	);
	const existingById = new Map(existingForAgent.map((item) => [item.id, item]));
	const existingByProvider = new Map(
		existingForAgent
			.filter((item) => item.providerSessionId?.trim())
			.map((item) => [item.providerSessionId?.trim() as string, item]),
	);

	const hydrationCandidates: AgentSessionRecord[] = [];

	const imported = chatSessions.map((session) => {
		const current =
			existingById.get(session.sessionId) ??
			existingByProvider.get(session.sessionId);
		const startedAt = session.updatedAt
			? new Date(session.updatedAt).toLocaleString(i18nLanguage)
			: "";
		const acpTitle = session.title ?? "";
		const titleFallback = session.sessionId.slice(0, 8);
		const title = acpTitle
			? displayHistoryTitle(acpTitle, titleFallback)
			: titleFallback;

		if (current) {
			const record: AgentSessionRecord = {
				...current,
				source:
					current.source === "local"
						? ("local" as const)
						: ("external" as const),
				agentName,
				title: current.lines.length > 0 ? current.title : title,
				startedAt: current.startedAt || startedAt,
				providerSessionId: session.sessionId,
			};
			if (!acpTitle && current.lines.length === 0) {
				hydrationCandidates.push(record);
			}
			return record;
		}

		const record: AgentSessionRecord = {
			id: session.sessionId,
			agentId: selectedAgentId,
			source: "external" as const,
			title,
			agentName,
			startedAt,
			lines: [],
			status: "completed" as const,
			providerSessionId: session.sessionId,
		};
		if (!acpTitle) {
			hydrationCandidates.push(record);
		}
		return record;
	});

	const importedIds = new Set(chatSessions.map((session) => session.sessionId));
	const localOnly = prev.filter(
		(item) =>
			item.agentId === selectedAgentId &&
			!importedIds.has(item.id) &&
			!importedIds.has(item.providerSessionId?.trim() ?? "") &&
			!isBackgroundWorkflowHistoryTitle(item.title) &&
			(item.status === "running" ||
				(item.source === "local" && item.lines.length > 0)),
	);

	return {
		sessions: [...localOnly, ...imported],
		hydrationCandidates,
	};
}

export type UseAgentHistoryOptions = {
	refs: Pick<
		AgentPanelRefs,
		| "activeConversationRef"
		| "activeTabRef"
		| "historyGenRef"
		| "historyHydrationGenRef"
		| "selectedAgentIdRef"
		| "sessionHistoryRef"
		| "submittingRef"
		| "vaultPathRef"
	>;
	t: AgentPanelT;
	i18nLanguage: string;
	vaultPath: string | null;
	selectedAgentId: string | null;
	setSelectedAgentId: Dispatch<SetStateAction<string | null>>;
	selected: AgentOption | undefined;
	setSessionHistory: (
		update:
			| AgentSessionRecord[]
			| ((prev: AgentSessionRecord[]) => AgentSessionRecord[]),
	) => void;
	setLines: (update: ChatLine[] | ((prev: ChatLine[]) => ChatLine[])) => void;
	hydrateAndActivateSession: (
		session: AgentSessionRecord,
		lines: ChatLine[],
		title?: string,
	) => void;
	activateComposerSession: (sessionId: string) => void;
	setHistoryOpen: Dispatch<SetStateAction<boolean>>;
	clearMessageQueue: () => void;
};

export type AgentHistory = {
	openHistorySession: (item: ChatSessionHistoryItem) => void;
};

export function useAgentHistory({
	refs: {
		activeConversationRef,
		activeTabRef,
		historyGenRef,
		historyHydrationGenRef,
		selectedAgentIdRef,
		sessionHistoryRef,
		submittingRef,
		vaultPathRef,
	},
	t,
	i18nLanguage,
	vaultPath,
	selectedAgentId,
	setSelectedAgentId,
	selected,
	setSessionHistory,
	setLines,
	hydrateAndActivateSession,
	activateComposerSession,
	setHistoryOpen,
	clearMessageQueue,
}: UseAgentHistoryOptions): AgentHistory {
	const [supportsResume, setSupportsResume] = useState(false);

	const [historyLoaded, setHistoryLoaded] = useState(false);

	const loadAgentHistory = useCallback(async () => {
		if (!isTauri() || !selectedAgentId) {
			setHistoryLoaded(true);
			return;
		}
		const generation = ++historyGenRef.current;
		setHistoryLoaded(false);
		try {
			const result = await listSessions({
				agentId: selectedAgentId,
				vaultPath: vaultPath ?? undefined,
			});
			if (generation !== historyGenRef.current) return;
			setSupportsResume(result.supported);
			if (!result.supported) return;
			const chatSessions = result.sessions.filter(
				(s) => !isBackgroundWorkflowHistoryTitle(s.title ?? ""),
			);
			const { sessions: nextSessions, hydrationCandidates } =
				mergeImportedSessions(
					agentSessionStore.getState().sessions,
					chatSessions,
					selectedAgentId,
					selected?.name ?? "Agent",
					i18nLanguage,
				);
			setSessionHistory(nextSessions);

			if (
				hydrationCandidates.length > 0 &&
				generation === historyGenRef.current
			) {
				void hydrateSessionTitles(hydrationCandidates, {
					generation,
					historyGenRef,
					selectedAgentId,
					vaultPath,
					setSessionHistory,
				});
			}
		} catch {
			// History is supplementary: a failed scan must not block the Composer.
		} finally {
			if (generation === historyGenRef.current) {
				setHistoryLoaded(true);
			}
		}
	}, [
		i18nLanguage,
		selected?.name,
		selectedAgentId,
		vaultPath,
		setSessionHistory,
		historyGenRef,
	]);

	useEffect(() => {
		void loadAgentHistory();
		return () => {
			historyGenRef.current += 1;
		};
	}, [loadAgentHistory, historyGenRef]);

	const agentSessionOpenRequest = useUiStore((s) => s.agentSessionOpenRequest);

	const openHistorySession = (item: ChatSessionHistoryItem) => {
		if (submittingRef.current) return;
		const providerSessionId = providerSessionIdForHistoryLoad(item);
		const hydrationGeneration = ++historyHydrationGenRef.current;
		setHistoryOpen(false);
		clearMessageQueue();
		if (!supportsResume || item.lines.length > 0) {
			const localLines = sanitizeChatLines(item.lines);
			activateComposerSession(item.id);
			activeTabRef.current = item.id;
			hydrateAndActivateSession(item, localLines);
			// Visual-trace (and other non-resumeable) sessions keep multi-turn
			// context in local lines; never set an ACP resume id for them.
			if (supportsResume && item.resumeable !== false) {
				activeConversationRef.current = providerSessionId;
			} else {
				activeConversationRef.current = null;
			}
			return;
		}
		const requestAgentId = selectedAgentId;
		const requestVaultPath = vaultPath;
		if (!requestAgentId) return;
		void (async () => {
			try {
				const history = await loadSession({
					agentId: requestAgentId,
					sessionId: providerSessionId,
					vaultPath: requestVaultPath ?? undefined,
				});
				if (
					hydrationGeneration !== historyHydrationGenRef.current ||
					selectedAgentIdRef.current !== requestAgentId ||
					vaultPathRef.current !== requestVaultPath
				) {
					return;
				}
				const nextLines = sanitizeChatLines(
					history.lines.map((line) => {
						if (line.kind === "user") {
							return {
								id: line.id,
								kind: "user" as const,
								text: line.text,
								...(line.visualAnnotations?.length
									? { visualAnnotations: line.visualAnnotations }
									: {}),
								...(line.images?.length ? { images: line.images } : {}),
							};
						}
						const parts: AgentPart[] = [];
						if (line.parts && line.parts.length > 0) {
							line.parts.forEach((part, index) => {
								const partId = `${line.id}:part-${index}`;
								if (part.type === "reasoning" || part.type === "text") {
									if (part.text.trim().length > 0) {
										parts.push({
											type: part.type,
											id: partId,
											text: part.text,
										});
									}
									return;
								}
								if (part.type === "tool") {
									parts.push({
										type: "tool",
										id: partId,
										tool: {
											id: part.tool.id,
											title: part.tool.title,
											kind: part.tool.kind,
											status: mapToolStatus(part.tool.status),
											input: part.tool.input,
											output: part.tool.output,
										},
									});
									return;
								}
								if (part.entries.length > 0) {
									parts.push({
										type: "plan",
										id: partId,
										entries: part.entries,
									});
								}
							});
						} else {
							if (line.reasoning && line.reasoning.trim().length > 0) {
								parts.push({
									type: "reasoning",
									id: `${line.id}:reasoning`,
									text: line.reasoning,
								});
							}
							parts.push({
								type: "text",
								id: `${line.id}:text`,
								text: line.text,
							});
						}
						return {
							id: line.id,
							kind: "agent" as const,
							parts,
							sources:
								line.sources && line.sources.length > 0
									? line.sources
									: undefined,
						};
					}),
				);
				const firstUser = nextLines.find((l) => l.kind === "user");
				const titleFromBody =
					firstUser?.kind === "user"
						? displayHistoryTitle(firstUser.text, history.title ?? "")
						: displayHistoryTitle(history.title ?? "");
				activeConversationRef.current = providerSessionId;
				activateComposerSession(item.id);
				activeTabRef.current = item.id;
				hydrateAndActivateSession(item, nextLines, titleFromBody);
			} catch (error) {
				if (
					hydrationGeneration !== historyHydrationGenRef.current ||
					selectedAgentIdRef.current !== requestAgentId ||
					vaultPathRef.current !== requestVaultPath
				) {
					return;
				}
				setLines((prev) => [...prev, errorChatLine(errorText(error))]);
			}
		})();
	};

	const openHistorySessionRef = useRef(openHistorySession);
	openHistorySessionRef.current = openHistorySession;

	useEffect(() => {
		const request = agentSessionOpenRequest;
		if (!request) return;
		if (request.agentId && request.agentId !== selectedAgentId) {
			setSelectedAgentId(request.agentId);
			// Wait for history reload after agent switch.
			return;
		}
		if (!historyLoaded) return;

		const vt = request.visualTrace;
		// Prefer stable visual-trace history id so multi-turn pin opens one session.
		const stableId = vt?.traceId
			? visualTraceHistoryId(vt.traceId)
			: request.runtimeSessionId;

		const match = sessionHistoryRef.current.find(
			(item) =>
				item.id === stableId ||
				item.id === request.runtimeSessionId ||
				item.providerSessionId === request.runtimeSessionId ||
				(request.providerSessionId != null &&
					(item.id === request.providerSessionId ||
						item.providerSessionId === request.providerSessionId)),
		);

		if (vt) {
			// Always rebuild lines from mark transcript (full multi-turn + image chip).
			const rebuilt = buildVisualTraceHistoryItem({
				trace: {
					id: vt.traceId,
					page: vt.page,
					comment: vt.comment,
					paperPath: vt.paperPath ?? "",
					image: vt.image,
					agent: {
						agentId: request.agentId,
						runtimeSessionId: request.runtimeSessionId,
						messageId: request.messageId ?? "pending",
						providerSessionId: request.providerSessionId ?? undefined,
						status: vt.status ?? "completed",
						messages: vt.messages,
						answerSnapshot: request.answerSnapshot,
					},
				},
				messages: vt.messages,
				title:
					request.title?.trim() ||
					request.prompt?.trim() ||
					t("composer.visualAnnotation"),
				agentName: selected?.name ?? t("defaultName"),
				startedAt: match?.startedAt || new Date().toLocaleString(i18nLanguage),
				emptyFallback: t("composer.visualAnnotation"),
				paperAbsPath: request.paperAbsPath,
			});
			// Merge into existing slot if present; drop duplicate runtime-id entries.
			setSessionHistory((prev) => {
				const withoutDupes = prev.filter(
					(item) =>
						item.id !== rebuilt.id &&
						item.id !== request.runtimeSessionId &&
						!(
							request.providerSessionId &&
							(item.id === request.providerSessionId ||
								item.providerSessionId === request.providerSessionId)
						),
				);
				return [rebuilt, ...withoutDupes];
			});
			openHistorySessionRef.current(rebuilt);
			clearAgentSessionOpenRequest();
			return;
		}

		if (match) {
			openHistorySessionRef.current(match);
			clearAgentSessionOpenRequest();
			return;
		}

		const snapshot = request.answerSnapshot?.trim();
		const fallbackLines: ChatLine[] = [
			{
				id: nextLineId("user"),
				kind: "user",
				text:
					request.prompt?.trim() ||
					request.title?.trim() ||
					t("composer.visualAnnotation"),
			},
		];
		if (snapshot) {
			fallbackLines.push({
				id: nextLineId("agent"),
				kind: "agent",
				parts: [
					{
						type: "text",
						id: nextPartId("text"),
						text: snapshot,
					},
				],
				streaming: false,
			});
		} else {
			fallbackLines.push({
				id: nextLineId("sys"),
				kind: "system",
				text: t("messages.sessionUnavailable"),
			});
		}
		const fallback: ChatSessionHistoryItem = {
			id: stableId,
			agentId: request.agentId,
			source: "local",
			title:
				request.title?.trim() ||
				request.prompt?.trim() ||
				t("composer.visualAnnotation"),
			agentName: selected?.name ?? t("defaultName"),
			startedAt: new Date().toLocaleString(i18nLanguage),
			lines: fallbackLines,
			status: snapshot ? "completed" : "failed",
			providerSessionId: request.providerSessionId ?? null,
		};
		setSessionHistory((prev) => [
			fallback,
			...prev.filter((item) => item.id !== fallback.id),
		]);
		openHistorySessionRef.current(fallback);
		clearAgentSessionOpenRequest();
	}, [
		agentSessionOpenRequest,
		historyLoaded,
		i18nLanguage,
		selected?.name,
		selectedAgentId,
		t,
		setSessionHistory,
		setSelectedAgentId,
		sessionHistoryRef,
	]);

	return {
		openHistorySession,
	};
}
