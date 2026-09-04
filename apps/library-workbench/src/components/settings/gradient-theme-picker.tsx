import { Check, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	buildGradient,
	CUSTOM_UI_THEME,
	GRADIENT_PRESETS,
	type GradientAlgorithm,
	type GradientThemeConfig,
} from "@/lib/ui/theme";

let pointSeq = 0;
function nextPointId() {
	pointSeq += 1;
	return `cp${Date.now().toString(36)}${pointSeq}`;
}

export type GradientThemePickerProps = {
	/** Active theme id: preset name or "custom" */
	value: string;
	/** Parsed custom config (only used when value === "custom") */
	customConfig: GradientThemeConfig | null;
	dark: boolean;
	/** Called with the selected preset id, or "custom" plus its config */
	onChange: (name: string, config: GradientThemeConfig | null) => void;
};

function presetPreview(config: GradientThemeConfig, dark: boolean) {
	return {
		backgroundImage: buildGradient(config, dark),
		primary: config.points.find((p) => p.isPrimary)?.color ?? "#23865f",
		colors: config.points.map((p) => p.color),
	};
}

/**
 * Preset cards rendered with the real gradient engine plus a "custom"
 * branch with the color-point editor (opacity / texture / algorithm).
 */
export function GradientThemePicker({
	value,
	customConfig,
	dark,
	onChange,
}: GradientThemePickerProps) {
	const { t } = useTranslation("settings");
	const effectiveConfig =
		value === CUSTOM_UI_THEME
			? (customConfig ?? GRADIENT_PRESETS[0].config)
			: (GRADIENT_PRESETS.find((p) => p.name === value)?.config ?? null);

	const updateConfig = (mutate: (draft: GradientThemeConfig) => void) => {
		if (!effectiveConfig) return;
		const draft = structuredClone(effectiveConfig);
		mutate(draft);
		if (!draft.points.some((p) => p.isPrimary) && draft.points.length > 0) {
			draft.points[0].isPrimary = true;
		}
		onChange(CUSTOM_UI_THEME, draft);
	};

	const items = [
		...GRADIENT_PRESETS.map((p) => ({
			name: p.name,
			title: p.title,
			config: p.config,
		})),
	];

	return (
		<div className="library-scroll max-h-[24rem] overflow-y-auto pr-1">
			<div className="grid grid-cols-2 auto-rows-[7.25rem] gap-2 sm:grid-cols-3">
				{items.map((item) => {
					const preview = presetPreview(item.config, dark);
					const selected = value === item.name;
					return (
						<button
							key={item.name}
							type="button"
							aria-label={t("appearance.uiTheme.select", {
								name: item.title,
							})}
							aria-pressed={selected}
							onClick={() => onChange(item.name, null)}
							className="group h-[7.25rem] min-w-0 rounded-lg border border-border/70 p-1 text-left outline-none transition-colors hover:border-primary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
						>
							<div
								className="flex h-[4.25rem] flex-col justify-end gap-1 overflow-hidden rounded-md border border-black/10 p-1.5 dark:border-white/10"
								style={{
									backgroundImage: preview.backgroundImage,
									backgroundColor: dark
										? "oklch(0.205 0 0)"
										: "oklch(0.985 0 0)",
								}}
							>
								<div className="flex items-center gap-1">
									{preview.colors.slice(0, 3).map((c, i) => (
										<span
											// biome-ignore lint/suspicious/noArrayIndexKey: static preview chips
											key={i}
											className="size-2.5 rounded-full border border-black/10"
											style={{ backgroundColor: c }}
										/>
									))}
								</div>
							</div>
							<div className="flex min-w-0 items-center gap-1.5 px-1 py-1">
								<span className="truncate text-xs">{item.title}</span>
								{selected ? (
									<Check className="ml-auto size-3.5 shrink-0 text-primary" />
								) : null}
							</div>
						</button>
					);
				})}
				{customCard(
					value,
					customConfig,
					dark,
					t("appearance.uiTheme.custom", {
						defaultValue: "Custom",
					}),
					onChange,
				)}
			</div>
			{value === CUSTOM_UI_THEME && effectiveConfig ? (
				<GradientPointsEditor
					config={effectiveConfig}
					onChange={updateConfig}
				/>
			) : null}
		</div>
	);
}

function customCard(
	value: string,
	customConfig: GradientThemeConfig | null,
	dark: boolean,
	title: string,
	onChange: (name: string, config: GradientThemeConfig | null) => void,
) {
	const base =
		customConfig ??
		(GRADIENT_PRESETS[0] as { config: GradientThemeConfig }).config;
	const preview = presetPreview(base, dark);
	const selected = value === CUSTOM_UI_THEME;
	return (
		<button
			key={CUSTOM_UI_THEME}
			type="button"
			aria-label={title}
			aria-pressed={selected}
			onClick={() => onChange(CUSTOM_UI_THEME, base)}
			className="group h-[7.25rem] min-w-0 rounded-lg border border-border/70 p-1 text-left outline-none transition-colors hover:border-primary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
		>
			<div
				className="flex h-[4.25rem] items-center justify-center overflow-hidden rounded-md border border-dashed border-border p-1.5"
				style={{
					backgroundImage: preview.backgroundImage,
					backgroundColor: dark ? "oklch(0.205 0 0)" : "oklch(0.985 0 0)",
				}}
			>
				<Plus className="size-4 text-muted-foreground" />
			</div>
			<div className="flex min-w-0 items-center gap-1.5 px-1 py-1">
				<span className="truncate text-xs">{title}</span>
				{selected ? (
					<Check className="ml-auto size-3.5 shrink-0 text-primary" />
				) : null}
			</div>
		</button>
	);
}

