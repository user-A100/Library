import { ChevronRight, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	HelpLabel,
	PageTitle,
	SettingsGroup,
	SettingsRow,
} from "@/components/settings/settings-layout";
import type { SettingsHostContext } from "@/components/settings/types";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { errorMessage, notifyError, notifySuccess } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import { cn } from "@/lib/core/utils";
import {
	clearAndReparse,
	clearParseResults,
	type ParseResultScope,
} from "@/lib/paper/reparse";
import {
	layoutBackendsAfterClearingProvider,
	persistLayoutProviderConfig,
	probeLayoutProvider,
} from "@/lib/pdf/layout/provider-config";
import {
	isRemoteLayoutProvider,
	LAYOUT_PROVIDERS,
	layoutProviderCard,
	mergeProviderCards,
	PARSER_PROVIDERS,
	type ProviderCardDescriptor,
} from "@/lib/pdf/layout/providers";
import {
	DEFAULT_MINERU_LANGUAGE,
	isLayoutBackend,
	isParserBackend,
	LAYOUT_PROVIDER_DEFAULT_BASE_URLS,
	LAYOUT_PROVIDER_DOCS_URLS,
	type LayoutProviderConfig,
	type LayoutProviderId,
	MINERU_LANGUAGES,
	PARSER_BACKENDS,
	PROVIDER_MODEL_PRESETS,
} from "@/lib/pdf/layout/settings";
import type { AppSettings } from "@/lib/settings";

function openExternalUrl(url: string): void {
	void import("@tauri-apps/plugin-opener")
		.then(({ openUrl }) => openUrl(url))
		.catch(() => {
			window.open(url, "_blank", "noopener,noreferrer");
		});
}

const EMPTY_PROVIDER_CONFIG: LayoutProviderConfig = {
	apiKey: "",
	baseUrl: "",
	model: "",
	prompt: "",
	language: DEFAULT_MINERU_LANGUAGE,
	isOcr: false,
};

type ProbeStatus = "idle" | "probing" | "ok" | "fail";

function probeDotClass(status: ProbeStatus, configured: boolean): string {
	switch (status) {
		case "ok":
			return "bg-emerald-500";
		case "fail":
			return "bg-destructive";
		case "probing":
			return "bg-amber-500 animate-pulse";
		default:
			return configured ? "bg-muted-foreground/50" : "bg-muted-foreground/35";
	}
}

function probeStatusLabelKey(status: ProbeStatus): string {
	switch (status) {
		case "ok":
			return "layout.providerConfig.probeOk";
		case "fail":
			return "layout.providerConfig.probeFail";
		case "probing":
			return "layout.providerConfig.probeProbing";
		default:
			return "layout.providerConfig.probeIdle";
	}
}

