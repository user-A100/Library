import {
	ArrowLeft,
	ExternalLink,
	KeyRound,
	LoaderCircle,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceCard } from "@/components/onboarding/choice-card";
import type { OnboardingStepId } from "@/components/onboarding/flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/core/utils";
import type {
	AppSettings,
	CommercialTranslateProviderId,
	TranslateProviderConfig,
	TranslateProviderId,
} from "@/lib/settings";
import { saveSettingsAsync } from "@/lib/settings";
import {
	COMMERCIAL_MT_DEFAULT_BASE_URLS,
	COMMERCIAL_MT_DOCS_URLS,
	COMMERCIAL_MT_PROVIDER_IDS,
	isCommercialTranslateProvider,
	isTranslateApiKeyMask,
	isTranslateProviderId,
	maskTranslateApiKey,
	probeCommercialMtProvider,
} from "@/lib/translate";
import { DEFAULT_TRANSLATE_SETTINGS } from "@/lib/translate/defaults";

function openExternalUrl(url: string): void {
	void import("@tauri-apps/plugin-opener")
		.then(({ openUrl }) => openUrl(url))
		.catch(() => {
			window.open(url, "_blank", "noopener,noreferrer");
		});
}

const FIRST_COMMERCIAL_PROVIDER: CommercialTranslateProviderId = "deepl";

const EMPTY_PROVIDER_CONFIG: TranslateProviderConfig = {
	apiKey: "",
	baseUrl: "",
	region: "",
	model: "",
};

type ProbeStatus = "idle" | "probing" | "ok" | "fail";

type ProbeLabelKey =
	| "translate.probeOk"
	| "translate.probeFail"
	| "translate.probeProbing"
	| "translate.probeIdle";

function probeDotClass(status: ProbeStatus): string {
	switch (status) {
		case "ok":
			return "bg-emerald-500";
		case "fail":
			return "bg-destructive";
		case "probing":
			return "bg-amber-500 animate-pulse";
		default:
			return "bg-muted-foreground/35";
	}
}

function probeStatusLabelKey(status: ProbeStatus): ProbeLabelKey {
	switch (status) {
		case "ok":
			return "translate.probeOk";
		case "fail":
			return "translate.probeFail";
		case "probing":
			return "translate.probeProbing";
		default:
			return "translate.probeIdle";
	}
}

