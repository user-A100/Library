/**
 * Shared Tauri command helper for Host `ApiResult<T>` envelopes.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/core/tauri";

export type ApiResult<T> = {
	ok: boolean;
	data?: T;
	error?: { code: string; message: string; details?: unknown };
};

export type ApiError = Error & { details?: unknown };

export type InvokeApiOptions = {
	/** Error message when `ok` is false or data is missing. */
	fallback?: string;
	/**
	 * When set, non-Tauri environments throw this message.
	 * When omitted, non-Tauri throws a generic desktop-only error.
	 */
	desktopOnly?: string;
	/**
	 * Allow successful responses with no `data` (void-ish commands).
	 * Returns `undefined as T` in that case.
	 */
	allowVoid?: boolean;
};

/**
 * Invoke a Host command that returns `{ ok, data?, error? }`.
 * Throws on failure; returns `data` on success.
 */
export async function invokeApi<T>(
	cmd: string,
	args?: Record<string, unknown>,
	opts: InvokeApiOptions = {},
): Promise<T> {
	if (!isTauri()) {
		throw new Error(
			opts.desktopOnly ??
				opts.fallback ??
				`Command ${cmd} requires the Tauri desktop app.`,
		);
	}
	const res = await invoke<ApiResult<T>>(cmd, args);
	if (!res.ok) {
		const error = new Error(
			res.error?.message ?? opts.fallback ?? `Command ${cmd} failed`,
		) as ApiError;
		error.details = res.error?.details;
		throw error;
	}
	if (res.data === undefined) {
		if (opts.allowVoid) return undefined as T;
		throw new Error(
			res.error?.message ?? opts.fallback ?? `Command ${cmd} failed`,
		);
	}
	return res.data;
}