export function LayoutPane({
	settings,
	patch,
	vaultPath,
	hostContext,
}: {
	settings: AppSettings;
	patch: (p: Partial<AppSettings>) => void;
	vaultPath?: string | null;
	hostContext: SettingsHostContext;
}) {
	const { t } = useTranslation(["settings", "common"]);
	const layout = settings.layout;
	const isLocalVault = hostContext.kind === "local";
	const canManageResults = Boolean(vaultPath) && isLocalVault && isTauri();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogMode, setDialogMode] = useState<"clear" | "reparse">("clear");
	const [scope, setScope] = useState<ParseResultScope>("all");
	const [busy, setBusy] = useState(false);
	const isProviderConfigured = (id: LayoutProviderId) =>
		(layout.providerConfigs[id]?.apiKey ?? "").trim().length > 0;
	// All remote providers are listed for configuration, like the translate
	// pane; the backend selects only offer the configured ones (plus local).
	const cards = mergeProviderCards([
		...Object.values(LAYOUT_PROVIDERS).map((descriptor) =>
			layoutProviderCard(descriptor),
		),
		...Object.values(PARSER_PROVIDERS),
	]);
	const backendOptions = Object.values(LAYOUT_PROVIDERS).filter(
		(descriptor) => {
			if (!isRemoteLayoutProvider(descriptor)) return true;
			if (descriptor.id === layout.backend) return true;
			return isProviderConfigured(descriptor.id);
		},
	);
	const parserBackendOptions = PARSER_BACKENDS.filter(
		(backend) =>
			backend === "local" ||
			backend === layout.parserBackend ||
			isProviderConfigured(backend),
	);

	const openDialog = useCallback((mode: "clear" | "reparse") => {
		setDialogMode(mode);
		setScope("all");
		setDialogOpen(true);
	}, []);

	const handleConfirm = useCallback(async () => {
		if (!vaultPath) return;
		setBusy(true);
		try {
			const result =
				dialogMode === "clear"
					? await clearParseResults(vaultPath, scope)
					: await clearAndReparse(vaultPath, scope);
			notifySuccess(
				t(
					dialogMode === "clear"
						? "layout.clearResults.clearDone"
						: "layout.clearResults.reparseDone",
					{
						scanned: result.papersScanned,
						removed: result.filesRemoved,
						layout: "layoutEnqueued" in result ? result.layoutEnqueued : 0,
						paper: "paperEnqueued" in result ? result.paperEnqueued : 0,
					},
				),
			);
			setDialogOpen(false);
		} catch (err) {
			notifyError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	}, [dialogMode, scope, vaultPath, t]);

	const confirmLabel =
		dialogMode === "clear"
			? t("layout.clearResults.confirmClear")
			: t("layout.clearResults.confirmReparse");

	return (
		<div className="space-y-6">
			<PageTitle title={t("layout.title")} />

			<SettingsGroup>
				<SettingsRow label={t("layout.backend.label")} htmlFor="layout-backend">
					<Select
						value={layout.backend}
						disabled={backendOptions.length <= 1}
						onValueChange={(value) => {
							if (isLayoutBackend(value)) {
								patch({ layout: { ...layout, backend: value } });
							}
						}}
					>
						<SelectTrigger
							id="layout-backend"
							size="sm"
							className={cn(
								"min-w-[200px] max-w-[280px]",
								// Keep full opacity when the sole option is locked — avoids
								// a washed-out look and width jump vs plain text.
								backendOptions.length <= 1 &&
									"disabled:cursor-default disabled:opacity-100",
							)}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="max-h-72">
							{backendOptions.map((descriptor) => (
								<SelectItem key={descriptor.id} value={descriptor.id}>
									{t(
										`layout.backend.${descriptor.id}` as "layout.backend.local",
									)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingsRow>
				<SettingsRow
					label={t("layout.parserBackend.label")}
					htmlFor="layout-parser-backend"
				>
					<Select
						value={layout.parserBackend}
						disabled={parserBackendOptions.length <= 1}
						onValueChange={(value) => {
							if (isParserBackend(value)) {
								patch({ layout: { ...layout, parserBackend: value } });
							}
						}}
					>
						<SelectTrigger
							id="layout-parser-backend"
							size="sm"
							className={cn(
								"min-w-[200px] max-w-[280px]",
								parserBackendOptions.length <= 1 &&
									"disabled:cursor-default disabled:opacity-100",
							)}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="max-h-72">
							{parserBackendOptions.map((backend) => (
								<SelectItem key={backend} value={backend}>
									{t(
										`layout.parserBackend.${backend}` as "layout.parserBackend.local",
									)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingsRow>
			</SettingsGroup>

			<div className="mb-5">
				<h3 className="mb-2 px-0.5 font-medium text-sm">
					{t("layout.providerConfig.section")}
				</h3>
				<div className="grid gap-2">
					{cards.map((card) => (
						<ProviderConfigCard
							key={card.id}
							provider={card}
							settings={settings}
							patch={patch}
						/>
					))}
				</div>
			</div>

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!canManageResults || busy}
					onClick={() => openDialog("clear")}
				>
					<Trash2 data-icon="inline-start" className="size-3.5" />
					{t("layout.clearResults.clear")}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!canManageResults || busy}
					onClick={() => openDialog("reparse")}
				>
					<RefreshCw data-icon="inline-start" className="size-3.5" />
					{t("layout.clearResults.clearAndReparse")}
				</Button>
			</div>

			<Dialog
				open={dialogOpen}
				onOpenChange={(open) => {
					if (!open && !busy) setDialogOpen(false);
				}}
			>
				<DialogContent
					showCloseButton={false}
					className="sm:max-w-xs"
					aria-describedby={undefined}
				>
					<DialogHeader>
						<DialogTitle>
							{dialogMode === "clear"
								? t("layout.clearResults.dialog.clearTitle")
								: t("layout.clearResults.dialog.reparseTitle")}
						</DialogTitle>
					</DialogHeader>

					<div className="space-y-1.5 py-1">
						<Label className="text-xs text-muted-foreground">
							{t("layout.clearResults.dialog.scopeLabel")}
						</Label>
						<Select
							value={scope}
							onValueChange={(v) => setScope(v as ParseResultScope)}
							disabled={busy}
						>
							<SelectTrigger size="sm" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="layout">
									{t("layout.clearResults.scope.layout")}
								</SelectItem>
								<SelectItem value="paper">
									{t("layout.clearResults.scope.paper")}
								</SelectItem>
								<SelectItem value="all">
									{t("layout.clearResults.scope.all")}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={busy}
							onClick={() => setDialogOpen(false)}
						>
							{t("common:cancel")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							disabled={busy}
							onClick={() => void handleConfirm()}
						>
							{busy
								? dialogMode === "clear"
									? t("layout.clearResults.clearing")
									: t("layout.clearResults.reparsing")
								: confirmLabel}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function ProviderConfigCard({
	provider,
	settings,
	patch,
}: {
	provider: ProviderCardDescriptor;
	settings: AppSettings;
	patch: (p: Partial<AppSettings>) => void;
}) {
	const { t } = useTranslation("settings");
	const layout = settings.layout;
	const stored = layout.providerConfigs[provider.id] ?? EMPTY_PROVIDER_CONFIG;
	const [draft, setDraft] = useState<Partial<LayoutProviderConfig>>({});
	const [status, setStatus] = useState<ProbeStatus>("idle");
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const probeAbortRef = useRef<AbortController | null>(null);

	const modelPresets = PROVIDER_MODEL_PRESETS[provider.id] ?? [];
	// Empty stored value means "use the engine default": show that default as
	// the actual input value so the card looks ready to use.
	const defaultModel = modelPresets[0] ?? "";
	const defaultBaseUrl = LAYOUT_PROVIDER_DEFAULT_BASE_URLS[provider.id] ?? "";
	const displayApiKey =
		draft.apiKey !== undefined ? draft.apiKey : stored.apiKey;
	const displayBaseUrl =
		draft.baseUrl !== undefined
			? draft.baseUrl
			: stored.baseUrl || defaultBaseUrl;
	const displayModel =
		draft.model !== undefined ? draft.model : stored.model || defaultModel;
	const displayPrompt =
		draft.prompt !== undefined ? draft.prompt : stored.prompt;
	const displayLanguage =
		draft.language !== undefined
			? draft.language
			: stored.language || DEFAULT_MINERU_LANGUAGE;
	const displayIsOcr = draft.isOcr !== undefined ? draft.isOcr : stored.isOcr;
	const configured = displayApiKey.trim().length > 0;

	const runProbe = useCallback(
		(apiKey: string) => {
			if (!isTauri()) return;
			if (!apiKey.trim()) {
				setStatus("idle");
				return;
			}
			probeAbortRef.current?.abort();
			const ac = new AbortController();
			probeAbortRef.current = ac;
			setStatus("probing");
			// Mask → Host resolves the stored token; plaintext draft → test pre-save.
			void probeLayoutProvider(provider.id, apiKey).then((ok) => {
				if (!ac.signal.aborted) setStatus(ok ? "ok" : "fail");
			});
		},
		[provider.id],
	);

	/**
	 * Persist the current card fields. Empty apiKey clears the stored secret,
	 * falls backends back to local when needed, and drops the provider from the
	 * selects — clearing the input triggers this immediately (no Confirm).
	 */
	const persistConfig = useCallback(
		async (apiKey: string) => {
			const baseUrl = provider.supportsBaseUrl ? displayBaseUrl.trim() : "";
			const model = provider.supportsModel ? displayModel.trim() : "";
			const prompt = provider.supportsPrompt ? displayPrompt.trim() : "";
			const language = provider.supportsLanguage ? displayLanguage : "";
			const isOcr = provider.supportsOcr ? displayIsOcr : false;
			const config = { apiKey, baseUrl, model, prompt, language, isOcr };

			if (!apiKey) {
				// Optimistic UI: hide from backend selects before Host round-trip.
				const cleared = layoutBackendsAfterClearingProvider(
					layout,
					provider.id,
				);
				patch({
					layout: {
						...layout,
						...cleared,
						providerConfigs: {
							...layout.providerConfigs,
							[provider.id]: { ...stored, ...config },
						},
					},
				});
				setDraft({});
				setStatus("idle");
			}

			const { displayLayout } = await persistLayoutProviderConfig({
				settings,
				provider: provider.id,
				config,
			});
			patch({ layout: displayLayout });
			setDraft({});
			if (!apiKey) {
				setStatus("idle");
				return;
			}
			runProbe(apiKey);
		},
		[
			displayBaseUrl,
			displayModel,
			displayPrompt,
			displayLanguage,
			displayIsOcr,
			layout,
			patch,
			provider,
			runProbe,
			settings,
			stored,
		],
	);

	const confirmProvider = useCallback(() => {
		void persistConfig(displayApiKey.trim());
	}, [displayApiKey, persistConfig]);

	useEffect(() => {
		return () => {
			probeAbortRef.current?.abort();
		};
	}, []);

	return (
		<div className="rounded-lg border bg-card px-3 py-2.5">
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<span
								role="status"
								aria-label={t(
									probeStatusLabelKey(
										status,
									) as "layout.providerConfig.probeIdle",
								)}
								className={cn(
									"inline-block size-1.5 shrink-0 rounded-full",
									probeDotClass(status, configured),
								)}
							/>
						</TooltipTrigger>
						<TooltipContent>
							{t(
								probeStatusLabelKey(
									status,
								) as "layout.providerConfig.probeIdle",
							)}
						</TooltipContent>
					</Tooltip>
					<span className="truncate font-medium text-sm">
						{t(
							`layout.providerConfig.providerName.${provider.id}` as "layout.providerConfig.providerName.paddle",
						)}
					</span>
					<Button
						type="button"
						variant="link"
						size="xs"
						className="-ml-1.5 h-auto shrink-0 px-1.5 text-primary"
						onClick={() =>
							openExternalUrl(LAYOUT_PROVIDER_DOCS_URLS[provider.id])
						}
					>
						<ExternalLink data-icon="inline-start" className="size-3" />
						{t("layout.providerConfig.openDocsLabel")}
					</Button>
				</div>
				<Button
					type="button"
					variant="outline"
					size="xs"
					disabled={status === "probing"}
					onClick={() => void confirmProvider()}
				>
					{t("layout.providerConfig.confirm")}
				</Button>
			</div>

			<div className="space-y-2">
				{provider.requiresApiKey ? (
					<div className="flex items-center gap-2">
						<Label
							htmlFor={`layout-provider-${provider.id}-api-key`}
							className="w-20 shrink-0 font-normal text-muted-foreground text-xs"
						>
							{t("layout.providerConfig.apiKey.label")}
						</Label>
						<Input
							id={`layout-provider-${provider.id}-api-key`}
							type="password"
							value={displayApiKey}
							placeholder={t(
								`layout.providerConfig.apiKey.placeholder.${provider.id}` as "layout.providerConfig.apiKey.placeholder.paddle",
							)}
							className="h-8 min-w-0 flex-1 font-mono text-xs placeholder:text-muted-foreground/50"
							spellCheck={false}
							autoComplete="off"
							onChange={(e) => {
								const next = e.target.value;
								if (!next.trim()) {
									setDraft((prev) => ({ ...prev, apiKey: "" }));
									// Clear immediately — do not wait for Confirm.
									if (
										stored.apiKey.trim() ||
										(isLayoutBackend(provider.id) &&
											layout.backend === provider.id) ||
										(isParserBackend(provider.id) &&
											layout.parserBackend === provider.id)
									) {
										void persistConfig("");
									} else {
										setStatus("idle");
									}
									return;
								}
								setDraft((prev) => ({ ...prev, apiKey: next }));
							}}
							onFocus={(e) => e.target.select()}
						/>
					</div>
				) : null}
				{provider.supportsBaseUrl ? (
					<div className="flex items-center gap-2">
						<Label
							htmlFor={`layout-provider-${provider.id}-base-url`}
							className="w-20 shrink-0 font-normal text-muted-foreground text-xs"
						>
							{t("layout.providerConfig.baseUrl.label")}
						</Label>
						<Input
							id={`layout-provider-${provider.id}-base-url`}
							type="text"
							value={displayBaseUrl}
							placeholder={LAYOUT_PROVIDER_DEFAULT_BASE_URLS[provider.id]}
							className="h-8 min-w-0 flex-1 font-mono text-xs placeholder:text-muted-foreground/50"
							spellCheck={false}
							autoComplete="off"
							onChange={(e) =>
								setDraft((prev) => ({ ...prev, baseUrl: e.target.value }))
							}
						/>
					</div>
				) : null}
				{provider.supportsModel ? (
					<div className="flex items-center gap-2">
						<Label
							htmlFor={`layout-provider-${provider.id}-model`}
							className="w-20 shrink-0 font-normal text-muted-foreground text-xs"
						>
							{t("layout.providerConfig.model.label")}
						</Label>
						<Input
							id={`layout-provider-${provider.id}-model`}
							type="text"
							value={displayModel}
							placeholder={modelPresets[0]}
							list={`layout-provider-${provider.id}-model-presets`}
							className="h-8 min-w-0 flex-1 font-mono text-xs placeholder:text-muted-foreground/50"
							spellCheck={false}
							autoComplete="off"
							onChange={(e) =>
								setDraft((prev) => ({ ...prev, model: e.target.value }))
							}
						/>
						<datalist id={`layout-provider-${provider.id}-model-presets`}>
							{modelPresets.map((preset) => (
								<option key={preset} value={preset} />
							))}
						</datalist>
					</div>
				) : null}
				{provider.supportsPrompt ? (
					<div className="flex items-center gap-2">
						<Label
							htmlFor={`layout-provider-${provider.id}-prompt`}
							className="w-20 shrink-0 font-normal text-muted-foreground text-xs"
						>
							{t("layout.providerConfig.prompt.label")}
						</Label>
						<Input
							id={`layout-provider-${provider.id}-prompt`}
							type="text"
							value={displayPrompt}
							placeholder={t("layout.providerConfig.prompt.placeholder")}
							className="h-8 min-w-0 flex-1 font-mono text-xs placeholder:text-muted-foreground/50"
							spellCheck={false}
							autoComplete="off"
							onChange={(e) =>
								setDraft((prev) => ({ ...prev, prompt: e.target.value }))
							}
						/>
					</div>
				) : null}
				{provider.supportsLanguage || provider.supportsOcr ? (
					<Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex items-center gap-1 text-muted-foreground text-xs outline-none transition-colors hover:text-foreground"
								aria-label={t("layout.providerConfig.advanced")}
							>
								<ChevronRight
									className={cn(
										"size-3.5 transition-transform",
										advancedOpen && "rotate-90",
									)}
								/>
								{t("layout.providerConfig.advanced")}
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent className="space-y-2 pt-2">
							{provider.supportsLanguage ? (
								<div className="flex items-center gap-2">
									<Label
										htmlFor={`layout-provider-${provider.id}-language`}
										className="w-20 shrink-0 font-normal text-muted-foreground text-xs"
									>
										<HelpLabel
											label={t("layout.providerConfig.language.label")}
											help={t("layout.providerConfig.language.help")}
										/>
									</Label>
									<Select
										value={displayLanguage}
										onValueChange={(value) =>
											setDraft((prev) => ({ ...prev, language: value }))
										}
									>
										<SelectTrigger
											id={`layout-provider-${provider.id}-language`}
											size="sm"
											className="h-8 min-w-32 max-w-44 text-xs"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent className="max-h-72">
											{MINERU_LANGUAGES.map((language) => (
												<SelectItem key={language} value={language}>
													{t(
														`layout.providerConfig.language.options.${language}` as "layout.providerConfig.language.options.en",
													)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							) : null}
							{provider.supportsOcr ? (
								<div className="flex items-center gap-2">
									<Label
										htmlFor={`layout-provider-${provider.id}-force-ocr`}
										className="w-20 shrink-0 font-normal text-muted-foreground text-xs"
									>
										<HelpLabel
											label={t("layout.providerConfig.forceOcr.label")}
											help={t("layout.providerConfig.forceOcr.help")}
										/>
									</Label>
									<Switch
										id={`layout-provider-${provider.id}-force-ocr`}
										size="sm"
										checked={displayIsOcr}
										onCheckedChange={(checked) =>
											setDraft((prev) => ({
												...prev,
												isOcr: checked === true,
											}))
										}
									/>
								</div>
							) : null}
						</CollapsibleContent>
					</Collapsible>
				) : null}
			</div>
		</div>
	);
}
