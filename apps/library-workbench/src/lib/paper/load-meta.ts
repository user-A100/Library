import { invokeApi } from "@/lib/core/ipc";
import { toVaultRelative } from "@/lib/core/path";
import { isTauri } from "@/lib/core/tauri";
import { arxivUrls } from "@/lib/paper/arxiv";
import { withNormalizedTags } from "@/lib/paper/tags";
import type { PaperMetadata } from "@/lib/paper/types";

function enrichArxivUrls(data: PaperMetadata): PaperMetadata {
	if (!data.arxiv_id) return data;
	const urls = arxivUrls(data.arxiv_id);
	if (!urls) return data;
	if (!data.pdf_url) data.pdf_url = urls.pdf;
	if (!data.html_url) data.html_url = urls.html;
	if (!data.source_url) data.source_url = urls.abs;
	return data;
}

/**
 * Vault-relative paper folder path for catalog APIs.
 */
export function paperCatalogPath(
	paperDir: string,
	vaultRoot?: string | null,
): string | undefined {
	if (!vaultRoot) return undefined;
	const path = toVaultRelative(vaultRoot, paperDir)
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	if (!path || path === ".") return undefined;
	return path;
}

export type PaperOpenBundle = {
	paper: PaperMetadata;
	pathRel: string;
	notesSeed?: string;
	pdfPath?: string;
	hasTex: boolean;
	hasPaperMd: boolean;
};

/**
 * Bundle local paper-open data from Host in one round trip.
 * Remote vaults intentionally fall back to existing remote helpers.
 */
export async function loadPaperOpenBundle(
	paperDir: string,
	vaultRoot?: string | null,
): Promise<PaperOpenBundle | null> {
	const path = paperCatalogPath(paperDir, vaultRoot);
	if (!isTauri() || !vaultRoot || !path) return null;
	try {
		const { isRemoteVaultHandle } = await import(
			"@/lib/vault/remote/remote-vault"
		);
		if (isRemoteVaultHandle(vaultRoot)) return null;
		void invokeApi(
			"job_focus_paper",
			{ args: { vaultPath: vaultRoot, path } },
			{ allowVoid: true },
		).catch(() => undefined);
		const data = await invokeApi<PaperOpenBundle>(
			"paper_open_bundle",
			{ args: { vaultPath: vaultRoot, path } },
			{ allowVoid: true },
		);
		if (!data?.paper?.id) return null;
		return {
			...data,
			paper: withNormalizedTags(
				enrichArxivUrls({
					...data.paper,
					path: data.paper.path ?? data.pathRel,
				}),
			),
		};
	} catch {
		return null;
	}
}

/**
 * Load paper metadata from catalog.sqlite via Host `paper_get`.
 *
 * Always sets `path` (vault-relative) when `vaultRoot` is known.
 *
 * @param paperDir absolute paper folder path
 * @param vaultRoot absolute vault root (needed for catalog lookup)
 */
export async function loadPaperMetadata(
	paperDir: string,
	vaultRoot?: string | null,
): Promise<PaperMetadata | null> {
	const path = paperCatalogPath(paperDir, vaultRoot);
	if (!isTauri() || !vaultRoot || !path) return null;

	// Primary: SQLite catalog (local vault path or remote work mirror)
	try {
		const { isRemoteVaultHandle, remotePaperGet, remoteSessionIdFromHandle } =
			await import("@/lib/vault/remote/remote-vault");
		let data: PaperMetadata | null = null;
		if (isRemoteVaultHandle(vaultRoot)) {
			const sessionId = remoteSessionIdFromHandle(vaultRoot);
			if (sessionId) {
				data = (await remotePaperGet(sessionId, { path })) as PaperMetadata;
			}
		} else {
			data =
				(await invokeApi<PaperMetadata>(
					"paper_get",
					{ args: { vaultPath: vaultRoot, path } },
					{ allowVoid: true },
				)) ?? null;
		}
		if (data?.id) {
			return withNormalizedTags(
				enrichArxivUrls({
					...data,
					path: data.path ?? path,
				}),
			);
		}
	} catch {
		// catalog miss or Host error
	}
	return null;
}

/**
 * Async paper-folder check when tree children are unavailable
 * (graph navigation, session restore). Probes marker files on disk.
 */
