import { MoveHorizontal, MoveVertical, Palette } from "lucide-react";
import type { RefObject } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SiArxiv } from "react-icons/si";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/core/utils";
import {
	PDF_PAPER_SWATCH_CLASS,
	PDF_PAPER_TONES,
	type PdfPaperTone,
} from "@/lib/pdf/page-theme";

type PdfBottomBarProps = {
	/** Hidden until the document reports its page count. */
	totalPages: number;
	/** Editable page number (raw digits while typing). */
	pageField: string;
	onPageFieldChange: (value: string) => void;
	/** True while the field owns focus, so scrolling does not clobber typing. */
	pageFocusedRef: RefObject<boolean>;
	onCommitPageField: () => void;
	pdfTone: PdfPaperTone;
	onSetPdfTone: (tone: PdfPaperTone) => void;
	/** Request the fit-width zoom mode. */
	onFitWidth: () => void;
	/** Request the fit-page zoom mode. */
	onFitPage: () => void;
	/** True for remote arXiv papers with no local sidecar. */
	isRemotePaper?: boolean;
};

/** Bottom bar: page nav + PDF paper tone. */
export function PdfBottomBar({
	totalPages,
	pageField,
	onPageFieldChange,
	pageFocusedRef,
	onCommitPageField,
	pdfTone,
	onSetPdfTone,
	onFitWidth,
	onFitPage,
	isRemotePaper = false,
}: PdfBottomBarProps) {
	const { t } = useTranslation("viewer");
	const [tonePickerOpen, setTonePickerOpen] = useState(false);

	if (totalPages <= 0) return null;

	const pageDigits = Math.max(2, String(totalPages).length, pageField.length);

	return (
		<div className="pointer-events-none absolute bottom-3 left-1/2 z-20 max-w-[calc(100%-1rem)] -translate-x-1/2">
			<TooltipProvider delayDuration={200}>
				<div className="pointer-events-auto flex max-w-full select-none items-center gap-0.5 rounded-lg border border-border/80 bg-background/95 p-0.5 shadow-sm backdrop-blur-sm">
					{isRemotePaper ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<div
									className={cn(
										"flex items-center gap-1 rounded px-1.5 py-0.5 text-primary",
										"bg-primary/10",
									)}
								>
									<SiArxiv
										className="size-3.5 shrink-0 text-[#B31B1B]"
										aria-hidden
									/>
									<span className="whitespace-nowrap text-[11px] font-medium">
										{t("pdf.remoteMode")}
									</span>
								</div>
							</TooltipTrigger>
							<TooltipContent side="top">{t("pdf.remoteMode")}</TooltipContent>
						</Tooltip>
					) : null}
					<div className="flex min-w-0 shrink items-center">
						<input
							type="text"
							inputMode="numeric"
							className="min-w-6 rounded bg-transparent px-0.5 text-center font-medium text-foreground text-xs tabular-nums outline-none focus:bg-muted"
							style={{ width: `${pageDigits + 1}ch` }}
							aria-label={t("pdf.goToPage")}
							value={pageField}
							onFocus={(e) => {
								pageFocusedRef.current = true;
								e.currentTarget.select();
							}}
							onChange={(e) =>
								onPageFieldChange(e.target.value.replace(/[^0-9]/g, ""))
							}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									onCommitPageField();
									e.currentTarget.blur();
								}
							}}
							onBlur={() => {
								pageFocusedRef.current = false;
								onCommitPageField();
							}}
						/>
						<span className="shrink-0 px-0.5 text-muted-foreground text-xs tabular-nums">
							/ {totalPages}
						</span>
					</div>
					<span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
					<Popover open={tonePickerOpen} onOpenChange={setTonePickerOpen}>
						<Tooltip>
							<TooltipTrigger asChild>
								<PopoverTrigger asChild>
									<Button
										type="button"
										size="icon-xs"
										variant="ghost"
										aria-label={t("pdf.paperTone")}
									>
										<Palette className="size-3.5" />
									</Button>
								</PopoverTrigger>
							</TooltipTrigger>
							<TooltipContent side="top">{t("pdf.paperTone")}</TooltipContent>
						</Tooltip>
						<PopoverContent
							side="top"
							align="center"
							className="w-auto flex-row items-center gap-1.5 p-1.5"
						>
							{PDF_PAPER_TONES.map((tone) => {
								const label = t(`pdf.paperToneOption.${tone}`);
								return (
									<Tooltip key={tone}>
										<TooltipTrigger asChild>
											<button
												type="button"
												aria-label={label}
												aria-pressed={pdfTone === tone}
												className={cn(
													"size-5 shrink-0 rounded-full ring-1 ring-black/15 transition hover:scale-110 dark:ring-white/25",
													PDF_PAPER_SWATCH_CLASS[tone],
													pdfTone === tone &&
														"ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover",
												)}
												onClick={() => {
													onSetPdfTone(tone);
													setTonePickerOpen(false);
												}}
											/>
										</TooltipTrigger>
										<TooltipContent side="top">{label}</TooltipContent>
									</Tooltip>
								);
							})}
						</PopoverContent>
					</Popover>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="icon-xs"
								variant="ghost"
								aria-label={t("pdf.zoomFit")}
								onClick={onFitWidth}
							>
								<MoveHorizontal className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">{t("pdf.zoomFit")}</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="icon-xs"
								variant="ghost"
								aria-label={t("pdf.zoomFitPage")}
								onClick={onFitPage}
							>
								<MoveVertical className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">{t("pdf.zoomFitPage")}</TooltipContent>
					</Tooltip>
				</div>
			</TooltipProvider>
		</div>
	);
}
