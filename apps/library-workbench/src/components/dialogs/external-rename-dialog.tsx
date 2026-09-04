/**
 * External-rename repair dialog: preview + confirm for a verified external
 * local rename, or an actionable review surface after a blocked repair.
 */

import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useWikiStore } from "@/hooks/use-app-stores";
import { useOverlayRegistration } from "@/hooks/use-overlay-registration";
import {
	externalRenameRepairHadZeroWrites,
	wikiRenameFailure,
} from "@/lib/wiki";
import { applyPendingExternalRenameRepair } from "@/lib/wiki/actions";
import {
	setExternalRenameFailure,
	setExternalRenamePreview,
	setExternalRenameVaultPath,
	wikiStore,
} from "@/lib/wiki/store";

function dismiss() {
	setExternalRenamePreview(null);
	setExternalRenameVaultPath(null);
	setExternalRenameFailure(null);
}

function closeIfIdle() {
	if (wikiStore.getState().externalRenameRepairing) return;
	dismiss();
}

export function ExternalRenameDialog() {
	const { t } = useTranslation(["app"]);
	const preview = useWikiStore((s) => s.externalRenamePreview);
	const failure = useWikiStore((s) => s.externalRenameFailure);
	const repairing = useWikiStore((s) => s.externalRenameRepairing);
	const vaultPathForRepair = useWikiStore((s) => s.externalRenameVaultPath);
	useOverlayRegistration(
		"external-rename-repair",
		preview !== null || failure !== null,
		closeIfIdle,
	);

	return (
		<Dialog
			open={preview !== null || failure !== null}
			onOpenChange={(open) => {
				if (!open) closeIfIdle();
			}}
		>
			<DialogContent showCloseButton={!repairing} className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{failure
							? t("vault.externalRename.reviewTitle")
							: t("vault.externalRename.title")}
					</DialogTitle>
					<DialogDescription>
						{failure
							? failure.zeroWrite
								? t("vault.externalRename.reviewDescription")
								: t("vault.externalRename.recoveryDescription")
							: t("vault.externalRename.description", {
									count: preview?.affectedSources.length ?? 0,
								})}
					</DialogDescription>
				</DialogHeader>
				{preview || failure ? (
					<div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
						<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
							<span className="text-muted-foreground">
								{t("vault.externalRename.from")}
							</span>
							<code className="truncate">{preview?.from ?? failure?.from}</code>
							<span className="text-muted-foreground">
								{t("vault.externalRename.to")}
							</span>
							<code className="truncate">{preview?.to ?? failure?.to}</code>
						</div>
						<p className="text-muted-foreground">
							{preview || failure?.affectedSources != null
								? t("vault.externalRename.impact", {
										count:
											preview?.affectedSources.length ??
											failure?.affectedSources ??
											0,
									})
								: t("vault.externalRename.impactUnknown")}
						</p>
						{preview && preview.skipped.length > 0 ? (
							<p className="text-muted-foreground">
								{t("vault.externalRename.skipped", {
									count: preview.skipped.length,
								})}
							</p>
						) : null}
						{failure ? (
							<div
								className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive"
								role="alert"
							>
								<p>
									{failure.zeroWrite
										? t("vault.externalRename.repairBlocked")
										: t("vault.externalRename.recoveryBlocked", {
												rollback: failure.rollback ?? "unknown",
											})}
								</p>
								<p className="break-words text-xs">{failure.error}</p>
							</div>
						) : null}
					</div>
				) : null}
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={repairing}
						onClick={dismiss}
					>
						{t("vault.externalRename.cancel")}
					</Button>
					{preview ? (
						<Button
							type="button"
							disabled={repairing || !preview || !vaultPathForRepair}
							onClick={() => {
								if (!preview || !vaultPathForRepair) return;
								void applyPendingExternalRenameRepair(
									preview,
									vaultPathForRepair,
								).catch((error) => {
									const failureInfo = wikiRenameFailure(error);
									setExternalRenamePreview(null);
									setExternalRenameFailure({
										from: preview.from,
										to: preview.to,
										affectedSources: preview.affectedSources.length,
										zeroWrite: externalRenameRepairHadZeroWrites(error),
										rollback: failureInfo?.rollback,
										error:
											error instanceof Error
												? error.message
												: t("vault.externalRename.failed"),
									});
								});
							}}
						>
							{repairing ? <Loader2 className="animate-spin" /> : null}
							{t("vault.externalRename.repair")}
						</Button>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
