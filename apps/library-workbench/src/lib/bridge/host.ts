import { listen } from "@tauri-apps/api/event";
import { invokeApi } from "@/lib/core/ipc";

export type BridgeStatus = {
	enabled: boolean;
	online: boolean;
	serverId?: string;
	relayEndpoint: string;
	hostName?: string;
	vaultPath?: string;
	activeConnections: number;
	pendingPairings: PairingRequest[];
	lastError?: string;
};

export type BridgeOfferResult = { url: string };

export type PairingRequest = {
	requestId: string;
	deviceId: string;
	deviceName: string;
	verificationCode: string;
};

export type BridgeDevice = {
	deviceId: string;
	name: string;
	pairedAt: string;
	lastSeenAt?: string;
	revoked: boolean;
};

export function bridgeStart(args: {
	vaultPath: string;
	hostName: string;
	relayEndpoint?: string;
}): Promise<BridgeStatus> {
	return invokeApi("bridge_start", { args });
}

export function bridgeStop(): Promise<void> {
	return invokeApi("bridge_stop", undefined, { allowVoid: true });
}

export function bridgeHostStatus(): Promise<BridgeStatus> {
	return invokeApi("bridge_status");
}

export function bridgeOffer(): Promise<BridgeOfferResult> {
	return invokeApi("bridge_offer");
}

export function bridgeDevices(): Promise<BridgeDevice[]> {
	return invokeApi("bridge_devices");
}

export function bridgeRespondToPairing(
	requestId: string,
	allowed: boolean,
): Promise<boolean> {
	return invokeApi("bridge_pair_respond", { requestId, allowed });
}

export function bridgeRevokeDevice(deviceId: string): Promise<boolean> {
	return invokeApi("bridge_revoke_device", { deviceId });
}

export function listenPairingRequest(
	handler: (request: PairingRequest) => void,
): Promise<() => void> {
	return listen<PairingRequest>("bridge:pair-request", (event) =>
		handler(event.payload),
	);
}

export function listenHostStatus(
	handler: (online: boolean) => void,
): Promise<() => void> {
	return listen<boolean>("bridge:host-status", (event) =>
		handler(event.payload),
	);
}