function GradientPointsEditor({
	config,
	onChange,
}: {
	config: GradientThemeConfig;
	onChange: (mutate: (draft: GradientThemeConfig) => void) => void;
}) {
	const { t } = useTranslation("settings");
	return (
		<div className="mt-3 space-y-3 rounded-lg border border-border/70 p-3">
			<div className="flex items-center justify-between gap-3">
				<span className="text-[13px]">{t("appearance.uiTheme.points")}</span>
				{config.points.length < 5 ? (
					<button
						type="button"
						onClick={() =>
							onChange((draft) => {
								if (draft.points.length >= 5) return;
								draft.points.push({
									id: nextPointId(),
									color: "#f1e9c9",
									x: 50,
									y: 50,
									isPrimary: false,
								});
							})
						}
						className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
					>
						<Plus className="size-3" />
						{t("appearance.uiTheme.addPoint", { defaultValue: "Add" })}
					</button>
				) : null}
			</div>
			<div className="space-y-1.5">
				{config.points.map((p) => (
					<div key={p.id} className="flex items-center gap-2 text-xs">
						<input
							type="color"
							value={p.color}
							onChange={(e) =>
								onChange((draft) => {
									const target = draft.points.find((q) => q.id === p.id);
									if (target) target.color = e.target.value;
								})
							}
							className="size-6 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
							aria-label={t("appearance.uiTheme.pointColor")}
						/>
						<label className="flex items-center gap-1 text-muted-foreground">
							{t("appearance.uiTheme.pointX")}
							<input
								type="number"
								min={0}
								max={100}
								value={Math.round(p.x)}
								onChange={(e) =>
									onChange((draft) => {
										const target = draft.points.find((q) => q.id === p.id);
										if (target) target.x = clamp01(e.target.valueAsNumber, 100);
									})
								}
								className="w-14 rounded border border-border bg-transparent px-1 py-0.5"
							/>
						</label>
						<label className="flex items-center gap-1 text-muted-foreground">
							{t("appearance.uiTheme.pointY")}
							<input
								type="number"
								min={0}
								max={100}
								value={Math.round(p.y)}
								onChange={(e) =>
									onChange((draft) => {
										const target = draft.points.find((q) => q.id === p.id);
										if (target) target.y = clamp01(e.target.valueAsNumber, 100);
									})
								}
								className="w-14 rounded border border-border bg-transparent px-1 py-0.5"
							/>
						</label>
						<label className="flex items-center gap-1 text-muted-foreground">
							<input
								type="radio"
								name="gradient-primary"
								checked={p.isPrimary}
								onChange={() =>
									onChange((draft) => {
										for (const q of draft.points) q.isPrimary = q.id === p.id;
									})
								}
							/>
							{t("appearance.uiTheme.primary")}
						</label>
						{config.points.length > 1 ? (
							<button
								type="button"
								onClick={() =>
									onChange((draft) => {
										draft.points = draft.points.filter((q) => q.id !== p.id);
									})
								}
								className="ml-auto rounded p-1 hover:bg-accent"
								aria-label={t("appearance.uiTheme.removePoint")}
							>
								<X className="size-3.5" />
							</button>
						) : null}
					</div>
				))}
			</div>
			<div className="flex items-center gap-3 text-xs">
				<label className="flex flex-1 items-center gap-2">
					<span className="w-14 text-muted-foreground">
						{t("appearance.uiTheme.opacity")}
					</span>
					<input
						type="range"
						min={18}
						max={100}
						value={config.opacity}
						onChange={(e) =>
							onChange((draft) => {
								draft.opacity = Number(e.target.value);
							})
						}
						className="flex-1 accent-primary"
					/>
				</label>
				<label className="flex flex-1 items-center gap-2">
					<span className="w-14 text-muted-foreground">
						{t("appearance.uiTheme.texture")}
					</span>
					<input
						type="range"
						min={0}
						max={100}
						value={config.texture}
						onChange={(e) =>
							onChange((draft) => {
								draft.texture = Number(e.target.value);
							})
						}
						className="flex-1 accent-primary"
					/>
				</label>
				<label className="flex items-center gap-1.5">
					<span className="text-muted-foreground">
						{t("appearance.uiTheme.algorithm")}
					</span>
					<select
						value={config.algorithm}
						onChange={(e) =>
							onChange((draft) => {
								draft.algorithm = e.target.value as GradientAlgorithm;
							})
						}
						className="rounded border border-border bg-transparent px-1.5 py-0.5"
					>
						<option value="free">
							{t("appearance.uiTheme.algorithmFree", { defaultValue: "Free" })}
						</option>
						<option value="flow">
							{t("appearance.uiTheme.algorithmFlow", { defaultValue: "Flow" })}
						</option>
					</select>
				</label>
			</div>
		</div>
	);
}

function clamp01(value: number, max: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(max, Math.max(0, value));
}
