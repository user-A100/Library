import { listen } from "@tauri-apps/api/event";
import { invokeApi } from "@/lib/core/ipc";

export type BridgeClientStatus = {
	connected: boolean;
	paired: boolean;
	serverId?: string;
	hostName?: string;
	relayEndpoint?: string;
	vaultName?: string;
	lastError?: string;
};

export type PairPendingEvent = {
	requestId: string;
	verificationCode: string;
};

export async function bridgeConnect(args: {
	offerUrl: string;
	deviceName: string;
}): Promise<BridgeClientStatus> {
	return invokeApi<BridgeClientStatus>(
		"bridge_connect",
		{ args },
		{
			fallback: "Could not connect to this desktop",
		},
	);
}

export async function bridgeDisconnect(): Promise<void> {
	await invokeApi<void>("bridge_disconnect", undefined, {
		fallback: "Could not disconnect from this desktop",
		allowVoid: true,
	});
}

export async function bridgeResume(): Promise<BridgeClientStatus> {
	return invokeApi<BridgeClientStatus>("bridge_resume", undefined, {
		fallback: "Could not resume this desktop connection",
	});
}

export async function bridgeStatus(): Promise<BridgeClientStatus> {
	return invokeApi<BridgeClientStatus>("bridge_status", undefined, {
		fallback: "Could not read connection status",
	});
}

export async function bridgeRpc<T>(
	method: string,
	params: Record<string, unknown> = {},
): Promise<T> {
	return invokeApi<T>(
		"bridge_rpc",
		{ method, params },
		{
			fallback: `${method} failed`,
		},
	);
}

export async function listenBridgeStatus(
	handler: (status: BridgeClientStatus) => void,
): Promise<() => void> {
	return listen<BridgeClientStatus>("bridge:status", (event) =>
		handler(event.payload),
	);
}

export type BridgeProgressPhase =
	| "relayConnecting"
	| "e2eeHandshake"
	| "pairing"
	| "authenticating"
	| "connected";

export async function listenBridgeProgress(
	handler: (phase: BridgeProgressPhase) => void,
): Promise<() => void> {
	return listen<BridgeProgressPhase>("bridge:progress", (event) =>
		handler(event.payload),
	);
}

export async function listenPairPending(
	handler: (event: PairPendingEvent) => void,
): Promise<() => void> {
	return listen<PairPendingEvent>("bridge:pair-pending", (event) =>
		handler(event.payload),
	);
}

export async function listenBridgeEvent<T>(
	name: string,
	handler: (payload: T) => void,
): Promise<() => void> {
	return listen<T>(`bridge:event:${name}`, (event) => handler(event.payload));
}
