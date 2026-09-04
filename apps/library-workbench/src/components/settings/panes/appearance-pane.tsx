import { useTheme } from "next-themes";
import { memo, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontFamilyPicker } from "@/components/settings/font-family-picker";
import { GradientThemePicker } from "@/components/settings/gradient-theme-picker";
import {
	PageTitle,
	SettingsGroup,
	SettingsRow,
} from "@/components/settings/settings-layout";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
	AppSettings,
	LocalePreference,
	ThemePreference,
} from "@/lib/settings";
import {
	EDITOR_LINE_HEIGHT_MAX,
	EDITOR_LINE_HEIGHT_MIN,
	EDITOR_LINE_HEIGHT_STEP,
} from "@/lib/settings";
import {
	applyUiTheme,
	GRADIENT_PRESETS,
	type GradientThemeConfig,
	parseCustomConfig,
} from "@/lib/ui/theme";

export type AppearancePaneProps = {
	theme: ThemePreference;
	uiTheme: string;
	gradientConfig: string;
	locale: LocalePreference;
	uiScale: number;
	editorFontSize: number;
	interfaceFontFamily: string;
	textFontFamily: string;
	monoFontFamily: string;
	editorLineHeight: number;
	showEditorToolbar: boolean;
	patch: (p: Partial<AppSettings>) => void;
};

