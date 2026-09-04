/**
 * Availability probes for free MT and commercial BYOK providers (excludes Agent).
 * Used by Settings → Translate when the default-service Select opens or on Confirm.
 */

import { isTauri } from "@/lib/core/tauri";
import { invokeTranslateText } from "@/lib/translate/api";
import type {
	CommercialTranslateProviderId,
	FreeTranslateProviderId,
	TranslateProviderConfig,
} from "@/lib/translate/types";
import { FREE_MT_PROVIDER_IDS } from "@/lib/translate/types";

/** Short probe sample: en → zh-CN, minimal payload. */
const PROBE_TEXT = "Hi";
const PROBE_SOURCE = "en";
const PROBE_TARGET = "zh-CN";

/** Host timeout for each probe request (ms). */
export const TRANSLATE_PROBE_TIMEOUT_MS = 5_000;

export type FreeMtProbeStatus = "idle" | "probing" | "ok" | "fail";

export type FreeMtProbeMap = Partial<
	Record<FreeTranslateProviderId, FreeMtProbeStatus>
>;

export type CommercialMtProbeMap = Partial<
	Record<CommercialTranslateProviderId, FreeMtProbeStatus>
>;

export type ProbeFreeMtOptions = {
	/** Per-request timeout; default {@link TRANSLATE_PROBE_TIMEOUT_MS}. */
	timeoutMs?: number;
	/** Called as each provider finishes (progressive UI). */
	onResult?: (id: FreeTranslateProviderId, ok: boolean) => void;
	/**
	 * Optional abort: when aborted, remaining probes still resolve as fail
	 * (Tauri invoke cannot cancel in-flight host work).
	 */
	signal?: AbortSignal;
};

export type ProbeCommercialMtOptions = {
	config: TranslateProviderConfig;
	/** Per-request timeout; default {@link TRANSLATE_PROBE_TIMEOUT_MS}. */
	timeoutMs?: number;
	signal?: AbortSignal;
};

/**
 * Host redacts a commercial API key to the same number of `*` characters.
 * Must match `mask_translate_api_key` / `is_translate_api_key_mask` in
 * `src-tauri/.../settings/mod.rs`.
 */
export function maskTranslateApiKey(apiKey: string): string {
	const n = [...apiKey.trim()].length;
	return n === 0 ? "" : "*".repeat(n);
}

export function isTranslateApiKeyMask(apiKey: string | undefined): boolean {
	const t = apiKey?.trim() ?? "";
	return t.length > 0 && /^\*+$/.test(t);
}

/** True when a non-empty key is stored (plaintext or host `*`-mask). */
export function hasTranslateApiKey(apiKey: string | undefined): boolean {
	return Boolean(apiKey?.trim());
}

export function isCommercialProviderConfigured(
	id: CommercialTranslateProviderId,
	config: TranslateProviderConfig | undefined,
): boolean {
	if (!hasTranslateApiKey(config?.apiKey)) return false;
	if (id === "azure" && !config?.region.trim()) return false;
	if (id === "openaiCompatible" && !config?.model.trim()) return false;
	return true;
}

async function probeOne(
	id: FreeTranslateProviderId,
	opts: ProbeFreeMtOptions,
): Promise<boolean> {
	if (opts.signal?.aborted) return false;
	if (!isTauri()) return false;
	try {
		const text = await invokeTranslateText({
			text: PROBE_TEXT,
			sourceLang: PROBE_SOURCE,
			targetLang: PROBE_TARGET,
			provider: id,
			timeoutMs: opts.timeoutMs ?? TRANSLATE_PROBE_TIMEOUT_MS,
		});
		return text.trim().length > 0;
	} catch {
		return false;
	}
}

/**
 * Probe all free MT engines in parallel (not Agent).
 * Results stream via `onResult`; returned map is the final snapshot.
 */
export async function probeFreeMtProviders(
	opts: ProbeFreeMtOptions = {},
): Promise<Record<FreeTranslateProviderId, boolean>> {
	const results = await Promise.all(
		FREE_MT_PROVIDER_IDS.map(async (id) => {
			const ok = await probeOne(id, opts);
			opts.onResult?.(id, ok);
			return [id, ok] as const;
		}),
	);
	const map = {} as Record<FreeTranslateProviderId, boolean>;
	for (const [id, ok] of results) {
		map[id] = ok;
	}
	return map;
}

export async function probeCommercialMtProvider(
	id: CommercialTranslateProviderId,
	opts: ProbeCommercialMtOptions,
): Promise<boolean> {
	if (opts.signal?.aborted) return false;
	if (!isCommercialProviderConfigured(id, opts.config)) return false;
	if (!isTauri()) return false;
	const rawKey = opts.config.apiKey.trim();
	try {
		const text = await invokeTranslateText({
			text: PROBE_TEXT,
			sourceLang: PROBE_SOURCE,
			targetLang: PROBE_TARGET,
			provider: id,
			// Mask → Host resolves from durable settings; real draft key is sent once.
			apiKey: rawKey && !isTranslateApiKeyMask(rawKey) ? rawKey : undefined,
			baseUrl: opts.config.baseUrl,
			region: opts.config.region,
			model: opts.config.model,
			timeoutMs: opts.timeoutMs ?? TRANSLATE_PROBE_TIMEOUT_MS,
		});
		return text.trim().length > 0;
	} catch {
		return false;
	}
}
