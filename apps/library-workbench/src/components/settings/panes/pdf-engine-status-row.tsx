import { Cpu } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-layout";
import {
	getPdfEngineMode,
	type PdfEngineMode,
} from "@/components/viewer/pdf/engine-provider";

const POLL_MS = 500;

/** Diagnostics row: shows which PDFium engine the app settled on. */
export function PdfEngineStatusRow() {
	const { t } = useTranslation("settings");
	const [mode, setMode] = useState<PdfEngineMode | null>(getPdfEngineMode);

	useEffect(() => {
		if (getPdfEngineMode()) return;
		const timer = setInterval(() => {
			const next = getPdfEngineMode();
			if (next) {
				setMode(next);
				clearInterval(timer);
			}
		}, POLL_MS);
		return () => clearInterval(timer);
	}, []);

	return (
		<SettingsRow
			label={
				<span className="inline-flex items-center gap-1.5">
					<Cpu
						className="size-3.5 shrink-0 text-muted-foreground"
						aria-hidden
					/>
					{t("about.engineMode.label")}
				</span>
			}
		>
			<span className="text-right text-muted-foreground text-xs">
				{mode === "worker"
					? t("about.engineMode.worker")
					: mode === "direct"
						? t("about.engineMode.direct")
						: t("about.engineMode.pending")}
			</span>
		</SettingsRow>
	);
}
