/**
 * Font settings helpers (interface / text / mono), CSS stacks, and system-font listing.
 *
 * Values are free-form strings:
 * - `""` / `"default"` → app default for that role
 * - `"system"` | `"serif"` | `"mono"` → built-in CSS stacks
 * - any other string → a system font family name (quoted + role fallback)
 */

import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";

/** Built-in non-system tokens shown at the top of the font picker. */
export const FONT_STACK_PRESETS = [
	"default",
	"system",
	"serif",
	"mono",
] as const;
export type FontStackPreset = (typeof FONT_STACK_PRESETS)[number];

export type FontRole = "interface" | "text" | "mono";

export const DEFAULT_SANS_STACK =
	'"Geist Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", sans-serif';

export const SYSTEM_SANS_STACK =
	'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", sans-serif';

export const SERIF_STACK =
	'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Songti SC", "Noto Serif CJK SC", "Noto Serif SC", serif';

export const MONO_STACK =
	'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export function isFontStackPreset(v: string): v is FontStackPreset {
	return (FONT_STACK_PRESETS as readonly string[]).includes(v);
}

/** Normalize a stored font value (trim; map legacy aliases). */
export function normalizeFontFamilyValue(raw: unknown): string {
	if (typeof raw !== "string") return "";
	const v = raw.trim();
	if (!v || v === "default") return "";
	// Cap hand-edited garbage.
	return v.slice(0, 120);
}

/**
 * Resolve a stored font value to a CSS `font-family` list.
 * Returns `undefined` when the role should keep the stylesheet default
 * (Geist for interface/text; theme mono for mono).
 */
export function resolveFontFamilyCss(
	value: string,
	role: FontRole,
): string | undefined {
	const v = value.trim();
	if (!v || v === "default") {
		return undefined;
	}
	if (v === "system") return SYSTEM_SANS_STACK;
	if (v === "serif") return SERIF_STACK;
	if (v === "mono") return MONO_STACK;

	const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const fallback =
		role === "mono"
			? MONO_STACK
			: role === "text"
				? SYSTEM_SANS_STACK
				: SYSTEM_SANS_STACK;
	return `"${escaped}", ${fallback}`;
}

/**
 * CSS custom properties consumed by @theme (see src/index.css).
 * Utilities are inlined as `var(--agentero-font-*)`, so runtime overrides here
 * actually change chrome / mono UI. Do not set --font-sans alone — Tailwind
 * does not re-read that for .font-sans when using @theme inline.
 */
const CSS_VAR_SANS = "--agentero-font-sans";
const CSS_VAR_HEADING = "--agentero-font-heading";
const CSS_VAR_MONO = "--agentero-font-mono";

/**
 * Apply interface + mono CSS variables on `documentElement`.
 * Interface → chrome UI (sidebars, settings, toolbars).
 * Mono → code blocks / font-mono / pre.
 * Empty values clear inline overrides so :root defaults return.
 */
export function applyChromeFontCss(
	interfaceFontFamily: string,
	monoFontFamily: string,
): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const iface = resolveFontFamilyCss(interfaceFontFamily, "interface");
	if (iface) {
		root.style.setProperty(CSS_VAR_SANS, iface);
		root.style.setProperty(CSS_VAR_HEADING, iface);
		// Belt-and-suspenders: inheritance for nodes without font-sans class.
		root.style.fontFamily = iface;
	} else {
		root.style.removeProperty(CSS_VAR_SANS);
		root.style.removeProperty(CSS_VAR_HEADING);
		root.style.fontFamily = "";
	}

	const mono = resolveFontFamilyCss(monoFontFamily, "mono");
	if (mono) {
		root.style.setProperty(CSS_VAR_MONO, mono);
	} else {
		root.style.removeProperty(CSS_VAR_MONO);
	}
}

/** Apply global UI scale + chrome fonts together. */
export function applyDocumentChrome(opts: {
	uiScale: number;
	interfaceFontFamily: string;
	monoFontFamily: string;
}): void {
	if (typeof document === "undefined") return;
	const scale = Number.isFinite(opts.uiScale) ? opts.uiScale : 1;
	document.documentElement.style.fontSize = `${16 * scale}px`;
	applyChromeFontCss(opts.interfaceFontFamily, opts.monoFontFamily);
}

/** Display label key suffix for presets; system fonts use the raw name. */
export function fontFamilyDisplayKey(value: string): string {
	const v = value.trim();
	if (!v || v === "default") return "default";
	if (isFontStackPreset(v)) return v;
	return "custom";
}

// --- System font listing (Host-backed, cached) --------------------------------

let systemFontsCache: string[] | null = null;
let systemFontsPromise: Promise<string[]> | null = null;

/** Return cached system font family names, or load once from the Host. */
export async function listSystemFonts(): Promise<string[]> {
	if (systemFontsCache) return systemFontsCache;
	if (systemFontsPromise) return systemFontsPromise;
	systemFontsPromise = loadSystemFonts()
		.then((fonts) => {
			systemFontsCache = fonts;
			return fonts;
		})
		.finally(() => {
			systemFontsPromise = null;
		});
	return systemFontsPromise;
}

async function loadSystemFonts(): Promise<string[]> {
	if (!isTauri()) return [];
	try {
		const fonts = await invokeApi<string[]>("list_system_fonts", undefined, {
			fallback: "Failed to list system fonts",
		});
		if (!Array.isArray(fonts)) return [];
		return fonts
			.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
			.map((n) => n.trim())
			.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
	} catch {
		return [];
	}
}

/** Drop the cache (e.g. after rare “refresh fonts” actions). */
export function invalidateSystemFontsCache(): void {
	systemFontsCache = null;
	systemFontsPromise = null;
}
