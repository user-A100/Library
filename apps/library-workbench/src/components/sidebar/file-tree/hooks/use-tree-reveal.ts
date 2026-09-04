/**
 * Row virtualization plus IDE-style reveal: expand ancestors of the active
 * document and scroll the matching row into view after tree refreshes.
 */
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { scrollBehavior } from "@/lib/core/motion";
import { LIBRARY_VIRTUAL_PATH, TRASH_VIRTUAL_PATH } from "@/lib/paper/api";
import { PLAZA_VIRTUAL_PATH } from "@/lib/plaza";
import { useUiScale } from "@/lib/settings";
import { isVirtualTreePath, pathKey } from "../tree-helpers";
import type { FlatRow } from "../types";

export type TreeReveal = {
	treeScrollRef: RefObject<HTMLDivElement | null>;
	rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
};

/** Index of the row matching `target`, or -1. */
function findRowIndex(rows: FlatRow[], target: string): number {
	const targetKey = pathKey(target);
	return rows.findIndex((row) => {
		if (row.kind === "library")
			return targetKey === pathKey(LIBRARY_VIRTUAL_PATH);
		if (row.kind === "trash") return targetKey === pathKey(TRASH_VIRTUAL_PATH);
		if (row.kind === "plaza") return targetKey === pathKey(PLAZA_VIRTUAL_PATH);
		if (row.kind === "plazaSource")
			return targetKey === pathKey(row.source.path);
		if (row.kind === "node") return pathKey(row.node.path) === targetKey;
		return false;
	});
}

export function useTreeReveal({
	treeSelectedPath,
	flatRows,
	expandAncestorsOf,
	suppressAutoRevealRef,
}: {
	treeSelectedPath: string | undefined;
	flatRows: FlatRow[];
	expandAncestorsOf: (target: string) => void;
	suppressAutoRevealRef: RefObject<boolean>;
}): TreeReveal {
	const treeScrollRef = useRef<HTMLDivElement>(null);
	const uiScale = useUiScale();
	// Key by stable row id so insert/remove of the inline create draft does
	// not leave stale measured heights on recycled indexes (gap after create).
	const flatRowKeys = useMemo(() => flatRows.map((r) => r.key), [flatRows]);
	const rowVirtualizer = useVirtualizer({
		count: flatRows.length,
		getScrollElement: () => treeScrollRef.current,
		estimateSize: () => Math.round(28 * uiScale),
		getItemKey: (index) => flatRowKeys[index] ?? index,
		overscan: 15,
	});

	// Remeasure when the flattened set changes (create draft, expand, refresh).
	// biome-ignore lint/correctness/useExhaustiveDependencies: keys encode flatRows identity
	useEffect(() => {
		rowVirtualizer.measure();
	}, [flatRowKeys, uiScale, rowVirtualizer]);

	const pendingRevealPathRef = useRef<string | null>(null);
	/** Target that armed the current reveal; guards against effect-identity churn. */
	const armedTargetRef = useRef<string | null>(null);
	/** Target already scrolled into view; a reveal is spent once it lands. */
	const revealedTargetRef = useRef<string | null>(null);

	// Every tree refresh rebuilds `byPathKey`, so `expandAncestorsOf` gets a new
	// identity and this effect re-runs. Compare by value: only a genuine target
	// change arms a reveal, otherwise background import stages would each scroll.
	useEffect(() => {
		if (!treeSelectedPath) return;
		if (armedTargetRef.current === treeSelectedPath) return;
		armedTargetRef.current = treeSelectedPath;
		revealedTargetRef.current = null;
		// New selection always re-enables auto-reveal (e.g. open paper).
		suppressAutoRevealRef.current = false;
		pendingRevealPathRef.current = treeSelectedPath;
		expandAncestorsOf(treeSelectedPath);
	}, [treeSelectedPath, expandAncestorsOf, suppressAutoRevealRef]);

	// After tree refresh (import / rescan), re-queue reveal only when the
	// selected path is not yet a visible flat row (parents collapsed, or the
	// node just appeared after magic-wand import).
	useEffect(() => {
		if (!treeSelectedPath || isVirtualTreePath(treeSelectedPath)) return;
		// Already landed on this row: later refreshes must not scroll again, and
		// an intentional collapse must stay collapsed.
		if (revealedTargetRef.current === treeSelectedPath) return;
		if (suppressAutoRevealRef.current) {
			// Consume once: intentional collapse must not re-expand ancestors.
			suppressAutoRevealRef.current = false;
			return;
		}
		if (findRowIndex(flatRows, treeSelectedPath) >= 0) return;
		pendingRevealPathRef.current = treeSelectedPath;
		expandAncestorsOf(treeSelectedPath);
	}, [treeSelectedPath, expandAncestorsOf, flatRows, suppressAutoRevealRef]);

	// treeSelectedPath: re-run when selection changes even if flatRows is unchanged
	// (path already visible / ancestors already expanded).
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional
	useEffect(() => {
		const target = pendingRevealPathRef.current;
		if (!target) return;
		const idx = findRowIndex(flatRows, target);
		if (idx < 0) return;

		pendingRevealPathRef.current = null;
		revealedTargetRef.current = target;
		// Double rAF: first for expand→flatRows layout, second for virtualizer measure.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				rowVirtualizer.scrollToIndex(idx, {
					align: "center",
					behavior: scrollBehavior(),
				});
			});
		});
	}, [flatRows, rowVirtualizer, treeSelectedPath]);

	return { treeScrollRef, rowVirtualizer };
}
