import { Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/core/utils";
import type { AppSettings } from "@/lib/settings";
import { applyUiTheme, buildGradient, GRADIENT_PRESETS } from "@/lib/ui/theme";

export function ThemeStep({
	settings,
	patch,
}: {
	settings: AppSettings;
	patch: (p: Partial<AppSettings>) => void;
}) {
	const { t } = useTranslation("onboarding");
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-3 gap-2">
				{(["system", "light", "dark"] as const).map((mode) => {
					const selected = settings.theme === mode;
					return (
						<button
							key={mode}
							type="button"
							aria-label={t(
								`theme.mode${mode[0].toUpperCase()}${mode.slice(1)}`,
								{ defaultValue: mode },
							)}
							aria-pressed={selected}
							onClick={() => {
								patch({ theme: mode });
								setTheme(mode);
							}}
							className={cn(
								"rounded-lg border px-3 py-2 text-sm outline-none transition-colors hover:border-primary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
								selected ? "border-primary/70 bg-accent" : "border-border/70",
							)}
						>
							{t(`theme.mode${mode[0].toUpperCase()}${mode.slice(1)}`, {
								defaultValue: mode,
							})}
						</button>
					);
				})}
			</div>
			<div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
				{GRADIENT_PRESETS.map((preset) => {
					const selected = settings.uiTheme === preset.name;
					return (
						<button
							key={preset.name}
							type="button"
							aria-label={t("theme.uiThemeSelect", { name: preset.title })}
							aria-pressed={selected}
							title={preset.title}
							onClick={() => {
								patch({ uiTheme: preset.name, gradientConfig: "" });
								void applyUiTheme(preset.name);
							}}
							className={cn(
								"group relative h-14 min-w-0 rounded-lg border p-1 text-left outline-none transition-colors hover:border-primary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
								selected ? "border-primary/70" : "border-border/70",
							)}
						>
							<div
								className="h-full overflow-hidden rounded-md border border-black/10 dark:border-white/10"
								style={{
									backgroundImage: buildGradient(preset.config, isDark),
									backgroundColor: isDark
										? "oklch(0.205 0 0)"
										: "oklch(0.985 0 0)",
								}}
							/>
							{selected ? (
								<Check className="absolute top-1 right-1 size-3 text-primary" />
							) : null}
						</button>
					);
				})}
			</div>
		</div>
	);
}
