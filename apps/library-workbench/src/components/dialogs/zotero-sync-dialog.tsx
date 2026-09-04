import { homeDir, join } from "@tauri-apps/api/path";
import { CheckCircle2, FolderOpen, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettings } from "@/hooks/use-app-stores";
import { useOverlayRegistration } from "@/hooks/use-overlay-registration";
import { errorText } from "@/lib/core/error";
import { readJsonStorage, writeJsonStorage } from "@/lib/core/storage";
import { isTauri } from "@/lib/core/tauri";
import { pickZoteroDir } from "@/lib/paper/import/zotero-migrate";
import {
	syncZotero,
	type ZoteroSyncResult,
} from "@/lib/paper/import/zotero-sync";

const OPTS_KEY = "motif.zotero.sync.opts";
type SavedOpts = {
	pullMetadata: boolean;
	pullNotes: boolean;
	pullAnnotations: boolean;
	pushNotes: boolean;
	dir: string;
};
const DEFAULT_OPTS: SavedOpts = {
	pullMetadata: true,
	pullNotes: true,
	pullAnnotations: true,
	pushNotes: true,
	dir: "",
};
function loadOpts(): SavedOpts {
	const stored = readJsonStorage<Partial<SavedOpts>>(OPTS_KEY, {});
	return { ...DEFAULT_OPTS, ...stored };
}

/**
 * Bidirectional Zotero sync: pull (metadata / child notes / annotations) and
 * push (NOTES.md → Agentero-marked Zotero child note). Push writes offline to
 * `zotero.sqlite` — Zotero must be closed; a timestamped backup is created
 * first. Options and the chosen folder are remembered.
 */
