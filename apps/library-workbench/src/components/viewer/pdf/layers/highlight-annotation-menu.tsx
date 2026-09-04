import type { AnnotationSelectionMenuProps } from "@embedpdf/plugin-annotation/react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/core/utils";
import {
	highlightColorOf,
	isHighlightObject,
} from "@/lib/pdf/highlight/annotation-store";
import {
	HIGHLIGHT_COLORS,
	type HighlightColor,
	swatchColorClass,
} from "@/lib/pdf/highlight/palette";

type HighlightAnnotationMenuProps = AnnotationSelectionMenuProps & {
	onEdit: (id: string) => void;
	onDelete: (pageIndex: number, id: string) => void;
	onChangeColor: (pageIndex: number, id: string, color: HighlightColor) => void;
};

/**
 * Selection menu for text-highlight annotations. Appears when a highlight is
 * clicked in the PDF so plain highlights (no comment / no gutter pin) can still
 * be edited, recolored, or deleted without opening the side panel.
 */
export function HighlightAnnotationMenu({
	context,
	selected,
	placement,
	menuWrapperProps,
	onEdit,
	onDelete,
	onChangeColor,
}: HighlightAnnotationMenuProps) {
	const { t } = useTranslation("viewer");

	if (!selected || context.type !== "annotation") return null;
	const obj = context.annotation.object;
	if (!isHighlightObject(obj)) return null;
	const activeColor = highlightColorOf(obj);

	return (
		<div {...menuWrapperProps}>
			<TooltipProvider delayDuration={200}>
				<div
					role="toolbar"
					aria-label={t("selection.highlightMenuLabel")}
					className={cn(
						"pointer-events-auto absolute left-1/2 z-10 flex h-10 items-center gap-0.5 rounded-xl border border-border/80 bg-background px-1 shadow-lg ring-1 ring-black/5 dark:ring-white/10",
						placement.suggestTop ? "top-full mt-1.5" : "bottom-full mb-1.5",
					)}
					style={{ transform: "translateX(-50%)" }}
				>
					{HIGHLIGHT_COLORS.map((color) => (
						<Tooltip key={color}>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={t(`selection.color.${color}`)}
									aria-pressed={activeColor === color}
									className={cn(
										"mx-0.5 size-4 shrink-0 rounded-full ring-1 ring-black/15 transition hover:scale-110 dark:ring-white/25",
										swatchColorClass(color),
										activeColor === color &&
											"ring-2 ring-offset-1 ring-offset-background ring-foreground/70",
									)}
									onClick={() =>
										onChangeColor(context.pageIndex, obj.id, color)
									}
								/>
							</TooltipTrigger>
							<TooltipContent side={placement.suggestTop ? "bottom" : "top"}>
								{t(`selection.color.${color}`)}
							</TooltipContent>
						</Tooltip>
					))}
					<div className="mx-1 h-5 w-px shrink-0 bg-border" />
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="text-muted-foreground hover:text-foreground"
								aria-label={t("selection.editComment")}
								onClick={() => onEdit(obj.id)}
							>
								<Pencil className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side={placement.suggestTop ? "bottom" : "top"}>
							{t("selection.editComment")}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="text-muted-foreground hover:text-destructive"
								aria-label={t("selection.removeHighlight")}
								onClick={() => onDelete(context.pageIndex, obj.id)}
							>
								<Trash2 className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side={placement.suggestTop ? "bottom" : "top"}>
							{t("selection.removeHighlight")}
						</TooltipContent>
					</Tooltip>
				</div>
			</TooltipProvider>
		</div>
	);
}
