/**
 * Lightweight root for `?window=doc&path=…` document popouts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	DocView,
	type DocViewEditorProps,
	type DocViewLibraryProps,
	type DocViewPdfProps,
} from "@/components/workspace/doc-view";
import { useSettings, useVaultStore } from "@/hooks/use-app-stores";
import { isMacOS, isTauri } from "@/lib/core/tauri";
import { isLibraryVirtualPath, isTrashVirtualPath } from "@/lib/paper/api";
import { refreshLibrary } from "@/lib/paper/library-store";
import { applyDocumentChrome, resolveFontFamilyCss } from "@/lib/settings";
import { readDocWindowParams } from "@/lib/shell/doc-window";
import { openSettingsWindow } from "@/lib/shell/settings-window";
import { openRecentVault } from "@/lib/vault/actions";
import { refreshTree, vaultStore } from "@/lib/vault/store";
import { persistFile } from "@/lib/workspace/actions";
import {
	createPlaceholderTab,
	type DocTab,
	loadTabResources,
} from "@/lib/workspace/tabs";
import type { CenterViewMode } from "@/lib/workspace/viewer";

function closeCurrentWindow() {
	if (!isTauri()) return;
	void (async () => {
		try {
			const { getCurrentWindow } = await import("@tauri-apps/api/window");
			await getCurrentWindow().close();
		} catch {
			// ignore
		}
	})();
}

// DocView's memo compares domain objects by identity; the popout never shows
// Library / PDF-chrome surfaces, so constant no-op stubs keep it that way.
const LIBRARY_STUB: DocViewLibraryProps = {
	papers: [],
	loading: false,
	query: "",
	onQueryChange: () => {},
	scopePath: null,
	columns: [],
	onColumnsChange: () => {},
	rescanning: false,
	onOpenPaper: () => {},
	onRescan: () => {},
};
const PDF_STUB: DocViewPdfProps = {
	onOpenSettings: () => openSettingsWindow("general"),
	registerHandle: () => {},
	onHighlightsChange: () => {},
	onAsksChange: () => {},
	onVisualTracesChange: () => {},
};
const NOOP_TRASH_CHANGED = () => {};

export function DocWindowRoot() {
	const { t } = useTranslation(["app"]);
	const isMac = useMemo(() => isMacOS(), []);
	const params = useMemo(() => readDocWindowParams(), []);
	const [tab, setTab] = useState<DocTab | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [ready, setReady] = useState(false);

	const vaultPath = useVaultStore((s) => s.vaultPath);
	const fontSize = useSettings((s) => s.editorFontSize);
	const textFontFamily = useSettings((s) => s.textFontFamily);
	const lineHeight = useSettings((s) => s.editorLineHeight);
	const showToolbar = useSettings((s) => s.showEditorToolbar);
	const uiScale = useSettings((s) => s.uiScale);
	const interfaceFontFamily = useSettings((s) => s.interfaceFontFamily);
	const monoFontFamily = useSettings((s) => s.monoFontFamily);
	const fontFamily = resolveFontFamilyCss(textFontFamily, "text");

	useEffect(() => {
		applyDocumentChrome({
			uiScale,
			interfaceFontFamily,
			monoFontFamily,
		});
	}, [uiScale, interfaceFontFamily, monoFontFamily]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const path = params.path;
			if (!path) {
				setError(t("windows.docMissingPath"));
				setReady(true);
				return;
			}
			if (isLibraryVirtualPath(path) || isTrashVirtualPath(path)) {
				setError(t("windows.docUnsupported"));
				setReady(true);
				return;
			}
			const vault = params.vaultPath;
			if (vault) {
				await openRecentVault(vault);
				if (!cancelled) {
					await refreshTree(vault);
					await refreshLibrary();
				}
			}
			if (cancelled) return;

			const preferMode = (params.mode as CenterViewMode | null) ?? undefined;
			const placeholder = createPlaceholderTab(path, preferMode);
			setTab(placeholder);

			const vs = vaultStore.getState();
			const res = await loadTabResources(
				path,
				vs.vaultPath,
				vs.tree,
				vs.paperFolders,
			);
			if (cancelled) return;
			if (res.error) setError(res.error);

			const next: DocTab = {
				...placeholder,
				kind: res.kind,
				title: res.title,
				mode: res.mode,
				paperMeta: res.paperMeta,
				pdfUrl: res.pdfUrl,
				pdfBytes: res.pdfBytes ?? null,
				htmlUrl: res.htmlUrl,
				imageUrl: res.imageUrl,
				notesPath: res.notesPath,
				notesSeed: res.notesSeed,
				markdownSeed: res.markdownSeed,
				seedKey: 1,
				loaded: true,
			};
			setTab(next);
			setReady(true);
			if (typeof document !== "undefined" && res.title) {
				document.title = res.title;
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [params.path, params.mode, params.vaultPath, t]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const isEsc = event.key === "Escape";
			const isCloseWindow =
				(event.key === "w" || event.code === "KeyW") &&
				(event.metaKey || event.ctrlKey);
			if (isEsc || (isCloseWindow && !event.altKey && !event.shiftKey)) {
				event.preventDefault();
				closeCurrentWindow();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const onTabPatch = useCallback((id: string, patch: Partial<DocTab>) => {
		setTab((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
	}, []);

	const editorProps = useMemo<DocViewEditorProps>(
		() => ({
			fontSize,
			fontFamily,
			lineHeight,
			showToolbar,
			notesPlaceholder: t("editor.notesPlaceholder"),
			markdownPlaceholder: t("editor.markdownPlaceholder"),
			onPersistFile: persistFile,
			onAssetsChanged: () => {
				if (vaultPath) void refreshTree(vaultPath);
			},
			onTabPatch,
		}),
		[fontSize, fontFamily, lineHeight, showToolbar, t, vaultPath, onTabPatch],
	);

	const title = tab?.title ?? t("tabs.strip");

	return (
		<div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
			{isMac ? (
				<header className="flex h-8 shrink-0 items-center border-b bg-muted/40 select-none">
					<div
						className="w-[92px] shrink-0 self-stretch"
						data-tauri-drag-region
					/>
					<div
						className="min-w-0 flex-1 truncate px-2 text-xs font-medium text-muted-foreground"
						data-tauri-drag-region
					>
						{title}
					</div>
				</header>
			) : null}

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{!ready || !tab ? (
					<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
						{error ?? t("windows.loading")}
					</div>
				) : (
					<DocView
						tab={tab}
						active
						keepMounted
						vaultPath={vaultPath}
						library={LIBRARY_STUB}
						editor={editorProps}
						pdf={PDF_STUB}
						onTrashChanged={NOOP_TRASH_CHANGED}
					/>
				)}
			</div>
		</div>
	);
}
