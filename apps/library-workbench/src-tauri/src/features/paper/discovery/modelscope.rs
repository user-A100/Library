//! ModelScope 论文广场 fetcher for headless plaza discovery.
//!
//! The public `GET /api/v1/papers` endpoint is a latest-ingest firehose: the
//! site ignores `Query`/`Keyword` params and only allows `Sort=Default`, so
//! topic filtering happens client-side over the fetched pages
//! ([`filter_papers`]). The embedded 广场 panel shows the same feed.

use crate::core::error::AppError;
use crate::core::http;
use serde::Serialize;
use std::time::Duration;

const API_URL: &str = "https://modelscope.cn/api/v1/papers";
const FETCH_TIMEOUT_SECS: u64 = 20;
/// The endpoint paginates in place and the feed is ingest-ordered, so a topic
/// paper can sit hundreds of records deep (measured: ~520). Twenty pages at
/// the 50-per-page cap is 1000 titles without stressing the API.
const MAX_PAGES: usize = 20;
const MAX_PAGE_SIZE: usize = 50;

/// One paper from the ModelScope feed, trimmed to what discovery needs.
/// Numeric fields arrive as strings (`"Star": "4.5"`); they are kept as-is.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelScopePaper {
    pub arxiv_id: Option<String>,
    pub title: String,
    pub title_cn: Option<String>,
    pub authors: Option<String>,
    pub abstract_cn: Option<String>,
    pub abstract_en: Option<String>,
    pub domains: Option<String>,
    pub types: Option<String>,
    pub url: Option<String>,
    pub pdf_url: Option<String>,
    pub publish_date: Option<String>,
    pub star: Option<String>,
    pub view_count: Option<String>,
}

/// Raw record shape (`{"Code":200,"Data":{"Papers":[…]}}`); every field but
/// the title may be missing or null on any given card. The site's field types
/// drift card to card — `Star` arrives as `"4.5"` on one record and `4.5` on
/// the next, `Type` as a stringified list or a real array — so every field
/// deserializes as a raw JSON value and is coerced in [`raw_to_string`].
#[derive(Debug, serde::Deserialize)]
struct RawPaper {
    #[serde(default, rename = "ArxivId")]
    arxiv_id: Option<serde_json::Value>,
    #[serde(default, rename = "Title")]
    title: Option<serde_json::Value>,
    #[serde(default, rename = "RecommendedTitle")]
    recommended_title: Option<serde_json::Value>,
    #[serde(default, rename = "Authors")]
    authors: Option<serde_json::Value>,
    #[serde(default, rename = "AbstractCn")]
    abstract_cn: Option<serde_json::Value>,
    #[serde(default, rename = "AbstractEn")]
    abstract_en: Option<serde_json::Value>,
    #[serde(default, rename = "ModelDomain")]
    domains: Option<serde_json::Value>,
    #[serde(default, rename = "Type")]
    types: Option<serde_json::Value>,
    #[serde(default, rename = "ArxivUrl")]
    arxiv_url: Option<serde_json::Value>,
    #[serde(default, rename = "PdfUrl")]
    pdf_url: Option<serde_json::Value>,
    #[serde(default, rename = "PublishDate")]
    publish_date: Option<serde_json::Value>,
    #[serde(default, rename = "Star")]
    star: Option<serde_json::Value>,
    #[serde(default, rename = "ViewCount")]
    view_count: Option<serde_json::Value>,
}

/// Coerce a loosely-typed API field to text: strings pass through, numbers
/// stringify, arrays join with `、`, everything else (null/bool/object) is
/// dropped. Whitespace-collapsed.
fn raw_to_string(value: &Option<serde_json::Value>) -> Option<String> {
    let text = match value.as_ref()? {
        serde_json::Value::String(s) => s.trim().to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Array(items) => {
            let parts = items
                .iter()
                .filter_map(|item| match item {
                    serde_json::Value::String(s) => Some(s.trim().to_string()),
                    serde_json::Value::Number(n) => Some(n.to_string()),
                    _ => None,
                })
                .collect::<Vec<_>>();
            if parts.is_empty() {
                return None;
            }
            parts.join("、")
        }
        _ => return None,
    };
    (!text.is_empty()).then_some(text)
}

#[derive(Debug, serde::Deserialize)]
struct RawFeed {
    #[serde(default, rename = "Code")]
    code: i64,
    #[serde(default, rename = "Data")]
    data: Option<RawData>,
}

#[derive(Debug, serde::Deserialize)]
struct RawData {
    #[serde(default, rename = "Papers")]
    papers: Option<Vec<RawPaper>>,
}

/// Fetch `pages` pages of the latest-ingest feed, `page_size` per page.
pub async fn fetch_modelscope_papers(
    pages: usize,
    page_size: usize,
) -> Result<Vec<ModelScopePaper>, AppError> {
    let client = http::client(Duration::from_secs(FETCH_TIMEOUT_SECS))?;
    let pages = pages.clamp(1, MAX_PAGES);
    let page_size = page_size.clamp(1, MAX_PAGE_SIZE);
    let mut out = Vec::new();
    for page in 1..=pages {
        let url = format!("{API_URL}?PageSize={page_size}&PageNumber={page}");
        let body = client
            .get(&url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| AppError::message(format!("modelscope request failed: {e}")))?
            .text()
            .await
            .map_err(|e| AppError::message(format!("modelscope body failed: {e}")))?;
        let parsed = parse_papers(&body)?;
        if parsed.is_empty() {
            break;
        }
        out.extend(parsed);
    }
    Ok(out)
}

