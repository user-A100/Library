/**
 * DOM text selection → Copy / Ask / Add-to-chat for Plaza feed detail.
 * Ask is ephemeral (in-memory PdfAskThread + AskPopover); nothing writes marks/.
 */

import type { UnlistenFn } from "@tauri-apps/api/event";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { PlazaSelectionScreen } from "@/components/plaza/plaza-selection-menu";
import {
	attachAgentRun,
	cancelAgentRun,
	disposeAgentRun,
	listAgents,
	runOnce,
} from "@/lib/agent";
import {
	pinActiveSelection,
	publishSelection,
} from "@/lib/agent/selection-store";
import { copyTextToClipboard } from "@/lib/core/clipboard";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { createEmptyThread, newMessageId } from "@/lib/pdf/ask";
import { threadHasUserQuestion } from "@/lib/pdf/ask/schema";
import type { PdfAskThread } from "@/lib/pdf/ask/types";
import { buildPlazaAskPrompt } from "@/lib/plaza/ask-prompt";
import type { FeedItem } from "@/lib/plaza/feeds";
import { loadSettings } from "@/lib/settings";
import { openRightTab } from "@/lib/shell/ui-window-actions";
import { resolveTranslateAgent } from "@/lib/translate";
import { getVaultPath } from "@/lib/vault/store";

const MAX_SELECTION_CHARS = 4000;

export type PlazaFeedSelectionMenu = {
	text: string;
	screen: PlazaSelectionScreen;
};

export type PlazaFeedAskState = {
	thread: PdfAskThread;
	screen: PlazaSelectionScreen;
};

function selectionInside(root: HTMLElement, sel: Selection): boolean {
	if (sel.rangeCount === 0) return false;
	const node = sel.getRangeAt(0).commonAncestorContainer;
	const el =
		node.nodeType === Node.ELEMENT_NODE ? (node as Node) : node.parentNode;
	return Boolean(el && root.contains(el));
}

function selectionScreen(sel: Selection): PlazaSelectionScreen | null {
	if (sel.rangeCount === 0) return null;
	const rect = sel.getRangeAt(0).getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) return null;
	return { x: rect.left + rect.width / 2, y: rect.top };
}

