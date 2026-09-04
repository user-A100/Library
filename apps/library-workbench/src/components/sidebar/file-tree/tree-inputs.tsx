import { FileText, FolderPlus } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/core/utils";
import { isValidVaultEntryName } from "@/lib/vault";
import type { TreeCreateKind } from "./types";

/** Inline name input — VS Code / Cursor style create. */
export function TreeCreateInput({
	kind,
	onConfirm,
	onCancel,
}: {
	kind: TreeCreateKind;
	onConfirm: (name: string) => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation("sidebar");
	const defaultName = kind === "file" ? "Untitled.md" : "New Folder";
	const [value, setValue] = useState(defaultName);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const committedRef = useRef(false);

	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.focus();
		// Select basename without extension for files (IDE-like).
		if (kind === "file") {
			const dot = defaultName.lastIndexOf(".");
			if (dot > 0) el.setSelectionRange(0, dot);
			else el.select();
		} else {
			el.select();
		}
	}, [kind, defaultName]);

	const commit = useCallback(() => {
		if (committedRef.current) return;
		const name = value.trim();
		if (!name) {
			committedRef.current = true;
			onCancel();
			return;
		}
		if (!isValidVaultEntryName(name)) {
			setError(t("fileTree.invalidName"));
			// Keep editing; re-focus next tick.
			requestAnimationFrame(() => inputRef.current?.focus());
			return;
		}
		committedRef.current = true;
		onConfirm(name);
	}, [value, onCancel, onConfirm, t]);

	const cancel = useCallback(() => {
		if (committedRef.current) return;
		committedRef.current = true;
		onCancel();
	}, [onCancel]);

	const Icon = kind === "file" ? FileText : FolderPlus;

	// Match virtualized row height (estimateSize ≈ 28px / h-7). Extra outer
	// padding or an in-flow error line used to measure taller than siblings;
	// after draft removal the virtualizer kept that size by index and left a gap.
	return (
		<div className="relative">
			<div
				className={cn(
					"flex h-7 items-center gap-1 rounded px-4",
					error ? "bg-destructive/10" : "bg-muted/60",
				)}
			>
				<Icon className="size-4 shrink-0 text-muted-foreground" />
				<input
					ref={inputRef}
					type="text"
					value={value}
					title={error ?? undefined}
					aria-label={
						kind === "file" ? t("fileTree.newFile") : t("fileTree.newFolder")
					}
					aria-invalid={Boolean(error)}
					className={cn(
						"h-5 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-sm outline-none",
						error && "border-destructive",
					)}
					onChange={(e) => {
						setValue(e.target.value);
						if (error) setError(null);
					}}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === "Enter") {
							e.preventDefault();
							commit();
						} else if (e.key === "Escape") {
							e.preventDefault();
							cancel();
						}
					}}
					onBlur={() => {
						// Defer so Enter/click handlers run first.
						requestAnimationFrame(() => {
							if (!committedRef.current) commit();
						});
					}}
				/>
			</div>
			{error ? (
				<p className="pointer-events-none absolute top-full right-0 left-8 z-10 mt-0.5 rounded bg-background/95 px-1 text-destructive text-[0.6875rem] leading-tight shadow-sm">
					{error}
				</p>
			) : null}
		</div>
	);
}

/** Inline name input for renaming a file/folder (VS Code / Finder style). */
export function TreeRenameInput({
	initialName,
	icon,
	onConfirm,
	onCancel,
}: {
	initialName: string;
	icon: ReactNode;
	onConfirm: (name: string) => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation("sidebar");
	const [value, setValue] = useState(initialName);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const committedRef = useRef(false);

	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.focus();
		el.select();
	}, []);

	const commit = useCallback(() => {
		if (committedRef.current) return;
		const name = value.trim();
		if (!name) {
			committedRef.current = true;
			onCancel();
			return;
		}
		if (!isValidVaultEntryName(name)) {
			setError(t("fileTree.invalidName"));
			requestAnimationFrame(() => inputRef.current?.focus());
			return;
		}
		if (name === initialName) {
			committedRef.current = true;
			onCancel();
			return;
		}
		committedRef.current = true;
		onConfirm(name);
	}, [value, initialName, onCancel, onConfirm, t]);

	const cancel = useCallback(() => {
		if (committedRef.current) return;
		committedRef.current = true;
		onCancel();
	}, [onCancel]);

	return (
		<div className="relative">
			<div
				className={cn(
					"flex h-7 items-center gap-1 rounded px-4",
					error ? "bg-destructive/10" : "bg-muted/60",
				)}
			>
				{icon}
				<input
					ref={inputRef}
					type="text"
					value={value}
					title={error ?? undefined}
					aria-label={t("fileTree.rename")}
					aria-invalid={Boolean(error)}
					className={cn(
						"h-5 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-sm outline-none",
						error && "border-destructive",
					)}
					onChange={(e) => {
						setValue(e.target.value);
						if (error) setError(null);
					}}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === "Enter") {
							e.preventDefault();
							commit();
						} else if (e.key === "Escape") {
							e.preventDefault();
							cancel();
						}
					}}
					onBlur={() => {
						requestAnimationFrame(() => {
							if (!committedRef.current) commit();
						});
					}}
				/>
			</div>
			{error ? (
				<p className="pointer-events-none absolute top-full right-0 left-8 z-10 mt-0.5 rounded bg-background/95 px-1 text-destructive text-[0.6875rem] leading-tight shadow-sm">
					{error}
				</p>
			) : null}
		</div>
	);
}
