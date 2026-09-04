import { ScanSearch, TextSelect, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ContextPathIcon } from "@/components/agent/context-path-icon";
import type { AgentSkill } from "@/lib/agent";
import type { SelectionContext } from "@/lib/agent/selection-store";
import type { PdfVisualDraft } from "@/lib/agent/visual-context-store";
import { basenameOf } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";

export function ComposerContextChips({
	compact = false,
	currentFilePath,
	currentFileLabel,
	mentionChipPaths,
	selectionChips,
	onRemoveSelection,
	visualDrafts,
	onRemoveVisualDraft,
	directoryPathSet,
	paperPathSet,
	labelForPath,
	onRemoveContextPath,
}: {
	compact?: boolean;
	currentFilePath: string | null;
	currentFileLabel: string;
	mentionChipPaths: string[];
	selectionChips: SelectionContext[];
	onRemoveSelection: (id: string) => void;
	visualDrafts: PdfVisualDraft[];
	onRemoveVisualDraft: (id: string) => void;
	directoryPathSet: ReadonlySet<string>;
	paperPathSet: ReadonlySet<string>;
	labelForPath: (path: string) => string;
	onRemoveContextPath: (path: string) => void;
}) {
	const { t } = useTranslation("agent");
	if (
		!currentFilePath &&
		mentionChipPaths.length === 0 &&
		selectionChips.length === 0 &&
		visualDrafts.length === 0
	) {
		return null;
	}
	return (
		<>
			{currentFilePath ? (
				<button
					type="button"
					className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/20 p-0 text-foreground text-xs transition-colors hover:bg-muted"
					onClick={() => onRemoveContextPath(currentFilePath)}
					title={currentFileLabel || currentFilePath}
					aria-label={t("composer.currentFileRemove")}
				>
					<ContextPathIcon
						path={currentFilePath}
						directoryPaths={directoryPathSet}
						paperPaths={paperPathSet}
					/>
				</button>
			) : null}
			{mentionChipPaths.map((path) => {
				const label = labelForPath(path);
				return (
					<button
						key={path}
						type="button"
						className={cn(
							"inline-flex items-center border bg-muted/20 text-foreground text-xs transition-colors hover:bg-muted",
							compact
								? "size-7 shrink-0 justify-center rounded-full p-0"
								: "h-8 max-w-full gap-1.5 rounded-full px-2",
						)}
						onClick={() => onRemoveContextPath(path)}
						title={t("composer.removeContext", { path })}
					>
						<ContextPathIcon
							path={path}
							directoryPaths={directoryPathSet}
							paperPaths={paperPathSet}
						/>
						{compact ? null : (
							<>
								<span className="max-w-[16rem] truncate" title={path}>
									{label}
								</span>
								<X className="size-3 shrink-0 text-muted-foreground" />
							</>
						)}
					</button>
				);
			})}
			{selectionChips.map((sel) => {
				const name = basenameOf(sel.sourcePath) || t("composer.selection");
				const label = sel.page ? `${name} · p.${sel.page}` : name;
				return (
					<button
						key={sel.id}
						type="button"
						className={cn(
							"inline-flex items-center border text-foreground text-xs transition-colors hover:bg-muted",
							compact
								? "size-7 shrink-0 justify-center rounded-full p-0"
								: "h-8 max-w-full gap-1.5 rounded-full px-2",
							sel.pinned ? "bg-muted/20" : "border-dashed bg-transparent",
						)}
						onClick={() => onRemoveSelection(sel.id)}
						title={t("composer.removeSelection")}
					>
						<TextSelect className="size-3.5 shrink-0 text-muted-foreground" />
						{compact ? null : (
							<>
								<span className="max-w-[16rem] truncate" title={sel.text}>
									{label}
								</span>
								<X className="size-3 shrink-0 text-muted-foreground" />
							</>
						)}
					</button>
				);
			})}
			{visualDrafts.map((draft) => {
				const pageLabel = t("composer.visualAnnotationPage", {
					page: draft.page,
				});
				const label =
					draft.comment.trim() ||
					`${t("composer.visualAnnotation")} · ${pageLabel}`;
				const thumb =
					draft.image.data.length > 0
						? `data:${draft.image.mimeType || "image/png"};base64,${draft.image.data}`
						: null;
				return (
					<button
						key={draft.id}
						type="button"
						className={cn(
							"inline-flex items-center border bg-muted/20 text-foreground text-xs transition-colors hover:bg-muted",
							compact
								? "size-7 shrink-0 justify-center rounded-full p-0"
								: "h-8 max-w-full gap-1.5 rounded-full px-1.5 pr-2",
						)}
						onClick={() => onRemoveVisualDraft(draft.id)}
						title={t("composer.removeVisualDraft")}
					>
						{thumb ? (
							<img
								src={thumb}
								alt=""
								className={cn(
									"shrink-0 object-cover",
									compact ? "size-5 rounded-full" : "size-5 rounded",
								)}
							/>
						) : (
							<ScanSearch className="size-3.5 shrink-0 text-muted-foreground" />
						)}
						{compact ? null : (
							<>
								<span
									className="max-w-[14rem] truncate"
									title={draft.comment || pageLabel}
								>
									{label}
								</span>
								<X className="size-3 shrink-0 text-muted-foreground" />
							</>
						)}
					</button>
				);
			})}
		</>
	);
}

export function ComposerSkillChips({
	compact = false,
	selectedSkills,
	onRemoveSkill,
}: {
	compact?: boolean;
	selectedSkills: AgentSkill[];
	onRemoveSkill: (skillId: string) => void;
}) {
	const { t } = useTranslation("agent");
	if (selectedSkills.length === 0) return null;
	return (
		<>
			{selectedSkills.map((skill) => (
				<button
					key={skill.id}
					type="button"
					className={cn(
						"inline-flex items-center border bg-muted/20 text-foreground text-xs transition-colors hover:bg-muted",
						compact
							? "size-7 shrink-0 justify-center rounded-full p-0"
							: "h-8 max-w-full gap-1.5 rounded-full px-2",
					)}
					onClick={() => onRemoveSkill(skill.id)}
					title={t("composer.removeSkill", {
						skill: skill.name,
					})}
				>
					<span className="font-mono text-muted-foreground">$</span>
					{compact ? null : (
						<>
							<span className="truncate">{skill.name}</span>
							<X className="size-3 shrink-0 text-muted-foreground" />
						</>
					)}
				</button>
			))}
		</>
	);
}
