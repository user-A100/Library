import type { Options } from "prettier";

export const MARKDOWN_FORMAT_OPTIONS = {
	embeddedLanguageFormatting: "off",
	htmlWhitespaceSensitivity: "ignore",
	parser: "markdown",
	proseWrap: "preserve",
} as const satisfies Options;

type PrettierModules = {
	format: (source: string, options: Options) => Promise<string>;
	markdownPlugin: NonNullable<Options["plugins"]>[number];
};

let prettierModulesPromise: Promise<PrettierModules> | null = null;

async function loadPrettierModules(): Promise<PrettierModules> {
	prettierModulesPromise ??= Promise.all([
		import("prettier/standalone"),
		import("prettier/plugins/markdown"),
	]).then(([prettier, markdown]) => ({
		format: prettier.format,
		markdownPlugin: markdown.default,
	}));
	return prettierModulesPromise;
}

/** Format one complete Markdown document without mutating editor state. */
export async function formatMarkdownSource(source: string): Promise<string> {
	const { format, markdownPlugin } = await loadPrettierModules();
	return format(source, {
		...MARKDOWN_FORMAT_OPTIONS,
		plugins: [markdownPlugin],
	});
}
