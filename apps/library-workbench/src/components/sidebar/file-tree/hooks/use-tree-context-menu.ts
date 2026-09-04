/**
 * Right-click menu state for the vault tree: which row is targeted, the derived
 * menu capabilities, and every menu action (reveal, terminal, create, rename,
 * cut/paste, move, delete, library export, empty trash).
 */
import {
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { broadcastAgentAttachContext } from "@/lib/agent/context-attach";
import { copyTextToClipboard } from "@/lib/core/clipboard";
import { isTauri } from "@/lib/core/tauri";
import { isPaperDirectory } from "@/lib/paper";
import { LIBRARY_VIRTUAL_PATH, TRASH_VIRTUAL_PATH } from "@/lib/paper/api";
import { PLAZA_SOURCES, PLAZA_VIRTUAL_PATH } from "@/lib/plaza";
import { getSettings, patchSettings } from "@/lib/settings/react-store";
import { type FileNode, resolveCreateParent } from "@/lib/vault";
import { openInTerminal, revealInFileManager } from "@/lib/vault/reveal";
import type { TreeContextMenuPortalProps } from "../tree-context-menu";
import { pathKey } from "../tree-helpers";
import type {
	TreeContextMenu,
	TreeCreateDraft,
	TreeCreateKind,
	TreeRenameDraft,
} from "../types";

/** Virtual rows and `agentero:` pseudo paths have no OS location. */
function canRevealPath(path: string): boolean {
	return Boolean(path) && !path.startsWith("agentero:");
}

export type TreeContextMenuState = {
	/** Non-null while the menu is open — spread onto `TreeContextMenuPortal`. */
	menuProps: TreeContextMenuPortalProps | null;
	/** Reveal / open-in-terminal failure shown under the tree. */
	revealError: string | null;
	handleContextMenuPath: (path: string, event: ReactMouseEvent) => void;
};

export function useTreeContextMenu({
	nodes,
	vaultPath,
	byPath,
	cutPaths,
	cutPathKeys,
	createDraft,
	renameDraft,
	libraryExportBusy,
	citingScanBusy,
	pathsForAction,
	prepareContextSelection,
	openMovePicker,
	onExportLibrary,
	onDiscoverCiting,
	onEmptyTrash,
	onOpenPaperNotes,
	onEditPaperMeta,
	onStartCreate,
	onStartRename,
	onDeletePath,
	onDeletePaths,
	onCutPaths,
	onPasteInto,
	onMoveTo,
}: {
	nodes: FileNode[];
	vaultPath: string | null;
	byPath: ReadonlyMap<string, FileNode>;
	cutPaths: string[];
	cutPathKeys: ReadonlySet<string>;
	createDraft: TreeCreateDraft | null;
	renameDraft?: TreeRenameDraft | null;
	libraryExportBusy: boolean;
	citingScanBusy: boolean;
	pathsForAction: (path: string) => string[];
	/** Right-click keeps an existing group, otherwise makes this the sole target. */
	prepareContextSelection: (path: string) => void;
	openMovePicker: (paths: string[], anchor?: { x: number; y: number }) => void;
	onExportLibrary?: () => void | Promise<void>;
	onDiscoverCiting?: () => void | Promise<void>;
	onEmptyTrash?: () => void | Promise<void>;
	onOpenPaperNotes?: (paperDir: string) => void;
	onEditPaperMeta?: (paperDir: string) => void;
	onStartCreate?: (kind: TreeCreateKind, parentPath: string) => void;
	onStartRename?: (path: string) => void;
	onDeletePath?: (path: string) => void | Promise<void>;
	onDeletePaths?: (paths: string[]) => void | Promise<void>;
	onCutPaths?: (paths: string[]) => void;
	onPasteInto?: (targetPath: string) => void;
	onMoveTo?: (paths: string[], destParentRel: string) => void;
}): TreeContextMenuState {
	const { t } = useTranslation("sidebar");
	const [menu, setMenu] = useState<TreeContextMenu | null>(null);
	const [revealError, setRevealError] = useState<string | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const close = useCallback(() => setMenu(null), []);

	const handleContextMenuPath = useCallback(
		(path: string, event: ReactMouseEvent) => {
			if (createDraft || renameDraft) return;
			// Real vault paths + virtual Library (export) / Recycle Bin (empty) /
			// Plaza root (source visibility toggles).
			if (
				!canRevealPath(path) &&
				path !== TRASH_VIRTUAL_PATH &&
				path !== LIBRARY_VIRTUAL_PATH &&
				path !== PLAZA_VIRTUAL_PATH
			) {
				return;
			}
			// Library menu only when it has at least one action wired.
			if (
				path === LIBRARY_VIRTUAL_PATH &&
				!onExportLibrary &&
				!onDiscoverCiting
			) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			prepareContextSelection(path);
			setRevealError(null);
			setMenu({ path, x: event.clientX, y: event.clientY });
		},
		[
			createDraft,
			renameDraft,
			onExportLibrary,
			onDiscoverCiting,
			prepareContextSelection,
		],
	);

	const reveal = useCallback(
		(path: string) => {
			setMenu(null);
			if (!canRevealPath(path)) return;
			if (!isTauri()) {
				setRevealError(t("fileTree.revealDesktopOnly"));
				return;
			}
			setRevealError(null);
			void revealInFileManager(path).catch(() => {
				setRevealError(t("fileTree.revealFailed"));
			});
		},
		[t],
	);

	const openTerminal = useCallback(
		(path: string) => {
			setMenu(null);
			if (!canRevealPath(path)) return;
			if (!isTauri()) {
				setRevealError(t("fileTree.openInTerminalDesktopOnly"));
				return;
			}
			setRevealError(null);
			void openInTerminal(path).catch(() => {
				setRevealError(t("fileTree.openInTerminalFailed"));
			});
		},
		[t],
	);

	const copyPath = useCallback(
		(path: string) => {
			setMenu(null);
			void copyTextToClipboard(path, {
				successMessage: t("fileTree.copiedPath"),
				errorMessage: t("fileTree.copyPathFailed"),
				successNotify: { duration: 2000 },
			});
		},
		[t],
	);

	// Toggle a Plaza source without closing the menu (multi-toggle friendly).
	const togglePlazaSource = useCallback((id: string) => {
		const current = getSettings().plazaHiddenSources;
		patchSettings({
			plazaHiddenSources: current.includes(id)
				? current.filter((s) => s !== id)
				: [...current, id],
		});
	}, []);

	if (!menu) {
		return { menuProps: null, revealError, handleContextMenuPath };
	}

	const targets = pathsForAction(menu.path);
	const menuNode = byPath.get(menu.path);
	const isPaperMenu =
		menuNode?.kind === "directory" &&
		isPaperDirectory(menuNode.path, menuNode.children);
	const targetIsVirtual =
		menu.path === LIBRARY_VIRTUAL_PATH || menu.path === TRASH_VIRTUAL_PATH;
	const targetKey = pathKey(menu.path);
	const canPasteAtTarget =
		cutPaths.length > 0 &&
		!targetIsVirtual &&
		Boolean(menu.path) &&
		!cutPathKeys.has(targetKey) &&
		!cutPaths.some((p) => targetKey.startsWith(`${pathKey(p)}/`));

	const menuProps: TreeContextMenuPortalProps = {
		menu,
		menuRef,
		menuCount: targets.length,
		menuNodeName: menuNode?.name,
		isPaperMenu,
		libraryExportBusy,
		citingScanBusy,
		canPasteAtTarget,
		plazaSources:
			menu.path === PLAZA_VIRTUAL_PATH
				? PLAZA_SOURCES.map((source) => ({
						source,
						hidden: getSettings().plazaHiddenSources.includes(source.id),
					}))
				: undefined,
		onTogglePlazaSource:
			menu.path === PLAZA_VIRTUAL_PATH ? togglePlazaSource : undefined,
		onClose: close,
		onExportLibrary: onExportLibrary
			? () => {
					setMenu(null);
					void onExportLibrary();
				}
			: undefined,
		onDiscoverCiting: onDiscoverCiting
			? () => {
					setMenu(null);
					void onDiscoverCiting();
				}
			: undefined,
		onEmptyTrash: onEmptyTrash
			? () => {
					setMenu(null);
					void onEmptyTrash();
				}
			: undefined,
		onOpenNotes: onOpenPaperNotes
			? () => {
					setMenu(null);
					onOpenPaperNotes(menu.path);
				}
			: undefined,
		onEditMeta:
			isPaperMenu && onEditPaperMeta
				? () => {
						setMenu(null);
						onEditPaperMeta(menu.path);
					}
				: undefined,
		onAddToChat:
			!targetIsVirtual && menu.path && !menu.path.startsWith("agentero:")
				? () => {
						setMenu(null);
						broadcastAgentAttachContext([menu.path]);
					}
				: undefined,
		onNewFile:
			onStartCreate && vaultPath
				? () => {
						const parent = resolveCreateParent(vaultPath, menu.path, nodes);
						setMenu(null);
						onStartCreate("file", parent);
					}
				: undefined,
		onNewFolder:
			onStartCreate && vaultPath
				? () => {
						const parent = resolveCreateParent(vaultPath, menu.path, nodes);
						setMenu(null);
						onStartCreate("folder", parent);
					}
				: undefined,
		onCopyPath: () => copyPath(menu.path),
		onCut:
			onCutPaths && !targetIsVirtual
				? () => {
						setMenu(null);
						onCutPaths(targets);
					}
				: undefined,
		onPaste: onPasteInto
			? () => {
					setMenu(null);
					onPasteInto(menu.path);
				}
			: undefined,
		onReveal: () => reveal(menu.path),
		onOpenInTerminal: () => openTerminal(menu.path),
		onMove: onMoveTo
			? () => {
					const anchor = { x: menu.x, y: menu.y };
					setMenu(null);
					openMovePicker(targets, anchor);
				}
			: undefined,
		onRename: onStartRename
			? () => {
					setMenu(null);
					onStartRename(menu.path);
				}
			: undefined,
		onDelete:
			onDeletePath || onDeletePaths
				? () => {
						setMenu(null);
						if (targets.length > 1 && onDeletePaths)
							void onDeletePaths(targets);
						else if (onDeletePath && targets[0]) void onDeletePath(targets[0]);
					}
				: undefined,
	};

	return { menuProps, revealError, handleContextMenuPath };
}
