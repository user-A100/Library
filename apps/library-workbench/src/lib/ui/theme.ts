/**
 * Library gradient theme engine.
 *
 * Ported from the Library research-workspace shell: a small set of color
 * points is composed into a multi-layer radial gradient plus a grain
 * texture, and the primary point derives the shadcn/ui accent tokens
 * (primary / ring / accent / sidebar / charts) so stock components follow
 * the selected palette. `--background` / `--foreground` are intentionally
 * left untouched to keep component contrast intact.
 */

export type GradientPoint = {
	id: string;
	color: string;
	/** 0–100, percent of the surface width */
	x: number;
	/** 0–100, percent of the surface height */
	y: number;
	isPrimary: boolean;
};

export type GradientAlgorithm = "free" | "flow";

export type GradientThemeConfig = {
	version: 1;
	algorithm: GradientAlgorithm;
	/** Color wash strength, 18–100 */
	opacity: number;
	/** Grain texture strength, 0–100 */
	texture: number;
	/** 1–5 color points; exactly one isPrimary */
	points: GradientPoint[];
};

export type UiThemeMeta = {
	name: string;
	title: string;
};

const MAX_POINTS = 5;

function point(
	id: string,
	color: string,
	x: number,
	y: number,
	isPrimary = false,
): GradientPoint {
	return { id, color, x, y, isPrimary };
}

function preset(
	name: string,
	title: string,
	colors: [string, string, string],
): { name: string; title: string; config: GradientThemeConfig } {
	return {
		name,
		title,
		config: {
			version: 1,
			algorithm: "free",
			opacity: 72,
			texture: 18,
			points: [
				point("p1", colors[0], 16, 20, true),
				point("p2", colors[1], 82, 30),
				point("p3", colors[2], 50, 88),
			],
		},
	};
}

/** Built-in gradient presets. */
export const GRADIENT_PRESETS = [
	preset("zen-mint", "Zen Mint", ["#72e3a6", "#83d9d4", "#f1e9c9"]),
	preset("moss", "Moss", ["#82c995", "#b8d59d", "#e9dfb6"]),
	preset("dawn", "Dawn", ["#ffad91", "#f7cf86", "#ddd3ee"]),
	preset("iris", "Iris", ["#9aa9f5", "#c0a7e8", "#e8d4e8"]),
	preset("ocean", "Ocean", ["#5bbbd6", "#78d0bd", "#c8e4cf"]),
	preset("graphite", "Graphite", ["#495553", "#697b72", "#aeb8a4"]),
];

/** Theme id for a user-edited configuration (not a preset). */
export const CUSTOM_UI_THEME = "custom";

export const DEFAULT_UI_THEME = "zen-mint";

export const UI_THEMES: UiThemeMeta[] = [
	...GRADIENT_PRESETS.map(({ name, title }) => ({ name, title })),
	{ name: CUSTOM_UI_THEME, title: "Custom" },
];

export function isKnownUiTheme(name: unknown): name is string {
	return typeof name === "string" && UI_THEMES.some((t) => t.name === name);
}

/** Config for a preset id, or null for default/custom/unknown. */
export function presetConfig(name: string): GradientThemeConfig | null {
	const found = GRADIENT_PRESETS.find((t) => t.name === name);
	return found ? found.config : null;
}

