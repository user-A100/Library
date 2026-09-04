/**
 * Built-in User-Agent presets for ACP spawn injection (#207).
 * Values mirror common mid-station / cc-switch affinity strings.
 * Empty `value` means “off” (do not inject).
 */
export type UserAgentPreset = {
	/** Stable id for React keys / i18n. */
	id: string;
	/** Exact string written into agent env / CODEX_CONFIG / ANTHROPIC_CUSTOM_HEADERS. */
	value: string;
};

/** First entry is “off”. Order matches the presets dropdown. */
export const USER_AGENT_PRESETS: readonly UserAgentPreset[] = [
	{ id: "off", value: "" },
	{ id: "codexCli", value: "codex-cli/0.50.0" },
	{ id: "codexCliLatestStyle", value: "codex-cli/0.55.0" },
	{ id: "claudeCli", value: "claude-cli/2.1.161" },
	{ id: "claudeCode", value: "claude-code/1.0.0" },
	{ id: "claudeCodeLegacy", value: "claude-code/0.1.0" },
] as const;

export function matchUserAgentPresetId(value: string): string | null {
	const v = value.trim();
	const hit = USER_AGENT_PRESETS.find((p) => p.value === v);
	return hit ? hit.id : null;
}
