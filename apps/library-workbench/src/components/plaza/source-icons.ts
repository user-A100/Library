/**
 * Plaza source icon map — the components-layer half of the plaza registry.
 * `lib/plaza/sources.ts` only carries icon names ({@link PlazaSourceIcon});
 * this module resolves them to renderable components so lib stays free of
 * React/component imports. All glyphs are lucide so the sidebar reads as one
 * coherent icon set.
 */

import { Boxes, Rss, Snowflake, Store, Telescope } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { PlazaSourceIcon } from "@/lib/plaza";

export const PLAZA_SOURCE_ICONS: Record<
	PlazaSourceIcon,
	ComponentType<SVGProps<SVGSVGElement>>
> = {
	// Cool Papers (papers.cool) — arXiv digest with heat ranking.
	snowflake: Snowflake,
	// ModelScope Papers — model-community paper hub.
	boxes: Boxes,
	// Skill Store — community skill picks.
	store: Store,
	// Feeds — RSS / Atom subscriptions.
	rss: Rss,
	// arXiv Daily — library-tailored daily recommendations.
	telescope: Telescope,
};