export function TranslateStep({
	settings,
	patch,
	onUseDefault,
	onNextChange,
}: {
	settings: AppSettings;
	patch: (p: Partial<AppSettings>) => void;
	/** User picked "use system default" — wizard should advance. */
	onUseDefault: () => void;
	/** Report whether a choice has been made (gates Next). */
	onNextChange: (id: OnboardingStepId, allowed: boolean) => void;
}) {
	const { t } = useTranslation(["onboarding", "settings"]);
	const tr = settings.translate;
	const isCommercial = isCommercialTranslateProvider(tr.provider);
	const stored = isCommercial
		? tr.providerConfigs[tr.provider as CommercialTranslateProviderId]
		: undefined;
	const [mode, setMode] = useState<"choose" | "configure">("choose");
	const [draft, setDraft] = useState<{ apiKey?: string; baseUrl?: string }>({});
	const [probe, setProbe] = useState<ProbeStatus>("idle");

	// Next is allowed once the user committed to the own-API flow ("use system
	// default" advances immediately from the chooser instead).
	useEffect(() => {
		onNextChange("translate", mode === "configure");
	}, [mode, onNextChange]);

	const enterConfigure = () => {
		setMode("configure");
		// Default the provider to a commercial engine so the API-key form is
		// immediately useful (user can still switch engines in the form).
		if (!isCommercial) {
			patch({ translate: { ...tr, provider: FIRST_COMMERCIAL_PROVIDER } });
		}
	};

	const useSystemDefault = () => {
		patch({
			translate: {
				...tr,
				provider: DEFAULT_TRANSLATE_SETTINGS.provider,
			},
		});
		onUseDefault();
	};

	const displayKey =
		draft.apiKey !== undefined ? draft.apiKey : (stored?.apiKey ?? "");
	const displayBaseUrl =
		draft.baseUrl !== undefined ? draft.baseUrl : (stored?.baseUrl ?? "");

	const onProviderChange = (value: string) => {
		if (!isTranslateProviderId(value)) return;
		patch({ translate: { ...tr, provider: value as TranslateProviderId } });
		setDraft({});
		setProbe("idle");
	};

	const confirmCommercial = async () => {
		if (!isCommercial) return;
		const pid = tr.provider as CommercialTranslateProviderId;
		const storedCfg = tr.providerConfigs[pid] ?? EMPTY_PROVIDER_CONFIG;
		const apiKey = (draft.apiKey ?? storedCfg.apiKey).trim();
		const baseUrl = (draft.baseUrl ?? storedCfg.baseUrl)
			.trim()
			.replace(/\/+$/, "");
		if (!apiKey) return;
		const toSave: TranslateProviderConfig = { ...storedCfg, apiKey, baseUrl };
		const masked = isTranslateApiKeyMask(apiKey)
			? apiKey
			: maskTranslateApiKey(apiKey);
		const nextTranslate = {
			...tr,
			providerConfigs: {
				...tr.providerConfigs,
				[pid]: { ...toSave, apiKey: masked },
			},
		};
		setDraft({ apiKey: masked });
		try {
			await saveSettingsAsync({ ...settings, translate: nextTranslate });
		} catch {
			// Still mask the UI below.
		}
		patch({ translate: nextTranslate });
		setProbe("probing");
		try {
			const ok = await probeCommercialMtProvider(pid, { config: toSave });
			setProbe(ok ? "ok" : "fail");
		} catch {
			setProbe("fail");
		}
	};

	if (mode === "choose") {
		return (
			<div className="grid grid-cols-2 gap-3">
				<ChoiceCard
					icon={<KeyRound className="size-5 text-muted-foreground" />}
					title={t("translate.configureOwn")}
					onClick={enterConfigure}
				/>
				<ChoiceCard
					icon={<Sparkles className="size-5 text-muted-foreground" />}
					title={t("translate.useDefault")}
					onClick={useSystemDefault}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className="-ml-1.5 shrink-0"
					aria-label={t("actions.back")}
					title={t("actions.back")}
					onClick={() => setMode("choose")}
				>
					<ArrowLeft className="size-4" />
				</Button>
				<Select value={tr.provider} onValueChange={onProviderChange}>
					<SelectTrigger size="sm" className="w-full max-w-[180px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="max-h-72">
						{COMMERCIAL_MT_PROVIDER_IDS.map((id) => (
							<SelectItem key={id} value={id}>
								{t(
									`settings:translate.provider.${id}` as "settings:translate.provider.deepl",
								)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							className="shrink-0"
							aria-label={t("translate.openDocs")}
							title={t("translate.openDocs")}
							onClick={() =>
								openExternalUrl(
									COMMERCIAL_MT_DOCS_URLS[
										tr.provider as CommercialTranslateProviderId
									],
								)
							}
						>
							<ExternalLink className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent className="max-w-xs">
						{t(
							`settings:translate.providerDesc.${tr.provider}` as "settings:translate.providerDesc.deepl",
						)}
					</TooltipContent>
				</Tooltip>
				<div className="ml-auto flex items-center gap-2">
					<span
						role="status"
						aria-label={t(probeStatusLabelKey(probe))}
						title={t(probeStatusLabelKey(probe))}
						className={cn(
							"inline-block size-1.5 shrink-0 rounded-full",
							probeDotClass(probe),
						)}
					/>
					<Button
						type="button"
						size="sm"
						disabled={probe === "probing" || !displayKey.trim()}
						onClick={() => void confirmCommercial()}
					>
						{probe === "probing" ? (
							<LoaderCircle data-icon="inline-start" className="animate-spin" />
						) : (
							<RefreshCw data-icon="inline-start" />
						)}
						{t("translate.test")}
					</Button>
				</div>
			</div>

			<Input
				value={displayKey}
				placeholder={t("translate.apiKeyPlaceholder")}
				onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
				className="h-8"
			/>

			<Input
				value={displayBaseUrl}
				placeholder={
					COMMERCIAL_MT_DEFAULT_BASE_URLS[
						tr.provider as CommercialTranslateProviderId
					] ?? t("translate.endpointPlaceholder")
				}
				onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
				className="h-8 font-mono text-xs"
			/>
		</div>
	);
}