export function ZoteroSyncDialog({
	open,
	onOpenChange,
	vaultPath,
	onDone,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	vaultPath: string | null;
	onDone: () => void;
}) {
	const { t } = useTranslation(["sidebar", "app"]);
	const zoteroSyncDir = useSettings((s) => s.zoteroSyncDir);
	const saved = loadOpts();
	const [dir, setDir] = useState<string | null>(null);
	const [detecting, setDetecting] = useState(false);
	const [pullMetadata, setPullMetadata] = useState(saved.pullMetadata);
	const [pullNotes, setPullNotes] = useState(saved.pullNotes);
	const [pullAnnotations, setPullAnnotations] = useState(saved.pullAnnotations);
	const [pushNotes, setPushNotes] = useState(saved.pushNotes);
	// One-shot recovery option: re-push every linked paper regardless of the
	// change watermark. Deliberately NOT persisted across runs.
	const [forcePush, setForcePush] = useState(false);
	const [progress, setProgress] = useState<{
		current: number;
		total: number;
		phase: string;
	} | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<ZoteroSyncResult | null>(null);

	useOverlayRegistration("zotero-sync", open, () => onOpenChange(false));

	const reset = () => {
		setProgress(null);
		setBusy(false);
		setError(null);
		setResult(null);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && !busy) reset();
		onOpenChange(next);
	};

	const chooseFolder = async () => {
		setError(null);
		const picked = await pickZoteroDir();
		if (picked) setDir(picked);
	};

	// On open: prefer the settings dir, then the remembered dir, then
	// auto-detect ~/Zotero so most users skip browsing.
	useEffect(() => {
		if (!open || dir || !isTauri()) return;
		let cancelled = false;
		void (async () => {
			setDetecting(true);
			try {
				const candidates = [zoteroSyncDir, saved.dir];
				if (!candidates.some(Boolean)) {
					candidates.push(await join(await homeDir(), "Zotero"));
				}
				for (const c of candidates) {
					if (!c) continue;
					if (!cancelled) setDir(c);
					break;
				}
			} catch {
				// no default library — the user picks the folder manually
			} finally {
				if (!cancelled) setDetecting(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, dir, zoteroSyncDir, saved.dir]);

	const handleSync = async () => {
		if (!vaultPath || !dir) return;
		writeJsonStorage(OPTS_KEY, {
			pullMetadata,
			pullNotes,
			pullAnnotations,
			pushNotes,
			dir,
		});
		setBusy(true);
		setError(null);
		setProgress({ current: 0, total: 0, phase: "read" });
		try {
			const res = await syncZotero({
				vaultPath,
				zoteroDir: dir,
				pullMetadata,
				pullNotes,
				pullAnnotations,
				pushNotes,
				forcePush,
				onProgress: (current, total, phase) =>
					setProgress({ current, total, phase }),
			});
			setForcePush(false);
			setResult(res);
			onDone();
		} catch (e) {
			setError(errorText(e));
		} finally {
			setBusy(false);
			setProgress(null);
		}
	};

	const syncDisabled = busy || !dir || !vaultPath;
	const pct =
		progress && progress.total > 0
			? Math.round((progress.current / progress.total) * 100)
			: null;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="flex max-h-[85vh] flex-col sm:max-w-xl"
				aria-describedby={undefined}
			>
				<DialogHeader>
					<DialogTitle>{t("sidebar:zoteroSync.title")}</DialogTitle>
				</DialogHeader>

				<div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
					{result ? (
						<div className="space-y-3 py-1">
							<div className="flex items-center gap-2 font-medium text-sm">
								<CheckCircle2 className="size-5 text-emerald-500" />
								{t("sidebar:zoteroSync.summaryTitle")}
							</div>
							<ul className="space-y-1 text-muted-foreground text-sm">
								<li>
									{t("sidebar:zoteroSync.summaryLinked", {
										count: result.linked,
									})}
								</li>
								{result.metadataFilled > 0 ? (
									<li>
										{t("sidebar:zoteroSync.summaryMetadata", {
											count: result.metadataFilled,
										})}
									</li>
								) : null}
								{result.notesPulled > 0 ? (
									<li>
										{t("sidebar:zoteroSync.summaryNotesPulled", {
											count: result.notesPulled,
										})}
									</li>
								) : null}
								{result.annotationsPulled > 0 ? (
									<li>
										{t("sidebar:zoteroSync.summaryAnnotationsPulled", {
											count: result.annotationsPulled,
										})}
									</li>
								) : null}
								{result.notesPushed > 0 ? (
									<li>
										{t("sidebar:zoteroSync.summaryNotesPushed", {
											count: result.notesPushed,
										})}
									</li>
								) : null}
								{result.unlinked > 0 ? (
									<li>
										{t("sidebar:zoteroSync.summaryUnlinked", {
											count: result.unlinked,
										})}
									</li>
								) : null}
								{result.errors.length > 0 ? (
									<li className="text-destructive">
										{t("sidebar:zoteroSync.summaryErrors", {
											count: result.errors.length,
										})}
									</li>
								) : null}
							</ul>
							{result.conflicts.length > 0 ? (
								<div className="space-y-1.5">
									<p className="flex items-center gap-1.5 font-medium text-sm">
										<TriangleAlert className="size-4 text-amber-500" />
										{t("sidebar:zoteroSync.conflictsTitle", {
											count: result.conflicts.length,
										})}
									</p>
									<ScrollArea className="h-28 rounded border p-2">
										<ul className="space-y-1 text-xs">
											{result.conflicts.map((c) => (
												<li key={c.paperPath} className="text-muted-foreground">
													<span className="text-foreground">{c.title}</span> —{" "}
													{c.reason}
												</li>
											))}
										</ul>
									</ScrollArea>
								</div>
							) : null}
							{result.errors.length > 0 ? (
								<ScrollArea className="h-20 rounded border p-2">
									<ul className="space-y-1 text-destructive text-xs">
										{result.errors.map((e, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: error list
											<li key={i}>{e}</li>
										))}
									</ul>
								</ScrollArea>
							) : null}
						</div>
					) : (
						<div className="space-y-4">
							<Button
								type="button"
								variant="outline"
								className="w-full justify-start gap-2"
								onClick={() => void chooseFolder()}
								disabled={busy || detecting}
							>
								<FolderOpen className="size-4 shrink-0" />
								<span className="truncate">
									{dir ?? t("sidebar:zoteroSync.chooseFolder")}
								</span>
							</Button>

							{detecting ? (
								<p className="flex items-center gap-2 text-muted-foreground text-sm">
									<Loader2 className="size-3.5 animate-spin" />
									{t("sidebar:zoteroSync.detecting")}
								</p>
							) : null}

							<div className="grid grid-cols-2 gap-x-3 gap-y-2">
								<Toggle
									id="zsync-pull-metadata"
									checked={pullMetadata}
									onChange={setPullMetadata}
									disabled={busy}
									label={t("sidebar:zoteroSync.pullMetadata")}
								/>
								<Toggle
									id="zsync-pull-notes"
									checked={pullNotes}
									onChange={setPullNotes}
									disabled={busy}
									label={t("sidebar:zoteroSync.pullNotes")}
								/>
								<Toggle
									id="zsync-pull-annotations"
									checked={pullAnnotations}
									onChange={setPullAnnotations}
									disabled={busy}
									label={t("sidebar:zoteroSync.pullAnnotations")}
								/>
								<Toggle
									id="zsync-push-notes"
									checked={pushNotes}
									onChange={setPushNotes}
									disabled={busy}
									label={t("sidebar:zoteroSync.pushNotes")}
								/>
								{pushNotes ? (
									<Toggle
										id="zsync-force-push"
										checked={forcePush}
										onChange={setForcePush}
										disabled={busy}
										label={t("sidebar:zoteroSync.forcePush")}
									/>
								) : null}
							</div>

							{pushNotes ? (
								<p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs leading-relaxed">
									<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
									<span>{t("sidebar:zoteroSync.pushWarning")}</span>
								</p>
							) : null}

							{busy && progress ? (
								<div className="space-y-1.5">
									<Progress value={pct ?? 0} />
									<p className="text-muted-foreground text-xs">
										{t(`sidebar:zoteroSync.phase.${progress.phase}`, {
											defaultValue: progress.phase,
										})}
										{pct !== null ? ` ${pct}%` : ""}
									</p>
								</div>
							) : null}

							{error ? (
								<p className="text-destructive text-xs leading-snug">{error}</p>
							) : null}
						</div>
					)}
				</div>

				<DialogFooter>
					{result ? (
						<Button onClick={() => handleOpenChange(false)}>
							{t("sidebar:zoteroSync.done")}
						</Button>
					) : (
						<>
							<Button
								variant="ghost"
								onClick={() => handleOpenChange(false)}
								disabled={busy}
							>
								{t("sidebar:zoteroSync.cancel")}
							</Button>
							<Button onClick={() => void handleSync()} disabled={syncDisabled}>
								{busy ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									t("sidebar:zoteroSync.run")
								)}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function Toggle({
	id,
	checked,
	onChange,
	disabled,
	label,
}: {
	id: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
	label: string;
}) {
	return (
		<div className="flex items-center gap-2">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(v) => onChange(v === true)}
				disabled={disabled}
			/>
			<label htmlFor={id} className="cursor-pointer text-sm">
				{label}
			</label>
		</div>
	);
}
