import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageTitle } from "@/components/settings/settings-layout";
import type { SettingsHostContext } from "@/components/settings/types";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { type DoctorReport, doctorCheck } from "@/lib/doctor/api";
import { DoctorAliasSection } from "./doctor-alias-section";
import {
	DoctorCatalogSection,
	DoctorVaultSection,
} from "./doctor-vault-catalog-sections";
import { DoctorVisualMarksSection } from "./doctor-visual-marks-section";
import { DoctorWikilinkSection } from "./doctor-wikilink-section";

export function DoctorPane({
	vaultPath,
	hostContext,
}: {
	vaultPath?: string | null;
	hostContext: SettingsHostContext;
}) {
	const { t } = useTranslation("settings");
	const [report, setReport] = useState<DoctorReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [wikiPlanning, setWikiPlanning] = useState(false);

	const refresh = useCallback(async () => {
		if (!vaultPath || hostContext.kind === "remote") return;
		setLoading(true);
		try {
			setReport(await doctorCheck(vaultPath));
		} catch (error) {
			notifyError(errorText(error));
		} finally {
			setLoading(false);
		}
	}, [hostContext.kind, vaultPath]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	if (hostContext.kind === "remote") {
		return (
			<>
				<PageTitle title={t("doctor.title")} />
				<p className="rounded-xl border bg-muted/30 px-4 py-3 text-muted-foreground text-sm">
					{t("doctor.remoteUnavailable")}
				</p>
			</>
		);
	}
	if (!vaultPath) {
		return (
			<>
				<PageTitle title={t("doctor.title")} />
				<p className="rounded-xl border bg-muted/30 px-4 py-3 text-muted-foreground text-sm">
					{t("doctor.openVault")}
				</p>
			</>
		);
	}

	const catalogIssues = report?.catalog.issues ?? [];
	const hasCatalogDuplicates =
		(report?.catalog.duplicateReport?.duplicateIds.length ?? 0) > 0 ||
		(report?.catalog.duplicateReport?.duplicatePaths.length ?? 0) > 0;

	return (
		<>
			<PageTitle
				title={t("doctor.title")}
				actions={
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								aria-label={t("doctor.refresh")}
								disabled={loading || wikiPlanning}
								onClick={() => void refresh()}
							>
								<RefreshCw className={loading ? "animate-spin" : undefined} />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{t("doctor.refresh")}</TooltipContent>
					</Tooltip>
				}
			/>

			<DoctorVaultSection
				ok={report?.vault.ok ?? true}
				issues={report?.vault.issues ?? []}
			/>

			<DoctorCatalogSection
				vaultPath={vaultPath}
				ok={report?.catalog.ok ?? true}
				issues={catalogIssues}
				hasDuplicates={hasCatalogDuplicates}
				onRefresh={refresh}
			/>

			<DoctorWikilinkSection
				vaultPath={vaultPath}
				wikilinks={report?.wikilinks}
				planning={wikiPlanning}
				onPlanningChange={setWikiPlanning}
				onRefresh={refresh}
			/>

			<DoctorAliasSection
				vaultPath={vaultPath}
				aliases={report?.aliases}
				onRefresh={refresh}
			/>

			<DoctorVisualMarksSection
				vaultPath={vaultPath}
				visualMarks={report?.visualMarks}
				onRefresh={refresh}
			/>
		</>
	);
}
