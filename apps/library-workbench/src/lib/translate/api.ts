import {
	commands,
	type TranslateTextArgs,
	type TranslateTextResult,
} from "@/lib/core/bindings";
import { isTauri } from "@/lib/core/tauri";

export type { TranslateTextArgs, TranslateTextResult };

/**
 * Host MT command via the generated typed binding (tauri-specta pilot).
 * `provider` selects a free web engine or a commercial BYOK engine.
 * Regenerate bindings: `cargo test -p agentero export_typescript_bindings`.
 */
export async function invokeTranslateText(args: {
	text: string;
	sourceLang: string;
	targetLang: string;
	provider: string;
	apiKey?: string;
	baseUrl?: string;
	region?: string;
	model?: string;
	/** Host request timeout (ms); clamped 1s–30s server-side. */
	timeoutMs?: number;
}): Promise<string> {
	if (!isTauri()) {
		throw new Error("Free translation requires the Tauri desktop app.");
	}
	const res = await commands.translateText({
		text: args.text,
		sourceLang: args.sourceLang,
		targetLang: args.targetLang,
		provider: args.provider,
		apiKey: args.apiKey?.trim() || null,
		baseUrl: args.baseUrl?.trim() || null,
		region: args.region?.trim() || null,
		model: args.model?.trim() || null,
		timeoutMs: args.timeoutMs ?? null,
	});
	if (!res.ok || !res.data) {
		throw new Error(res.error?.message ?? "translate failed");
	}
	return res.data.text;
}