function AppearancePaneInner({
	theme,
	uiTheme,
	gradientConfig,
	locale,
	uiScale,
	editorFontSize,
	interfaceFontFamily,
	textFontFamily,
	monoFontFamily,
	editorLineHeight,
	showEditorToolbar,
	patch,
}: AppearancePaneProps) {
	const { t } = useTranslation("settings");
	const { resolvedTheme, setTheme } = useTheme();
	const fontId = useId();
	const interfaceFontId = useId();
	const textFontId = useId();
	const monoFontId = useId();
	const lineHeightId = useId();
	const uiScaleId = useId();

	const [fontSize, setFontSize] = useState(editorFontSize);
	useEffect(() => {
		setFontSize(editorFontSize);
	}, [editorFontSize]);

	useEffect(() => {
		if (fontSize === editorFontSize) return;
		const id = setTimeout(() => {
			patch({ editorFontSize: fontSize });
		}, 150);
		return () => clearTimeout(id);
	}, [fontSize, editorFontSize, patch]);

	const [lineHeight, setLineHeight] = useState(editorLineHeight);
	useEffect(() => {
		setLineHeight(editorLineHeight);
	}, [editorLineHeight]);

	useEffect(() => {
		if (lineHeight === editorLineHeight) return;
		const id = setTimeout(() => {
			patch({ editorLineHeight: lineHeight });
		}, 150);
		return () => clearTimeout(id);
	}, [lineHeight, editorLineHeight, patch]);

	const [scale, setScale] = useState(uiScale);
	useEffect(() => {
		setScale(uiScale);
	}, [uiScale]);

	useEffect(() => {
		if (scale === uiScale) return;
		const id = setTimeout(() => {
			patch({ uiScale: scale });
		}, 150);
		return () => clearTimeout(id);
	}, [scale, uiScale, patch]);

	const setThemePref = (next: ThemePreference) => {
		patch({ theme: next });
		setTheme(next);
	};

	const isDark = resolvedTheme === "dark";

	const setGradientTheme = (
		name: string,
		config: GradientThemeConfig | null,
	) => {
		patch({
			uiTheme: name,
			gradientConfig: config ? JSON.stringify(config) : "",
		});
		void applyUiTheme(name, config);
	};

	return (
		<>
			<PageTitle title={t("appearance.title")} />
			<SettingsGroup>
				<SettingsRow label={t("appearance.themeLabel")}>
					<Select
						value={theme}
						onValueChange={(v) => setThemePref(v as ThemePreference)}
					>
						<SelectTrigger size="sm" className="min-w-[120px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="system">
								{t("appearance.theme.system")}
							</SelectItem>
							<SelectItem value="light">
								{t("appearance.theme.light")}
							</SelectItem>
							<SelectItem value="dark">{t("appearance.theme.dark")}</SelectItem>
						</SelectContent>
					</Select>
				</SettingsRow>
				<div className="border-b px-3.5 py-3.5">
					<div className="mb-2.5 flex items-center justify-between gap-3">
						<span className="font-normal text-[13px]">
							{t("appearance.uiThemeLabel")}
						</span>
						<span className="truncate text-muted-foreground text-xs">
							{uiTheme === "custom"
								? t("appearance.uiTheme.custom", { defaultValue: "Custom" })
								: (GRADIENT_PRESETS.find((item) => item.name === uiTheme)
										?.title ?? uiTheme)}
						</span>
					</div>
					<GradientThemePicker
						value={uiTheme}
						customConfig={parseCustomConfig(gradientConfig)}
						dark={isDark}
						onChange={setGradientTheme}
					/>
				</div>
				<SettingsRow label={t("appearance.languageLabel")}>
					<Select
						value={locale}
						onValueChange={(v) => patch({ locale: v as LocalePreference })}
					>
						<SelectTrigger size="sm" className="min-w-[120px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="system">
								{t("appearance.language.system")}
							</SelectItem>
							<SelectItem value="en">{t("appearance.language.en")}</SelectItem>
							<SelectItem value="zh-CN">
								{t("appearance.language.zhCN")}
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingsRow>
				<SettingsRow label={t("appearance.uiScale.label")} htmlFor={uiScaleId}>
					<div className="flex items-center gap-2">
						<input
							id={uiScaleId}
							type="range"
							min={80}
							max={150}
							step={1}
							value={Math.round(scale * 100)}
							onChange={(e) => setScale(Number(e.target.value) / 100)}
							className="w-28 accent-primary"
						/>
						<span className="w-12 text-right text-muted-foreground text-xs tabular-nums">
							{t("appearance.uiScale.value", {
								percent: Math.round(scale * 100),
							})}
						</span>
					</div>
				</SettingsRow>
			</SettingsGroup>

			<p className="mb-1.5 mt-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{t("appearance.fonts.section")}
			</p>
			<SettingsGroup>
				<SettingsRow
					label={t("appearance.fonts.interface")}
					htmlFor={interfaceFontId}
				>
					<FontFamilyPicker
						id={interfaceFontId}
						fontRole="interface"
						value={interfaceFontFamily}
						onChange={(v) => patch({ interfaceFontFamily: v })}
					/>
				</SettingsRow>
				<SettingsRow label={t("appearance.fonts.text")} htmlFor={textFontId}>
					<FontFamilyPicker
						id={textFontId}
						fontRole="text"
						value={textFontFamily}
						onChange={(v) => patch({ textFontFamily: v })}
					/>
				</SettingsRow>
				<SettingsRow label={t("appearance.fonts.mono")} htmlFor={monoFontId}>
					<FontFamilyPicker
						id={monoFontId}
						fontRole="mono"
						value={monoFontFamily}
						onChange={(v) => patch({ monoFontFamily: v })}
					/>
				</SettingsRow>
			</SettingsGroup>

			<p className="mb-1.5 mt-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{t("appearance.markdownEditor.section")}
			</p>
			<SettingsGroup>
				<SettingsRow label={t("appearance.fontSize.label")} htmlFor={fontId}>
					<div className="flex items-center gap-2">
						<input
							id={fontId}
							type="range"
							min={12}
							max={20}
							step={1}
							value={fontSize}
							onChange={(e) => setFontSize(Number(e.target.value))}
							className="w-28 accent-primary"
						/>
						<span className="w-12 text-right text-muted-foreground text-xs tabular-nums">
							{t("appearance.fontSize.value", { size: fontSize })}
						</span>
					</div>
				</SettingsRow>
				<SettingsRow
					label={t("appearance.lineHeight.label")}
					htmlFor={lineHeightId}
				>
					<div className="flex items-center gap-2">
						<input
							id={lineHeightId}
							type="range"
							min={EDITOR_LINE_HEIGHT_MIN}
							max={EDITOR_LINE_HEIGHT_MAX}
							step={EDITOR_LINE_HEIGHT_STEP}
							value={lineHeight}
							onChange={(e) => setLineHeight(Number(e.target.value))}
							className="w-28 accent-primary"
						/>
						<span className="w-12 text-right text-muted-foreground text-xs tabular-nums">
							{t("appearance.lineHeight.value", {
								value: lineHeight.toFixed(1),
							})}
						</span>
					</div>
				</SettingsRow>
				<SettingsRow
					label={t("appearance.editorToolbar.label")}
					htmlFor="editor-toolbar"
				>
					<Switch
						id="editor-toolbar"
						checked={showEditorToolbar}
						onCheckedChange={(v) => patch({ showEditorToolbar: v })}
					/>
				</SettingsRow>
			</SettingsGroup>
		</>
	);
}

export const AppearancePane = memo(AppearancePaneInner);
