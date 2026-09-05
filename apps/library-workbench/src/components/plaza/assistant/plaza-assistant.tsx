/**
 * Plaza AI assistant strip: ask a natural-language question about the items
 * currently visible in a plaza panel; the configured ACP agent (same chain
 * as paper-reader) picks matches from the collected snapshot and the answer
 * is rendered as recommendation cards with one-click import.
 */

import { Download, Loader2, Settings, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openExternalUrl } from "@/lib/core/open-external";
import { cn } from "@/lib/core/utils";
import {
	askPlaza,
	resetPlazaAsk,
	stopPlazaAsk,
	usePlazaAssistantSession,
} from "@/lib/plaza/assistant/store";
import type { PlazaListing } from "@/lib/plaza/assistant/types";
import { importPlazaPaper, importPlazaSkillRepo } from "@/lib/plaza/import";
import { openSettingsWindow } from "@/lib/shell/settings-window";

function ListingCard({
	listing,
	reason,
}: {
	listing: PlazaListing;
	reason: string;
}) {
	const { t } = useTranslation("sidebar");
	const [busy, setBusy] = useState(false);

	const onImport = useCallback(async () => {
		if (busy || !listing.importPayload) return;
		setBusy(true);
		try {
			if ("kind" in listing.importPayload) {
				await importPlazaSkillRepo(listing.importPayload.url);
			} else {
				await importPlazaPaper(listing.importPayload);
			}
		} finally {
			setBusy(false);
		}
	}, [busy, listing.importPayload]);

	return (
		<div className="rounded-lg border bg-background p-2.5">
			<button
				type="button"
				disabled={!listing.url}
				onClick={() => listing.url && openExternalUrl(listing.url)}
				className="text-left font-medium text-sm hover:underline disabled:no-underline"
			>
				{listing.title}
			</button>
			<p className="mt-1 text-muted-foreground text-xs leading-snug">
				{reason}
			</p>
			<Button
				type="button"
				variant="outline"
				size="icon-xs"
				disabled={busy || !listing.importPayload}
				onClick={() => void onImport()}
				aria-label={t("plaza.assistant.import")}
				className="mt-1.5 h-6 gap-1 px-2 text-[11px]"
			>
				{busy ? (
					<Loader2 className="size-3 animate-spin" />
				) : (
					<Download className="size-3" />
				)}
				{t("plaza.assistant.import")}
			</Button>
		</div>
	);
}

export function PlazaAssistant({
	sourceId,
	sourceLabel,
	collect,
}: {
	sourceId: string;
	sourceLabel: string;
	collect: () => Promise<PlazaListing[]>;
}) {
	const { t } = useTranslation("sidebar");
	const session = usePlazaAssistantSession(sourceId);
	const [question, setQuestion] = useState("");
	const [showRaw, setShowRaw] = useState(false);

	useEffect(() => () => resetPlazaAsk(sourceId), [sourceId]);

	const busy = session.status === "collecting" || session.status === "running";

	const submit = useCallback(() => {
		const q = question.trim();
		if (!q || busy) return;
		setShowRaw(false);
		void askPlaza({ sourceId, sourceLabel, question: q, collect });
	}, [busy, collect, question, sourceId, sourceLabel]);

	return (
		<div className="flex shrink-0 flex-col gap-1.5 border-b px-2 py-1.5">
			<div className="flex items-center gap-1.5">
				<Sparkles
					className="size-3.5 shrink-0 text-muted-foreground"
					aria-hidden
				/>
				<Input
					value={question}
					onChange={(e) => setQuestion(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") submit();
					}}
					placeholder={t("plaza.assistant.askPlaceholder")}
					disabled={busy}
					className="h-7 text-xs"
				/>
				{busy ? (
					<Button
						type="button"
						variant="outline"
						size="icon-xs"
						aria-label={t("plaza.assistant.stop")}
						onClick={() => stopPlazaAsk(sourceId)}
					>
						<Square className="size-3" />
					</Button>
				) : (
					<Button
						type="button"
						variant="outline"
						size="icon-xs"
						aria-label={t("plaza.assistant.ask")}
						disabled={!question.trim()}
						onClick={submit}
					>
						{session.status === "collecting" ? (
							<Loader2 className="size-3 animate-spin" />
						) : (
							<Sparkles className="size-3" />
						)}
					</Button>
				)}
			</div>

			{busy ? (
				<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<Loader2 className="size-3 animate-spin" />
					{session.status === "collecting"
						? t("plaza.assistant.collecting")
						: t("plaza.assistant.thinking")}
					{session.streamText ? (
						<span className="min-w-0 truncate">
							{session.streamText.slice(-120)}
						</span>
					) : null}
				</p>
			) : null}

			{session.status === "error" ? (
				<p className="flex items-center gap-1.5 text-destructive text-xs">
					{session.error === "emptyListings"
						? t("plaza.assistant.emptyListings")
						: t("plaza.assistant.agentError")}
					{session.error === "emptyListings" ? null : (
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							className="h-5 gap-1 px-1.5 text-[11px]"
							onClick={() => openSettingsWindow("agent")}
						>
							<Settings className="size-3" />
							{t("plaza.assistant.openSettings")}
						</Button>
					)}
				</p>
			) : null}

			{session.status === "done" || session.status === "cancelled" ? (
				<div className="library-scroll max-h-[45%] space-y-1.5 overflow-y-auto">
					{session.status === "done" && !session.cards.length ? (
						<p className="text-muted-foreground text-xs">
							{session.parsedOk
								? t("plaza.assistant.noCards")
								: t("plaza.assistant.parseFailed")}
						</p>
					) : null}
					{session.cards.map((card) => (
						<ListingCard
							key={card.listing.id}
							listing={card.listing}
							reason={card.reason}
						/>
					))}
					{session.answer ? (
						<div>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								className="h-5 px-1.5 text-[11px] text-muted-foreground"
								onClick={() => setShowRaw((v) => !v)}
							>
								{showRaw
									? t("plaza.assistant.hideRaw")
									: t("plaza.assistant.showRaw")}
							</Button>
							{showRaw ? (
								<pre
									className={cn(
										"mt-1 whitespace-pre-wrap text-muted-foreground text-xs",
									)}
								>
									{session.answer}
								</pre>
							) : null}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
