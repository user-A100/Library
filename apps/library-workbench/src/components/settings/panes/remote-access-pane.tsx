import {
	Copy,
	LoaderCircle,
	MonitorSmartphone,
	Power,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	PageTitle,
	SettingsGroup,
	SettingsRow,
} from "@/components/settings/settings-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	type BridgeDevice,
	type BridgeStatus,
	bridgeDevices,
	bridgeHostStatus,
	bridgeOffer,
	bridgeRespondToPairing,
	bridgeRevokeDevice,
	bridgeStart,
	bridgeStop,
	listenHostStatus,
	listenPairingRequest,
	type PairingRequest,
} from "@/lib/bridge/host";
import { copyTextToClipboard } from "@/lib/core/clipboard";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import {
	isRemoteVaultHandle,
	remoteCacheClear,
} from "@/lib/vault/remote/remote-vault";

const DEFAULT_RELAY = "relay.philfan.cn";

export function RemoteAccessPane({ vaultPath }: { vaultPath: string | null }) {
	const { t } = useTranslation("settings");
	const [status, setStatus] = useState<BridgeStatus | null>(null);
	const [devices, setDevices] = useState<BridgeDevice[]>([]);
	const [pending, setPending] = useState<PairingRequest[]>([]);
	const [offerUrl, setOfferUrl] = useState("");
	const [qrUrl, setQrUrl] = useState("");
	const [hostName, setHostName] = useState(
		() => window.location.hostname || "Agentero",
	);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		const next = await bridgeHostStatus();
		setStatus(next);
		setPending(next.pendingPairings);
		if (!next.enabled) {
			setOfferUrl("");
			setQrUrl("");
			setDevices([]);
			return;
		}
		const [offer, savedDevices] = await Promise.all([
			bridgeOffer(),
			bridgeDevices(),
		]);
		setOfferUrl(offer.url);
		setQrUrl(
			await QRCode.toDataURL(offer.url, {
				errorCorrectionLevel: "M",
				margin: 1,
				width: 240,
			}),
		);
		setDevices(savedDevices.filter((device) => !device.revoked));
	}, []);

	useEffect(() => {
		if (!isTauri()) return;
		void refresh().catch((error) => notifyError(errorText(error)));
		const unlisten: Array<() => void> = [];
		void listenPairingRequest((request) => {
			setPending((current) => [
				...current.filter((item) => item.requestId !== request.requestId),
				request,
			]);
		}).then((off) => unlisten.push(off));
		void listenHostStatus(() => {
			void refresh().catch(() => undefined);
		}).then((off) => unlisten.push(off));
		return () => {
			for (const off of unlisten) off();
		};
	}, [refresh]);

	const start = async () => {
		if (!vaultPath || isRemoteVaultHandle(vaultPath)) return;
		setBusy(true);
		try {
			await bridgeStart({ vaultPath, hostName, relayEndpoint: DEFAULT_RELAY });
			await refresh();
		} catch (error) {
			notifyError(errorText(error));
		} finally {
			setBusy(false);
		}
	};

	const stop = async () => {
		setBusy(true);
		try {
			await bridgeStop();
			await refresh();
		} catch (error) {
			notifyError(errorText(error));
		} finally {
			setBusy(false);
		}
	};

	const respond = async (request: PairingRequest, allowed: boolean) => {
		try {
			await bridgeRespondToPairing(request.requestId, allowed);
			setPending((current) =>
				current.filter((item) => item.requestId !== request.requestId),
			);
			await refresh();
		} catch (error) {
			notifyError(errorText(error));
		}
	};

	const revoke = async (deviceId: string) => {
		try {
			await bridgeRevokeDevice(deviceId);
			await refresh();
		} catch (error) {
			notifyError(errorText(error));
		}
	};

	const unavailable = !vaultPath || isRemoteVaultHandle(vaultPath);
	return (
		<>
			<PageTitle
				title={t("remoteAccess.title")}
				actions={
					unavailable ? undefined : (
						<div className="flex items-center gap-3">
							<span className="flex items-center gap-2 text-muted-foreground text-xs">
								<span
									className={`size-2 rounded-full ${status?.online ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
								/>
								{status?.online
									? t("remoteAccess.status.online")
									: t("remoteAccess.status.offline")}
							</span>
							<Button
								type="button"
								size="sm"
								onClick={status?.enabled ? stop : start}
								disabled={busy}
							>
								{busy ? (
									<LoaderCircle className="size-4 animate-spin" />
								) : (
									<Power className="size-4" />
								)}
								{status?.enabled
									? t("remoteAccess.stop")
									: t("remoteAccess.start")}
							</Button>
						</div>
					)
				}
			/>
			{unavailable ? (
				<p className="text-muted-foreground text-sm leading-relaxed">
					{t("remoteAccess.localVaultRequired")}
				</p>
			) : (
				<>
					<SettingsGroup>
						<SettingsRow
							label={t("remoteAccess.hostName.label")}
							htmlFor="bridge-host-name"
						>
							<Input
								id="bridge-host-name"
								value={hostName}
								onChange={(event) => setHostName(event.target.value)}
								disabled={status?.enabled}
								className="h-8 w-44"
							/>
						</SettingsRow>
					</SettingsGroup>
					{status?.lastError ? (
						<p className="mb-5 text-destructive text-xs">{status.lastError}</p>
					) : null}
					{status?.enabled && offerUrl ? (
						<SettingsGroup>
							<div className="flex items-center gap-5 px-3.5 py-4">
								{qrUrl ? (
									<img
										src={qrUrl}
										alt={t("remoteAccess.qrAlt")}
										className="size-32 shrink-0 border"
									/>
								) : (
									<div className="grid size-32 place-items-center border">
										<MonitorSmartphone className="size-5 text-muted-foreground" />
									</div>
								)}
								<div className="min-w-0 space-y-3">
									<p className="font-medium text-sm">
										{t("remoteAccess.pairing.title")}
									</p>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											void copyTextToClipboard(offerUrl, {
												successMessage: t("remoteAccess.copied"),
												errorMessage: t("remoteAccess.copyFailed"),
											})
										}
									>
										<Copy className="size-3.5" />
										{t("remoteAccess.copyLink")}
									</Button>
								</div>
							</div>
						</SettingsGroup>
					) : null}
					{pending.length > 0 ? (
						<SettingsGroup>
							{pending.map((request) => (
								<div
									key={request.requestId}
									className="flex items-center justify-between gap-4 border-b px-3.5 py-3 last:border-b-0"
								>
									<div className="min-w-0">
										<p className="font-medium text-sm">
											{t("remoteAccess.request.title", {
												device: request.deviceName,
											})}
										</p>
										<p className="mt-0.5 font-mono text-muted-foreground text-xs">
											{t("remoteAccess.request.code", {
												code: request.verificationCode,
											})}
										</p>
									</div>
									<div className="flex shrink-0 gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => void respond(request, false)}
										>
											{t("remoteAccess.deny")}
										</Button>
										<Button
											type="button"
											size="sm"
											onClick={() => void respond(request, true)}
										>
											<ShieldCheck className="size-3.5" />
											{t("remoteAccess.approve")}
										</Button>
									</div>
								</div>
							))}
						</SettingsGroup>
					) : null}
					{status?.enabled && devices.length > 0 ? (
						<SettingsGroup>
							{devices.map((device) => (
								<div
									key={device.deviceId}
									className="flex items-center justify-between gap-3 border-b px-3.5 py-2.5 last:border-b-0"
								>
									<div className="min-w-0">
										<p className="truncate text-sm">{device.name}</p>
										<p className="truncate text-muted-foreground text-xs">
											{device.deviceId}
										</p>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={t("remoteAccess.devices.revoke", {
											device: device.name,
										})}
										onClick={() => void revoke(device.deviceId)}
									>
										<Trash2 className="size-3.5" />
									</Button>
								</div>
							))}
						</SettingsGroup>
					) : null}
				</>
			)}
			<RemoteCacheSettingsBlock />
		</>
	);
}

function RemoteCacheSettingsBlock() {
	const { t } = useTranslation("settings");
	const [busy, setBusy] = useState(false);

	const onClear = async () => {
		if (!isTauri() || busy) return;
		setBusy(true);
		try {
			await remoteCacheClear();
		} catch (e) {
			notifyError(
				e instanceof Error ? e.message : t("remoteAccess.cache.clearFailed"),
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="mt-4">
			<p className="mb-2 px-0.5 font-medium text-[13px]">
				{t("remoteAccess.cache.section")}
			</p>
			<SettingsGroup>
				<SettingsRow label={t("remoteAccess.cache.label")}>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8"
						disabled={busy || !isTauri()}
						onClick={() => void onClear()}
					>
						{busy
							? t("remoteAccess.cache.clearing")
							: t("remoteAccess.cache.clear")}
					</Button>
				</SettingsRow>
			</SettingsGroup>
		</div>
	);
}
