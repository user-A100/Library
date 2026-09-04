/**
 * Lightweight selection toolbar for Plaza text surfaces (RSS detail).
 * Copy / Ask / Add-to-chat — no highlight / note / translate (nothing to persist).
 */

import { Check, Copy, MessageSquare, MessageSquarePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/core/utils";

export type PlazaSelectionScreen = { x: number; y: number };

type PlazaSelectionMenuProps = {
	screen: PlazaSelectionScreen;
	onCopy: () => void;
	onAsk: () => void;
	onAddToChat: () => void;
};

const BAR_W = 120;
const BAR_H = 40;
const COPIED_FLASH_MS = 1500;

export function PlazaSelectionMenu({
	screen,
	onCopy,
	onAsk,
	onAddToChat,
}: PlazaSelectionMenuProps) {
	const { t } = useTranslation("viewer");
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
	const vh = typeof window !== "undefined" ? window.innerHeight : 800;
	let left = screen.x - BAR_W / 2;
	left = Math.min(Math.max(12, left), vw - BAR_W - 12);
	let top = screen.y - BAR_H - 10;
	let overContent = false;
	if (top < 12) {
		top = Math.min(vh - BAR_H - 12, screen.y + 18);
		overContent = true;
	}

	const handleCopy = useCallback(() => {
		onCopy();
		setCopied(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			setCopied(false);
		}, COPIED_FLASH_MS);
	}, [onCopy]);

	return (
		<div
			data-plaza-selection-menu
			className={cn(
				"fixed z-50 flex h-10 items-center gap-0.5 rounded-xl border border-border/80 bg-background px-1 shadow-2xl ring-1 ring-black/5 dark:ring-white/10",
				overContent &&
					"bg-background/80 backdrop-blur-sm transition-[background-color] duration-150 hover:bg-background",
			)}
			style={{ left, top }}
			role="toolbar"
			aria-label={t("selection.menuLabel")}
			onMouseDown={(e) => e.stopPropagation()}
		>
			<TooltipProvider delayDuration={200}>
				<div className="relative">
					{copied ? (
						<span
							className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/80 bg-background px-1.5 py-0.5 text-[11px] text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10"
							role="status"
							aria-live="polite"
						>
							{t("selection.copied")}
						</span>
					) : null}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={
									copied ? t("selection.copied") : t("selection.copy")
								}
								onClick={handleCopy}
							>
								{copied ? (
									<Check className="size-4 text-foreground" aria-hidden />
								) : (
									<Copy className="size-4" />
								)}
							</Button>
						</TooltipTrigger>
						{!copied ? (
							<TooltipContent side="top">{t("selection.copy")}</TooltipContent>
						) : null}
					</Tooltip>
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t("selection.ask")}
							onClick={onAsk}
						>
							<MessageSquare className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">{t("selection.ask")}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t("selection.addToChat")}
							onClick={onAddToChat}
						>
							<MessageSquarePlus className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">{t("selection.addToChat")}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
}
