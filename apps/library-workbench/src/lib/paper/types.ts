import type { TagColorId } from "@/lib/ui/tag-colors";

/** Paper tag (catalog `tags_json`): name + optional preset color id. */
export type PaperTag = {
	name: string;
	/** Preset id; omit / null = default muted chip */
	color?: TagColorId | null;
};

/** Accept catalog / API payloads: bare string or `{ name, color? }`. */
export type PaperTagInput = string | PaperTag;

/** Creator from Translator / Zotero item mapping. */
export type PaperCreator = {
	firstName?: string;
	lastName?: string;
	name?: string;
	creatorType?: string;
};

/**
 * Paper metadata: catalog.sqlite row (see docs/backend/catalog.md).
 * Magic-wand / Translator results map **directly** into these fields.
 */
export type PaperMetadata = {
	id: string;
	/** Vault-relative paper folder path when known (catalog). */
	path?: string;
	/** Library list projection only: local PDF present on disk. */
	has_pdf?: boolean;
	type: "arxiv" | "pdf" | "html" | "doi" | "other";
	title: string;
	/** Display names */
	authors: string[];
	/** Full creators (roles preserved from Translator) */
	creators?: PaperCreator[];
	year?: number;
	/** Raw date string from Translator */
	date?: string;
	abstract?: string;
	/**
	 * Tags from catalog: bare string or `{ name, color? }`.
	 * UI should coerce via `coercePaperTags`.
	 */
	tags: PaperTagInput[];
	arxiv_id?: string;
	doi?: string;
	isbn?: string;
	issn?: string;
	pmid?: string;
	/** Journal / proceedings / book title */
	publication?: string;
	volume?: string;
	issue?: string;
	pages?: string;
	publisher?: string;
	place?: string;
	series?: string;
	language?: string;
	/** Remote PDF URL only (e.g. https://arxiv.org/pdf/1706.03762) */
	pdf_url?: string;
	/** Remote HTML URL only (e.g. https://arxiv.org/html/1706.03762) */
	html_url?: string;
	source_url?: string;
	body_source?: "latex" | "html" | "pdf" | "ocr" | "mineru" | "paddle" | "vlm";
	body_quality?: "high" | "medium" | "low";
	bibtex_key?: string;
	citation_count?: number;
	/** Translator itemType, e.g. journalArticle */
	zotero_item_type?: string;
	/** libraryCatalog, e.g. DOI.org (Crossref) */
	meta_source?: string;
	/** Translator extra residue */
	extra?: string;
	summary?: string;
	status: "pending" | "importing" | "completed" | "failed";
	/** Whether paper-reader workflow has finished for this paper. */
	is_read?: boolean;
	added_at: string;
	updated_at: string;
};

/** Remote http(s) URL (HTML preview; PDF download candidate / fallback). */
export type RemoteAsset = { url: string };

/** How the PDF viewer source was resolved. */
export type PaperPdfOrigin = "local" | "remote";