export function usePlazaFeedSelection({
	item,
	bodyRef,
}: {
	item: FeedItem;
	bodyRef: RefObject<HTMLElement | null>;
}) {
	const { t } = useTranslation("viewer");
	const [menu, setMenu] = useState<PlazaFeedSelectionMenu | null>(null);
	const [ask, setAsk] = useState<PlazaFeedAskState | null>(null);
	const [streaming, setStreaming] = useState(false);
	const [askError, setAskError] = useState<string | null>(null);

	const askRef = useRef<PlazaFeedAskState | null>(null);
	askRef.current = ask;

	const runDisposedRef = useRef(false);
	const runUnsubsRef = useRef<UnlistenFn[]>([]);
	const askSessionRef = useRef<string | null>(null);
	const activeSessionRef = useRef<string | null>(null);

	useEffect(() => {
		runDisposedRef.current = false;
		return () => {
			disposeAgentRun({
				disposedRef: runDisposedRef,
				unsubsRef: runUnsubsRef,
				sessionRef: askSessionRef,
				activeSessionRef,
			});
		};
	}, []);

	// New item → drop selection chrome.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run on item navigation
	useEffect(() => {
		setMenu(null);
		setAsk(null);
		setAskError(null);
		setStreaming(false);
	}, [item.id]);

	const clearNativeSelection = useCallback(() => {
		const sel = window.getSelection();
		sel?.removeAllRanges();
	}, []);

	const closeMenu = useCallback(() => {
		setMenu(null);
	}, []);

	const captureSelection = useCallback(() => {
		const root = bodyRef.current;
		if (!root) return;
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || !selectionInside(root, sel)) {
			setMenu(null);
			return;
		}
		const text = sel
			.toString()
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, MAX_SELECTION_CHARS);
		if (!text) {
			setMenu(null);
			return;
		}
		const screen = selectionScreen(sel);
		if (!screen) {
			setMenu(null);
			return;
		}
		setMenu({ text, screen });
	}, [bodyRef]);

	useEffect(() => {
		const root = bodyRef.current;
		if (!root) return;

		const onMouseUp = () => {
			// Defer so the browser finishes updating the selection.
			requestAnimationFrame(() => captureSelection());
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.key === "Shift" || event.key.startsWith("Arrow")) {
				requestAnimationFrame(() => captureSelection());
			}
		};
		const onScroll = () => {
			setMenu(null);
		};
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			// Keep menu when interacting with the toolbar / ask card.
			if (
				(target as Element).closest?.(
					"[data-plaza-selection-menu], [data-plaza-ask-card]",
				)
			) {
				return;
			}
			// Click outside the body clears the menu (selection may collapse next).
			if (!root.contains(target)) {
				setMenu(null);
			}
		};

		root.addEventListener("mouseup", onMouseUp);
		root.addEventListener("keyup", onKeyUp);
		root.addEventListener("scroll", onScroll, true);
		document.addEventListener("pointerdown", onPointerDown, true);
		return () => {
			root.removeEventListener("mouseup", onMouseUp);
			root.removeEventListener("keyup", onKeyUp);
			root.removeEventListener("scroll", onScroll, true);
			document.removeEventListener("pointerdown", onPointerDown, true);
		};
	}, [bodyRef, captureSelection]);

	const sourcePath =
		item.url?.trim() ||
		item.paperUrl?.trim() ||
		item.title.trim() ||
		`feed:${item.id}`;

	const handleCopy = useCallback(() => {
		if (!menu) return;
		void copyTextToClipboard(menu.text);
	}, [menu]);

	const handleAddToChat = useCallback(() => {
		if (!menu) return;
		const text = menu.text;
		setMenu(null);
		clearNativeSelection();
		publishSelection({
			text,
			sourcePath,
			origin: "markdown",
		});
		pinActiveSelection();
		openRightTab("agent");
	}, [menu, sourcePath, clearNativeSelection]);

	const handleAsk = useCallback(() => {
		if (!menu) return;
		const { text, screen } = menu;
		setMenu(null);
		clearNativeSelection();
		const thread = createEmptyThread({
			paperPath: sourcePath,
			anchor: {
				page: 1,
				rects: [],
				quote: text,
				trigger: "selection",
			},
		});
		setAskError(null);
		setAsk({ thread, screen });
	}, [menu, sourcePath, clearNativeSelection]);

	const resolveAskAgent = useCallback(async () => {
		const registry = await listAgents().catch(() => null);
		const resolved = resolveTranslateAgent(loadSettings().pdfAsk, registry);
		if (!resolved.agentId) {
			const msg = t("pdfAsk.noAgent");
			notifyError(msg);
			setAskError(msg);
			return null;
		}
		return resolved;
	}, [t]);

	const upsertAskThread = useCallback((thread: PdfAskThread) => {
		setAsk((prev) => (prev ? { ...prev, thread } : prev));
	}, []);

	const sendToThread = useCallback(
		async (
			thread: PdfAskThread,
			question: string,
			agentOpts?: { agentId?: string; modelId?: string },
			baseMessages?: PdfAskThread["messages"],
		) => {
			const threadId = thread.id;
			if (!question.trim()) return;
			const userMsg = {
				id: newMessageId(),
				role: "user" as const,
				content: question,
				createdAt: new Date().toISOString(),
			};
			const prior = baseMessages ?? thread.messages;
			const withUser: PdfAskThread = {
				...thread,
				status: "open",
				messages: [...prior, userMsg],
				updatedAt: new Date().toISOString(),
			};
			upsertAskThread(withUser);
			setAskError(null);
			setStreaming(true);

			const assistantId = newMessageId();
			const prompt = buildPlazaAskPrompt(withUser, question, {
				title: item.title,
				url: item.url ?? item.paperUrl,
			});
			try {
				const accepted = await runOnce({
					prompt,
					agentId: agentOpts?.agentId,
					modelId: agentOpts?.modelId,
					vaultPath: getVaultPath() ?? undefined,
					workflow: "free",
					autoApprove: true,
					hideFromChatHistory: true,
				});
				const withAssistant: PdfAskThread = {
					...withUser,
					messages: [
						...withUser.messages,
						{
							id: assistantId,
							role: "assistant",
							content: "",
							createdAt: new Date().toISOString(),
							agentSessionId: accepted.sessionId,
						},
					],
				};
				await attachAgentRun({
					accepted,
					disposedRef: runDisposedRef,
					unsubsRef: runUnsubsRef,
					sessionRef: askSessionRef,
					activeSessionRef,
					onArmed: () => upsertAskThread(withAssistant),
					onStream: (ev) => {
						setAsk((prev) => {
							if (!prev || prev.thread.id !== threadId) return prev;
							const msgs = [...prev.thread.messages];
							const last = msgs[msgs.length - 1];
							if (last?.id !== assistantId) return prev;
							msgs[msgs.length - 1] = {
								...last,
								content: last.content + ev.chunk,
							};
							return { ...prev, thread: { ...prev.thread, messages: msgs } };
						});
					},
					onCompleted: (ev) => {
						setAsk((prev) => {
							if (!prev || prev.thread.id !== threadId) return prev;
							const msgs = [...prev.thread.messages];
							const last = msgs[msgs.length - 1];
							if (last?.id === assistantId) {
								msgs[msgs.length - 1] = {
									...last,
									content: ev.content || last.content,
									sources: (ev.sources ?? []).map((uri) => ({ uri })),
								};
							}
							return {
								...prev,
								thread: {
									...prev.thread,
									messages: msgs,
									updatedAt: new Date().toISOString(),
								},
							};
						});
					},
					onFailed: (ev) => {
						setAskError(ev.error || t("pdfAsk.agentFailed"));
						setAsk((prev) => {
							if (!prev || prev.thread.id !== threadId) return prev;
							return {
								...prev,
								thread: {
									...prev.thread,
									messages: prev.thread.messages.filter(
										(m) => m.id !== assistantId,
									),
								},
							};
						});
					},
					onSettled: () => setStreaming(false),
				});
			} catch (e) {
				setStreaming(false);
				setAskError(e instanceof Error ? e.message : t("pdfAsk.agentFailed"));
			}
		},
		[item.title, item.url, item.paperUrl, upsertAskThread, t],
	);

	const sendAskQuestion = useCallback(
		(question: string) => {
			const current = askRef.current;
			if (!current) return;
			void (async () => {
				try {
					const resolved = await resolveAskAgent();
					if (!resolved) return;
					void sendToThread(current.thread, question, {
						agentId: resolved.agentId,
						modelId: resolved.modelId,
					});
				} catch (e) {
					const message = errorText(e);
					notifyError(message);
					setAskError(message);
				}
			})();
		},
		[resolveAskAgent, sendToThread],
	);

	const resendAskQuestion = useCallback(
		(messageId: string, question: string) => {
			const current = askRef.current;
			if (!current) return;
			const index = current.thread.messages.findIndex(
				(m) => m.id === messageId && m.role === "user",
			);
			if (index < 0) return;
			const baseMessages = current.thread.messages.slice(0, index);
			void (async () => {
				try {
					const resolved = await resolveAskAgent();
					if (!resolved) return;
					void sendToThread(
						current.thread,
						question,
						{
							agentId: resolved.agentId,
							modelId: resolved.modelId,
						},
						baseMessages,
					);
				} catch (e) {
					const message = errorText(e);
					notifyError(message);
					setAskError(message);
				}
			})();
		},
		[resolveAskAgent, sendToThread],
	);

	const stopAskStreaming = useCallback(() => {
		const sid = askSessionRef.current;
		if (!sid) return;
		askSessionRef.current = null;
		if (activeSessionRef.current === sid) activeSessionRef.current = null;
		void cancelAgentRun(sid).catch(() => undefined);
		setStreaming(false);
	}, []);

	const hideAsk = useCallback(() => {
		stopAskStreaming();
		const current = askRef.current;
		if (current && !threadHasUserQuestion(current.thread)) {
			setAsk(null);
			setAskError(null);
			return;
		}
		setAsk(null);
		setAskError(null);
	}, [stopAskStreaming]);

	const deleteAsk = useCallback(() => {
		stopAskStreaming();
		setAsk(null);
		setAskError(null);
	}, [stopAskStreaming]);

	return {
		menu,
		ask,
		streaming,
		askError,
		closeMenu,
		handleCopy,
		handleAsk,
		handleAddToChat,
		sendAskQuestion,
		resendAskQuestion,
		hideAsk,
		deleteAsk,
		stopAskStreaming,
		itemTitle: item.title,
		itemLink: item.url ?? item.paperUrl ?? undefined,
	};
}
