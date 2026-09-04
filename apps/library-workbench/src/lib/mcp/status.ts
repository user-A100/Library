/**
 * Loopback MCP server control (Host :8765 by default).
 * @see docs/backend/mcp.md
 */

import { invokeApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";

export const DEFAULT_MCP_PORT = 8765;

export type McpStatus = {
	enabled: boolean;
	listening: boolean;
	port: number;
	url: string | null;
	lastError: string | null;
	vaultPath: string | null;
};

const idle = (port = DEFAULT_MCP_PORT): McpStatus => ({
	enabled: false,
	listening: false,
	port,
	url: null,
	lastError: null,
	vaultPath: null,
});

export async function mcpGetStatus(): Promise<McpStatus> {
	if (!isTauri()) return idle();
	return invokeApi<McpStatus>("mcp_get_status");
}

export async function mcpSetEnabled(enabled: boolean): Promise<McpStatus> {
	if (!isTauri()) return idle();
	return invokeApi<McpStatus>("mcp_set_enabled", { args: { enabled } });
}

export async function mcpSetPort(port: number): Promise<McpStatus> {
	if (!isTauri()) return idle(port);
	return invokeApi<McpStatus>("mcp_set_port", { args: { port } });
}

export async function mcpSetVault(vaultPath: string | null): Promise<void> {
	if (!isTauri()) return;
	await invokeApi<null>(
		"mcp_set_vault",
		{ args: { vaultPath } },
		{ allowVoid: true },
	);
}

export async function mcpSetParentDir(parentDir: string): Promise<void> {
	if (!isTauri()) return;
	const dir = parentDir
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	if (!dir) return;
	await invokeApi<null>(
		"mcp_set_parent_dir",
		{ args: { parentDir: dir } },
		{ allowVoid: true },
	);
}