/** Parse a persisted custom config; null when absent or malformed. */
export function parseCustomConfig(json: unknown): GradientThemeConfig | null {
	if (typeof json !== "string" || json.trim() === "") return null;
	try {
		const raw = JSON.parse(json) as Partial<GradientThemeConfig>;
		if (raw.version !== 1 || !Array.isArray(raw.points)) return null;
		const points = raw.points
			.filter(
				(p): p is GradientPoint =>
					!!p &&
					typeof p.color === "string" &&
					Number.isFinite(p.x) &&
					Number.isFinite(p.y),
			)
			.slice(0, MAX_POINTS);
		if (points.length === 0) return null;
		return {
			version: 1,
			algorithm: raw.algorithm === "flow" ? "flow" : "free",
			opacity: clamp(Number(raw.opacity) || 72, 18, 100),
			texture: clamp(Number(raw.texture) || 18, 0, 100),
			points,
		};
	} catch {
		return null;
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
	const clean = hex.replace("#", "");
	const full =
		clean.length === 3
			? clean
					.split("")
					.map((c) => c + c)
					.join("")
			: clean;
	const num = Number.parseInt(full.slice(0, 6), 16);
	if (Number.isNaN(num)) return [0, 0, 0];
	return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function rgba(hex: string, alpha: number): string {
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Compose the layered background-image for a config.
 * Dark mode compresses the wash so it stays subtle on near-black surfaces.
 */
export function buildGradient(
	config: GradientThemeConfig,
	dark: boolean,
): string {
	const opacity = dark
		? clamp(config.opacity * 0.34, 12, 34) / 100
		: config.opacity / 100;
	const points =
		config.algorithm === "flow"
			? config.points.map((p, i, all) => ({
					...p,
					x: Math.round(((i + 1) / (all.length + 1)) * 100),
					y: i % 2 === 0 ? 18 : 82,
				}))
			: config.points;

	const layers = points.map(
		(p) =>
			`radial-gradient(circle at ${p.x}% ${p.y}%, ${rgba(
				p.color,
				opacity,
			)} 0%, transparent 62%)`,
	);
	const grain = `repeating-radial-gradient(circle at 17% 32%, transparent 0, transparent ${(config.texture / 100) * 8}px, rgba(0, 0, 0, ${dark ? 0.08 : 0.05}) ${(config.texture / 100) * 8 + 1}px, transparent ${(config.texture / 100) * 8 + 2}px)`;
	return [...layers, grain].join(", ");
}

function primaryColor(config: GradientThemeConfig): string {
	return (
		config.points.find((p) => p.isPrimary)?.color ?? config.points[0].color
	);
}

/**
 * Accent-token overrides derived from the primary point. Conservative by
 * design: background/foreground/card stay on the built-in palette.
 */
export function deriveShadcnVars(
	config: GradientThemeConfig,
	dark: boolean,
): Record<string, string> {
	const primary = primaryColor(config);
	const charts = config.points
		.slice(0, 3)
		.map((p) => p.color)
		.concat(["#9aa9f5", "#83d9d4"].slice(0, 3))
		.slice(0, 3);

	const vars: Record<string, string> = dark
		? {
				primary: `color-mix(in oklch, ${primary} 62%, white)`,
				"primary-foreground": "oklch(0.205 0 0)",
				ring: `color-mix(in oklch, ${primary} 45%, white)`,
				accent: `color-mix(in oklch, ${primary} 24%, oklch(0.205 0 0))`,
				"accent-foreground": "oklch(0.985 0 0)",
				"sidebar-primary": `color-mix(in oklch, ${primary} 62%, white)`,
				"sidebar-ring": `color-mix(in oklch, ${primary} 45%, white)`,
			}
		: {
				primary: `color-mix(in oklch, ${primary} 78%, black)`,
				"primary-foreground": "oklch(0.985 0 0)",
				ring: `color-mix(in oklch, ${primary} 55%, black)`,
				accent: `color-mix(in oklch, ${primary} 12%, white)`,
				"accent-foreground": "oklch(0.205 0 0)",
				"sidebar-primary": `color-mix(in oklch, ${primary} 78%, black)`,
				"sidebar-ring": `color-mix(in oklch, ${primary} 55%, black)`,
			};

	vars["chart-1"] = charts[0];
	vars["chart-2"] = charts[1];
	vars["chart-3"] = charts[2];
	return vars;
}

function toCssBlock(selector: string, vars: Record<string, string>): string {
	const body = Object.entries(vars)
		.map(([k, v]) => `\t--${k}: ${v};`)
		.join("\n");
	return `${selector} {\n${body}\n}`;
}

const STYLE_ID = "library-gradient-theme";

/**
 * Inject the gradient + derived accent tokens. `name` selects a preset;
 * when it equals {@link CUSTOM_UI_THEME}, `customConfig` (already parsed)
 * is used instead. Unknown names remove the override.
 */
export async function applyUiTheme(
	name: string,
	customConfig?: GradientThemeConfig | null,
): Promise<void> {
	if (typeof document === "undefined") return;
	const config =
		name === CUSTOM_UI_THEME
			? (customConfig ?? presetConfig(DEFAULT_UI_THEME))
			: presetConfig(name);

	const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
	if (!config) {
		existing?.remove();
		return;
	}

	const el = existing ?? document.createElement("style");
	el.id = STYLE_ID;
	const lightVars = deriveShadcnVars(config, false);
	const darkVars = deriveShadcnVars(config, true);
	el.textContent = [
		toCssBlock(":root", lightVars),
		toCssBlock(".dark", darkVars),
		`:root {\n\t--library-gradient: ${buildGradient(config, false)};\n}`,
		`.dark {\n\t--library-gradient: ${buildGradient(config, true)};\n}`,
	].join("\n");

	// Re-append only when the node is missing or no longer the last child
	// (e.g. Vite HMR injected styles after it in dev). Otherwise leave it in
	// place to avoid unnecessary style recalculation.
	if (el.parentNode !== document.head || el.nextSibling !== null) {
		document.head.appendChild(el);
	}
}
