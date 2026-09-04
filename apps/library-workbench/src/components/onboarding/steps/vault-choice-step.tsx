import { FolderPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SiZotero } from "react-icons/si";
import { ChoiceCard } from "@/components/onboarding/choice-card";

export function VaultChoiceStep({
	onCreate,
	onImportZotero,
}: {
	onCreate: () => void;
	onImportZotero: () => void;
}) {
	const { t } = useTranslation("onboarding");

	return (
		<div className="grid grid-cols-2 gap-3">
			<ChoiceCard
				icon={<FolderPlus className="size-5 text-muted-foreground" />}
				title={t("vault.create")}
				onClick={onCreate}
			/>
			<ChoiceCard
				icon={<SiZotero className="size-5 text-[#CC2936]" />}
				title={t("vault.zotero")}
				onClick={onImportZotero}
			/>
		</div>
	);
}
