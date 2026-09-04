import { ChevronDown, Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GroupedModel } from "@/components/agent/hooks/use-agent-config";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import type { AgentModelChoice } from "@/lib/agent";
import { cn } from "@/lib/core/utils";

export function ComposerModelSelector({
	open,
	onOpenChange,
	models,
	groupedModels,
	modelId,
	selectedModelName,
	favoriteIds,
	warming,
	onPickModel,
	onToggleFavorite,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	models: AgentModelChoice[];
	groupedModels: GroupedModel[];
	modelId: string | null;
	selectedModelName: string | null;
	favoriteIds: string[];
	warming: boolean;
	onPickModel: (id: string) => void;
	onToggleFavorite: (id: string) => void;
}) {
	const { t } = useTranslation("agent");
	/** Controlled search so free-form / third-party model ids can be entered (#216). */
	const [modelQuery, setModelQuery] = useState("");
	const customModelId = modelQuery.trim();
	const canUseCustomModel =
		customModelId.length > 0 &&
		!models.some(
			(m) =>
				m.id === customModelId ||
				m.name.trim().toLowerCase() === customModelId.toLowerCase(),
		);

	return (
		<ModelSelector
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setModelQuery("");
			}}
		>
			<ModelSelectorTrigger asChild>
				<PromptInputButton
					type="button"
					className="h-7 min-w-0 max-w-[min(16rem,100%)] shrink gap-1 px-1.5 text-xs font-medium text-foreground"
					disabled={warming}
					tooltip={{
						content:
							models.length > 0 || selectedModelName
								? t("models.selectTooltip")
								: t("models.customOrReportedTooltip"),
						side: "bottom",
					}}
				>
					<span className="min-w-0 flex-1 truncate text-xs">
						{selectedModelName ??
							(warming ? t("models.loading") : t("models.button"))}
					</span>
					<ChevronDown className="size-3 shrink-0 opacity-70" />
				</PromptInputButton>
			</ModelSelectorTrigger>
			<ModelSelectorContent className="sm:max-w-md">
				<ModelSelectorInput
					value={modelQuery}
					onValueChange={setModelQuery}
					placeholder={t("models.searchOrCustomPlaceholder")}
				/>
				<ModelSelectorList className="max-h-64">
					{canUseCustomModel ? (
						<ModelSelectorGroup heading={t("models.customGroup")}>
							<ModelSelectorItem
								value={customModelId}
								onSelect={() => onPickModel(customModelId)}
							>
								<span className="flex-1 truncate">
									{t("models.useCustom", { id: customModelId })}
								</span>
							</ModelSelectorItem>
						</ModelSelectorGroup>
					) : null}
					{groupedModels.map((group) => (
						<ModelSelectorGroup key={group.id} heading={group.heading}>
							{group.items.map((model) => {
								const favorited = favoriteIds.includes(model.id);
								const selected = modelId === model.id;
								return (
									<ModelSelectorItem
										key={`${group.id}-${model.id}`}
										value={`${model.name} ${model.id}${
											group.isFavorites ? "\u200b" : ""
										}`}
										onSelect={() => onPickModel(model.id)}
										className={cn(
											selected &&
												"bg-accent font-medium text-accent-foreground data-selected:bg-accent",
										)}
									>
										<span className="flex-1 truncate">{model.name}</span>
										<button
											type="button"
											aria-label={
												favorited
													? t("models.removeFromFavorites")
													: t("models.addToFavorites")
											}
											title={
												favorited
													? t("models.removeFromFavorites")
													: t("models.addToFavorites")
											}
											className={cn(
												"rounded p-0.5 text-muted-foreground transition hover:text-foreground",
												favorited
													? "opacity-100"
													: "opacity-0 group-hover/command-item:opacity-100 group-data-selected/command-item:opacity-100",
											)}
											onClick={(e) => {
												e.stopPropagation();
												e.preventDefault();
												onToggleFavorite(model.id);
											}}
											onPointerDown={(e) => e.stopPropagation()}
											onMouseDown={(e) => e.stopPropagation()}
										>
											<Star
												className={cn(
													"size-3.5",
													favorited && "fill-current text-amber-500",
												)}
											/>
										</button>
									</ModelSelectorItem>
								);
							})}
						</ModelSelectorGroup>
					))}
					<ModelSelectorEmpty>
						{canUseCustomModel
							? null
							: models.length === 0
								? t("models.emptyNoneCustom")
								: t("models.emptyNoMatch")}
					</ModelSelectorEmpty>
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
