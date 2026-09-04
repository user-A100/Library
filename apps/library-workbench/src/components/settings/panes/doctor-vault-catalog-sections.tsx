import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/core/error";
import { notifyError, notifySuccess } from "@/lib/core/notify";
import { type DoctorIssue, doctorFixCatalogDuplicates } from "@/lib/doctor/api";
import { DoctorSection, IssueRows } from "./doctor-sections";

export function DoctorVaultSection({
	ok,
	issues,
}: {
	ok: boolean;
	issues: DoctorIssue[];
}) {
	const { t } = useTranslation("settings");

	return (
		<DoctorSection
			title={t("doctor.sections.vault")}
			description={t("doctor.sectionHints.vault")}
			ok={ok}
			issueCount={issues.length}
		>
			{issues.length > 0 ? <IssueRows issues={issues} /> : null}
		</DoctorSection>
	);
}

export function DoctorCatalogSection({
	vaultPath,
	ok,
	issues,
	hasDuplicates,
	onRefresh,
}: {
	vaultPath: string;
	ok: boolean;
	issues: DoctorIssue[];
	hasDuplicates: boolean;
	onRefresh: () => Promise<void>;
}) {
	const { t } = useTranslation("settings");
	const [catalogFixing, setCatalogFixing] = useState(false);

	const fixCatalogDuplicates = async () => {
		if (!vaultPath) return;
		setCatalogFixing(true);
		try {
			const result = await doctorFixCatalogDuplicates(vaultPath);
			notifySuccess(
				t("doctor.catalogDuplicates.success", {
					removed: result.removedRows,
					kept: result.keptPaths.length,
				}),
			);
			await onRefresh();
		} catch (error) {
			notifyError(errorText(error));
		} finally {
			setCatalogFixing(false);
		}
	};

	return (
		<DoctorSection
			title={t("doctor.sections.catalog")}
			description={t("doctor.sectionHints.catalog")}
			ok={ok}
			issueCount={issues.length}
			action={
				hasDuplicates ? (
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={catalogFixing}
						onClick={() => void fixCatalogDuplicates()}
					>
						{catalogFixing ? (
							<RefreshCw className="mr-1.5 size-3.5 animate-spin" />
						) : null}
						{t("doctor.catalogDuplicates.fix")}
					</Button>
				) : undefined
			}
		>
			{issues.length > 0 ? <IssueRows issues={issues} /> : null}
		</DoctorSection>
	);
}
