import type { LayoutMode } from "@/lib/shell/ui-store";

export type LayoutPresetMode = Exclude<LayoutMode, "custom">;

/** Fraction of the source + Agent area occupied by the Agent rail. */
export const LAYOUT_MODE_RIGHT_RATIOS: Record<LayoutPresetMode, number> = {
	agent: 1 / 2,
	notes: 1 / 3,
	reading: 0,
};

export function layoutModeRightRatio(mode: LayoutPresetMode): number {
	return LAYOUT_MODE_RIGHT_RATIOS[mode];
}
