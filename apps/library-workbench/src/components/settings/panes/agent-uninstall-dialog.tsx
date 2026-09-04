import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AgentLogo } from "@/components/agent/agent-logo";
import { CompactCodeBlock } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { AgentTemplate, UninstallInfo } from "@/lib/agent";

export function AgentUninstallDialog({
	open,
	name,
	template,
	info,
	busy,
	onConfirm,
	onCancel,
}: {
	open: boolean;
	name: string;
	template: AgentTemplate | string | null | undefined;
	/** Null = registry-only removal (custom agents / no managed uninstall). */
	info: UninstallInfo | null;
	busy: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation(["settings", "common"]);
	const hasPayload =
		info !== null && (info.npmCommands.length > 0 || info.dirs.length > 0);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && !busy) onCancel();
			}}
		>
			<DialogContent showCloseButton={false} className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AgentLogo template={template} className="size-5" />
						{t("agent.uninstallDialog.title", { name })}
					</DialogTitle>
					<DialogDescription>
						{hasPayload ? (
							<span className="flex flex-col gap-2">
								<span>{t("agent.uninstallDialog.lead")}</span>
								{info.npmCommands.length > 0 ? (
									<span className="flex flex-col gap-1.5">
										<CompactCodeBlock
											code={info.npmCommands.join("\n")}
											language="shell"
											wrap
											copyButtonProps={{
												"aria-label": t("agent.uninstallDialog.copyAria"),
											}}
										/>
									</span>
								) : null}
								{info.dirs.length > 0 ? (
									<span className="flex flex-col gap-1.5">
										<span className="font-medium text-foreground">
											{t("agent.uninstallDialog.dirsLabel")}
										</span>
										<CompactCodeBlock
											code={info.dirs.join("\n")}
											language="shell"
											wrap
											copyButtonProps={{
												"aria-label": t("agent.uninstallDialog.copyAria"),
											}}
										/>
									</span>
								) : null}
							</span>
						) : (
							t("agent.uninstallDialog.registryOnly")
						)}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={busy}
					>
						{t("common:cancel")}
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={onConfirm}
						disabled={busy}
					>
						{busy ? (
							<Loader2 className="size-3.5 animate-spin" aria-hidden />
						) : null}
						{t("agent.uninstallDialog.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