/// Parse one API response body; a non-200 `Code` or unusable shape is an error.
pub(crate) fn parse_papers(body: &str) -> Result<Vec<ModelScopePaper>, AppError> {
    let feed: RawFeed = serde_json::from_str(body)
        .map_err(|e| AppError::message(format!("modelscope response is not valid JSON: {e}")))?;
    if feed.code != 200 {
        return Err(AppError::message(format!(
            "modelscope returned code {}",
            feed.code
        )));
    }
    let papers = feed.data.and_then(|d| d.papers).unwrap_or_default();
    Ok(papers
        .into_iter()
        .filter_map(|raw| {
            let title = raw_to_string(&raw.title)?;
            Some(ModelScopePaper {
                arxiv_id: raw_to_string(&raw.arxiv_id),
                title,
                title_cn: raw_to_string(&raw.recommended_title),
                authors: raw_to_string(&raw.authors),
                abstract_cn: raw_to_string(&raw.abstract_cn),
                abstract_en: raw_to_string(&raw.abstract_en),
                domains: raw_to_string(&raw.domains),
                types: raw_to_string(&raw.types),
                url: raw_to_string(&raw.arxiv_url),
                pdf_url: raw_to_string(&raw.pdf_url),
                publish_date: raw_to_string(&raw.publish_date),
                star: raw_to_string(&raw.star),
                view_count: raw_to_string(&raw.view_count),
            })
        })
        .collect())
}

/// Keep papers whose title / Chinese title / abstracts / domain-and-type tags
/// mention every keyword (case-insensitive). Tags matter: a topic like
/// 情感计算 often appears only in `ModelDomain`/`Type`, never in the abstract.
/// Empty keywords keep everything.
pub fn filter_papers(papers: &[ModelScopePaper], keywords: &[String]) -> Vec<ModelScopePaper> {
    let needles: Vec<String> = keywords
        .iter()
        .map(|k| k.trim().to_lowercase())
        .filter(|k| !k.is_empty())
        .collect();
    papers
        .iter()
        .filter(|p| {
            let haystack = [
                Some(p.title.as_str()),
                p.title_cn.as_deref(),
                p.abstract_cn.as_deref(),
                p.abstract_en.as_deref(),
                p.domains.as_deref(),
                p.types.as_deref(),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
            needles.iter().all(|n| haystack.contains(n))
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const BODY: &str = r#"{"Code":200,"Data":{"Papers":[
		{"ArxivId":"2609.04242","Title":"Training-Free Speech-Centric Omni Understanding","RecommendedTitle":"基于冻结VLM的免训练语音中心全模态理解","AbstractCn":"本文提出了免训练框架。","AbstractEn":"Audio-visual understanding remains challenging.","ArxivUrl":"https://arxiv.org/abs/2609.04242","PdfUrl":"https://arxiv.org/pdf/2609.04242","PublishDate":"2026-08-07T00:00:00Z","Star":"4.5","ViewCount":"1"},
		{"Title":"AffectDiffusion: Emotion-Aware Generation","ModelDomain":"多模态学习、情感计算","Type":"['情感计算', 'Audio and Speech Processing']"},
		{"Title":"Numeric Star Card","Star":4.5,"ViewCount":12},
		{"AbstractCn":"no title record is dropped"}
	]}}"#;

    #[test]
    fn parses_records_with_string_typed_numbers_and_missing_fields() {
        let papers = parse_papers(BODY).unwrap();
        assert_eq!(papers.len(), 3);
        assert_eq!(papers[0].arxiv_id.as_deref(), Some("2609.04242"));
        assert_eq!(papers[0].star.as_deref(), Some("4.5"));
        assert_eq!(
            papers[0].title_cn.as_deref(),
            Some("基于冻结VLM的免训练语音中心全模态理解")
        );
        // Missing fields stay None instead of failing the whole record.
        assert!(papers[1].arxiv_id.is_none());
        // The same field may arrive as a JSON number on the next card.
        assert_eq!(papers[2].star.as_deref(), Some("4.5"));
        assert_eq!(papers[2].view_count.as_deref(), Some("12"));
    }

    #[test]
    fn rejects_non_success_code() {
        let err = parse_papers(r#"{"Code":10024301001,"Message":"nope"}"#).unwrap_err();
        assert!(err.to_string().contains("10024301001"));
    }

    #[test]
    fn filters_by_all_keywords_across_fields_case_insensitively() {
        let papers = parse_papers(BODY).unwrap();
        let hit = filter_papers(&papers, &["speech".into()]);
        // Title match on record 0, plus AffectDiffusion's tag
        // "Audio and Speech Processing".
        assert_eq!(hit.len(), 2);
        assert_eq!(hit[0].arxiv_id.as_deref(), Some("2609.04242"));
        // Chinese keyword matches the Chinese abstract.
        let cn = filter_papers(&papers, &["免训练".into()]);
        assert_eq!(cn.len(), 1);
        // A topic keyword that only exists in the domain/type tags still hits.
        let tag = filter_papers(&papers, &["情感计算".into()]);
        assert_eq!(tag.len(), 1);
        assert_eq!(tag[0].title, "AffectDiffusion: Emotion-Aware Generation");
        // Multiple keywords are ANDed across fields.
        let both = filter_papers(&papers, &["speech".into(), "challenging".into()]);
        assert_eq!(both.len(), 1);
        let none = filter_papers(&papers, &["speech".into(), "quantum".into()]);
        assert!(none.is_empty());
        // No keywords keeps everything.
        assert_eq!(filter_papers(&papers, &[]).len(), 3);
    }
}
