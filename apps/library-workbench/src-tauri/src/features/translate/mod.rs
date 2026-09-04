//! Translation backends.
//! Free web MT plus commercial BYOK providers called directly by the Host.
//! Unofficial / best-effort; may break or rate-limit.

use crate::core::error::AppError;
use crate::core::http;
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Soft cap for a single translation request (characters).
pub const MAX_TEXT_CHARS: usize = 5000;

/// Known free MT provider ids.
pub const FREE_PROVIDERS: &[&str] = &[
    "google",
    "googleapi",
    "deeplx",
    "huoshanweb",
    "tencenttransmart",
];

/// Commercial BYOK provider ids configured in Settings → Translate.
pub const COMMERCIAL_PROVIDERS: &[&str] = &["deepl", "azure", "googleCloud", "openaiCompatible"];

/// Default free engines raced in parallel for best-effort zh-CN (NOTES abstract).
/// First non-empty success wins; remaining in-flight requests are dropped.
/// Prefer engines that work better from CN networks.
pub const ZH_RACE_PROVIDERS: &[&str] = &["tencenttransmart", "huoshanweb", "deeplx"];

/// Per-engine HTTP timeout for [`free_mt_to_zh`] (import NOTES abstract, etc.).
///
/// Bench (2026-08, 5 arXiv abstracts ≈0.9–1.8k chars, Host-equivalent endpoints):
/// success p50 ≈0.5–0.9s, max ≈1.3s. Engines run **in parallel**, so wall time is
/// ~min(successes) rather than sum of failures. 5s ≈4× headroom on a slow success;
/// worst-case wall time is one timeout (5s), not 3×.
pub const FREE_MT_ZH_TIMEOUT_MS: u32 = 5_000;

/// zh-CN via parallel free-MT race; `None` when every engine fails or returns empty.
///
/// Spawns one request per [`ZH_RACE_PROVIDERS`] entry and returns the **first**
/// non-empty translation. Dropping unfinished tasks cancels their HTTP work.
pub async fn free_mt_to_zh(text: &str) -> Option<String> {
    use futures_util::stream::{FuturesUnordered, StreamExt};

    let slice: String = text.chars().take(MAX_TEXT_CHARS).collect();
    if slice.trim().is_empty() {
        return None;
    }

    let mut tasks = FuturesUnordered::new();
    for provider in ZH_RACE_PROVIDERS {
        let text = slice.clone();
        let provider = (*provider).to_string();
        tasks.push(async move {
            let r = translate_text(TranslateTextArgs {
                text,
                source_lang: "auto".into(),
                target_lang: "zh-CN".into(),
                provider,
                api_key: None,
                base_url: None,
                region: None,
                model: None,
                timeout_ms: Some(FREE_MT_ZH_TIMEOUT_MS),
            })
            .await
            .ok()?;
            let t = r.text.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        });
    }

    while let Some(result) = tasks.next().await {
        if let Some(translated) = result {
            // Drop `tasks` → cancel remaining engine futures / HTTP clients.
            return Some(translated);
        }
    }
    None
}

/// Heuristic: already mostly CJK → skip MT (e.g. Chinese papers).
pub fn looks_mostly_cjk(s: &str) -> bool {
    let mut cjk = 0usize;
    let mut letters = 0usize;
    for c in s.chars() {
        if ('\u{4e00}'..='\u{9fff}').contains(&c) {
            cjk += 1;
        } else if c.is_ascii_alphabetic() {
            letters += 1;
        }
    }
    cjk > 0 && cjk >= letters
}

#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslateTextArgs {
    pub text: String,
    #[serde(default = "default_source")]
    pub source_lang: String,
    pub target_lang: String,
    /// Provider id: free MT, commercial BYOK, or `agent`.
    #[serde(default = "default_provider")]
    pub provider: String,
    /// Commercial BYOK API key.
    #[serde(default)]
    pub api_key: Option<String>,
    /// Commercial BYOK base URL / endpoint override.
    #[serde(default)]
    pub base_url: Option<String>,
    /// Azure subscription region.
    #[serde(default)]
    pub region: Option<String>,
    /// OpenAI-compatible model id.
    #[serde(default)]
    pub model: Option<String>,
    /// Optional request timeout in milliseconds (clamped 1s–30s). Default 30s.
    /// Settings probe uses a shorter value for snappy parallel checks.
    #[serde(default)]
    pub timeout_ms: Option<u32>,
}

fn default_source() -> String {
    "auto".to_string()
}

fn default_provider() -> String {
    "tencenttransmart".to_string()
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslateTextResult {
    pub text: String,
    pub provider: String,
}

pub async fn translate_text(args: TranslateTextArgs) -> Result<TranslateTextResult, AppError> {
    let text = args.text.trim();
    if text.is_empty() {
        return Err(AppError::message("Empty text"));
    }
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(AppError::message(format!(
            "Text too long for translation (max {MAX_TEXT_CHARS} characters)"
        )));
    }

    let mut provider = args.provider.trim().to_ascii_lowercase();
    if provider.is_empty() {
        provider = default_provider();
    }

    let source = normalize_lang(&args.source_lang, true);
    let target = normalize_lang(&args.target_lang, false);
    if target.is_empty() {
        return Err(AppError::message("Missing target language"));
    }

    let timeout = resolve_timeout(args.timeout_ms);

    let translated = match provider.as_str() {
        "google" => {
            translate_google(
                "https://translate.google.com",
                text,
                &source,
                &target,
                timeout,
            )
            .await?
        }
        "googleapi" => {
            translate_google(
                "https://translate.googleapis.com",
                text,
                &source,
                &target,
                timeout,
            )
            .await?
        }
        "deeplx" => translate_deeplx(text, &source, &target, timeout).await?,
        "huoshanweb" => translate_huoshan_web(text, &source, &target, timeout).await?,
        "tencenttransmart" => translate_tencent_transmart(text, &source, &target, timeout).await?,
        "deepl" => {
            translate_deepl(
                text,
                &source,
                &target,
                timeout,
                args.api_key.as_deref(),
                args.base_url.as_deref(),
            )
            .await?
        }
        "azure" => {
            translate_azure(
                text,
                &source,
                &target,
                timeout,
                args.api_key.as_deref(),
                args.base_url.as_deref(),
                args.region.as_deref(),
            )
            .await?
        }
        "googlecloud" => {
            translate_google_cloud(
                text,
                &source,
                &target,
                timeout,
                args.api_key.as_deref(),
                args.base_url.as_deref(),
            )
            .await?
        }
        "openaicompatible" => {
            translate_openai_compatible(
                text,
                &source,
                &target,
                timeout,
                args.api_key.as_deref(),
                args.base_url.as_deref(),
                args.model.as_deref(),
            )
            .await?
        }
        other => {
            return Err(AppError::message(format!(
                "Unknown translation provider: {other}"
            )));
        }
    };

    let out = translated.trim().to_string();
    if out.is_empty() {
        return Err(AppError::message("Empty translation result"));
    }
    Ok(TranslateTextResult {
        text: out,
        provider,
    })
}

fn required_api_key<'a>(provider: &str, api_key: Option<&'a str>) -> Result<&'a str, AppError> {
    let Some(key) = api_key.map(str::trim).filter(|s| !s.is_empty()) else {
        return Err(AppError::message(format!(
            "{provider} requires apiKey (Settings → Translate)"
        )));
    };
    Ok(key)
}

fn optional_endpoint(base_url: Option<&str>, default_root: &str, suffix: &str) -> String {
    let base = base_url
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(default_root)
        .trim_end_matches('/');
    if base.ends_with(suffix) {
        base.to_string()
    } else {
        format!("{base}{suffix}")
    }
}

fn normalize_lang(raw: &str, allow_auto: bool) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return if allow_auto {
            "auto".to_string()
        } else {
            String::new()
        };
    }
    let lower = s.to_ascii_lowercase();
    if allow_auto && (lower == "auto" || lower == "detect") {
        return "auto".to_string();
    }
    if lower == "zh" || lower == "zh-cn" || lower == "zh-hans" || lower == "chinese" {
        return "zh-CN".to_string();
    }
    if lower == "en" || lower == "english" {
        return "en".to_string();
    }
    s.to_string()
}

fn lang_base(code: &str) -> &str {
    code.split('-').next().unwrap_or(code)
}

/// Clamp optional timeout_ms to 1s–30s; default 30s.
fn resolve_timeout(timeout_ms: Option<u32>) -> Duration {
    match timeout_ms {
        Some(ms) => Duration::from_millis(u64::from(ms.clamp(1_000, 30_000))),
        None => Duration::from_secs(30),
    }
}

async fn read_body(resp: reqwest::Response) -> Result<(reqwest::StatusCode, String), AppError> {
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| AppError::message(format!("translate read body: {e}")))?;
    Ok((status, body))
}

fn http_err(status: reqwest::StatusCode, body: &str, label: &str) -> AppError {
    let snippet = http::http_err_snippet(body);
    AppError::message(format!("{label} failed (HTTP {status}): {snippet}"))
}

// ─── Google (gtx) ───────────────────────────────────────────────────────────

async fn translate_google(
    host: &str,
    text: &str,
    source: &str,
    target: &str,
    timeout: Duration,
) -> Result<String, AppError> {
    let client = http::client(timeout)?;
    let sl = if source == "auto" { "auto" } else { source };
    let tl = target;
    let url = format!("{}/translate_a/single", host.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .query(&[
            ("client", "gtx"),
            ("sl", sl),
            ("tl", tl),
            ("dt", "t"),
            ("q", text),
        ])
        .header("User-Agent", http::BROWSER_USER_AGENT)
        .send()
        .await
        .map_err(|e| AppError::message(format!("Google translate request failed: {e}")))?;
    let (status, body) = read_body(resp).await?;
    if !status.is_success() {
        return Err(http_err(status, &body, "Google Translate"));
    }
    parse_google_gtx_body(&body)
}

fn parse_google_gtx_body(body: &str) -> Result<String, AppError> {
    let v: Value = serde_json::from_str(body)
        .map_err(|e| AppError::message(format!("Google translate parse: {e}")))?;
    let mut out = String::new();
    let Some(segments) = v.get(0).and_then(|x| x.as_array()) else {
        return Err(AppError::message("Unexpected Google translation response"));
    };
    for seg in segments {
        if let Some(piece) = seg.get(0).and_then(|x| x.as_str()) {
            out.push_str(piece);
        }
    }
    if out.is_empty() {
        return Err(AppError::message("Empty Google translation result"));
    }
    Ok(out)
}

// ─── DeepLX / DeepL browser-extension endpoint ─────────────────────────────

async fn translate_deeplx(
    text: &str,
    source: &str,
    target: &str,
    timeout: Duration,
) -> Result<String, AppError> {
    let client = http::client(timeout)?;
    let id = deeplx_request_id();
    let i_count = text.matches('i').count() as u128 + text.matches('I').count() as u128 + 1;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let timestamp = now_ms - (now_ms % i_count) + i_count;
    let mut body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "LMT_handle_texts",
        "id": id,
        "params": {
            "texts": [
                {
                    "text": text,
                    "requestAlternatives": 3,
                }
            ],
            "splitting": "newlines",
            "lang": {
                "source_lang_user_selected": deeplx_lang(source, true),
                "target_lang": deeplx_lang(target, false),
            },
            "timestamp": timestamp,
            "commonJobParams": {
                "wasSpoken": false,
                "transcribe_as": "",
            },
        },
    })
    .to_string();
    if (id + 5).is_multiple_of(29) || (id + 3).is_multiple_of(13) {
        body = body.replace("\"method\":\"", "\"method\" : \"");
    } else {
        body = body.replace("\"method\":\"", "\"method\": \"");
    }

    let resp = client
        .post("https://www2.deepl.com/jsonrpc?client=chrome-extension,1.28.0&method=LMT_handle_jobs")
        .header("Accept", "*/*")
        .header("Authorization", "None")
        .header("Cache-Control", "no-cache")
        .header("Content-Type", "application/json")
        .header("DNT", "1")
        .header("Origin", "chrome-extension://cofdbpoegempjloogbagkncekinflcnj")
        .header("Pragma", "no-cache")
        .header("Referer", "https://www.deepl.com/")
        .header("Sec-Fetch-Dest", "empty")
        .header("Sec-Fetch-Mode", "cors")
        .header("Sec-Fetch-Site", "none")
        .header("Sec-GPC", "1")
        .header("User-Agent", "DeepLBrowserExtension/1.28.0 Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
        .body(body)
        .send()
        .await
        .map_err(|e| AppError::message(format!("DeepLX request failed: {e}")))?;
    let (status, body) = read_body(resp).await?;
    if !status.is_success() {
        return Err(http_err(status, &body, "DeepLX"));
    }
    let v: Value =
        serde_json::from_str(&body).map_err(|e| AppError::message(format!("DeepLX parse: {e}")))?;
    if let Some(error) = v.get("error") {
        return Err(AppError::message(format!("DeepLX service error: {error}")));
    }
    v.get("result")
        .and_then(|x| x.get("texts"))
        .and_then(|x| x.get(0))
        .and_then(|x| x.get("text"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::message("Unexpected DeepLX translation response"))
}

fn deeplx_request_id() -> u64 {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    8_300_000_001 + (now_ms % 99_999) * 1_000
}

fn deeplx_lang(code: &str, allow_auto: bool) -> String {
    if allow_auto && code == "auto" {
        return "AUTO".to_string();
    }
    let lower = code.to_ascii_lowercase();
    match lower.as_str() {
        "zh" | "zh-cn" | "zh-hans" | "zh-hk" | "zh-mo" | "zh-sg" | "zh-tw" => "ZH".to_string(),
        "pt-br" => "PT-BR".to_string(),
        "pt-pt" => "PT-PT".to_string(),
        _ => lang_base(code).to_ascii_uppercase(),
    }
}

// ─── Volcengine / Huoshan web ───────────────────────────────────────────────

async fn translate_huoshan_web(
    text: &str,
    source: &str,
    target: &str,
    timeout: Duration,
) -> Result<String, AppError> {
    let client = http::client(timeout)?;
    let from = if source == "auto" {
        "auto".to_string()
    } else {
        lang_base(source).to_string()
    };
    let to = lang_base(target).to_string();
    let body = serde_json::json!({
        "source_language": from,
        "target_language": to,
        "text": text,
    });
    let resp = client
        .post("https://translate.volcengine.com/crx/translate/v1")
        .header("Content-Type", "application/json")
        .header("User-Agent", http::BROWSER_USER_AGENT)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::message(format!("Volcengine request failed: {e}")))?;
    let (status, body) = read_body(resp).await?;
    if !status.is_success() {
        return Err(http_err(status, &body, "Volcengine Web"));
    }
    let v: Value = serde_json::from_str(&body)
        .map_err(|e| AppError::message(format!("Volcengine parse: {e}")))?;
    v.get("translation")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::message("Unexpected Volcengine translation response"))
}

// ─── Tencent Transmart web ──────────────────────────────────────────────────

async fn translate_tencent_transmart(
    text: &str,
    source: &str,
    target: &str,
    timeout: Duration,
) -> Result<String, AppError> {
    let client = http::client(timeout)?;
    let from = if source == "auto" {
        "auto".to_string()
    } else {
        lang_base(source).to_string()
    };
    let to = lang_base(target).to_string();
    let body = serde_json::json!({
        "header": {
            "fn": "auto_translation",
            "client_key": "browser-chrome-110.0.0-Mac OS-df4bd4c5-a65d-44b2-a40f-42f34f3535f2-1677486696487"
        },
        "type": "plain",
        "model_category": "normal",
        "source": {
            "lang": from,
            "text_list": [text],
        },
        "target": {
            "lang": to,
        },
    });
    let resp = client
        .post("https://transmart.qq.com/api/imt")
        .header("Content-Type", "application/json")
        .header("User-Agent", http::BROWSER_USER_AGENT)
        .header("Referer", "https://transmart.qq.com/zh-CN/index")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::message(format!("Tencent Transmart request failed: {e}")))?;
    let (status, body) = read_body(resp).await?;
    if !status.is_success() {
        return Err(http_err(status, &body, "Tencent Transmart"));
    }
    let v: Value = serde_json::from_str(&body)
        .map_err(|e| AppError::message(format!("Tencent Transmart parse: {e}")))?;
    if let Some(arr) = v.get("auto_translation").and_then(|x| x.as_array()) {
        let parts: Vec<&str> = arr.iter().filter_map(|x| x.as_str()).collect();
        if !parts.is_empty() {
            return Ok(parts.join("\n").trim().to_string());
        }
    }
    Err(AppError::message(
        "Unexpected Tencent Transmart translation response",
    ))
}

// ─── DeepL ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct DeepLRequest<'a> {
    text: &'a str,
    target_lang: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_lang: Option<&'a str>,
}

async fn translate_deepl(
    text: &str,
    source: &str,
    target: &str,
    timeout: Duration,
    api_key: Option<&str>,
    base_url: Option<&str>,
) -> Result<String, AppError> {
    let key = required_api_key("DeepL", api_key)?;
    let url = optional_endpoint(base_url, "https://api-free.deepl.com", "/v2/translate");
    let client = http::client(timeout)?;
    let target_lang = deepl_target(target);
    let source_lang = if source == "auto" {
        None
    } else {
        Some(deepl_source(source))
    };
    let resp = client
        .post(&url)
        .header("Authorization", format!("DeepL-Auth-Key {key}"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&DeepLRequest {
            text,
            target_lang: &target_lang,
            source_lang: source_lang.as_deref(),
        })
        .send()
        .await
        .map_err(|e| AppError::message(format!("DeepL request failed: {e}")))?;
    let (status, body) = read_body(resp).await?;
    if !status.is_success() {
        return Err(http_err(status, &body, "DeepL"));
    }
    let v: Value =
        serde_json::from_str(&body).map_err(|e| AppError::message(format!("DeepL parse: {e}")))?;
    v.get("translations")
        .and_then(|x| x.as_array())
        .and_then(|x| x.first())
        .and_then(|x| x.get("text"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::message("Unexpected DeepL translation response"))
}

fn deepl_source(code: &str) -> String {
    match code {
        "zh-CN" | "zh-Hans" => "ZH".to_string(),
        "en" => "EN".to_string(),
        _ => lang_base(code).to_ascii_uppercase(),
    }
}

fn deepl_target(code: &str) -> String {
    match code {
        "zh-CN" | "zh-Hans" => "ZH-HANS".to_string(),
        "en" => "EN-US".to_string(),
        _ => lang_base(code).to_ascii_uppercase(),
    }
}

// ─── Azure Translator ──────────────────────────────────────────────────────

#[derive(Serialize)]
struct AzureRequestItem<'a> {
    #[serde(rename = "Text")]
    text: &'a str,
}

async fn translate_azure(
    text: &str,
    source: &str,
    target: &str,
    timeout: Duration,
    api_key: Option<&str>,
    base_url: Option<&str>,
    region: Option<&str>,
) -> Result<String, AppError> {
    let key = required_api_key("Azure Translator", api_key)?;
    let region = region
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            AppError::message("Azure Translator requires region (Settings → Translate)")
        })?;
    let url = optional_endpoint(
        base_url,
        "https://api.cognitive.microsofttranslator.com",
        "/translate",
    );
    let mut req = vec![("api-version", "3.0"), ("to", azure_lang(target))];
    if source != "auto" {
        req.push(("from", azure_lang(source)));
    }
    let client = http::client(timeout)?;
    let resp = client
        .post(&url)
        .query(&req)
        .header("Ocp-Apim-Subscription-Key", key)
        .header("Ocp-Apim-Subscription-Region", region)
        .header("Content-Type", "application/json")
        .json(&[AzureRequestItem { text }])
        .send()
        .await
        .map_err(|e| AppError::message(format!("Azure Translator request failed: {e}")))?;
    let (status, body) = read_body(resp).await?;
    if !status.is_success() {
        return Err(http_err(status, &body, "Azure Translator"));
    }
    let v: Value = serde_json::from_str(&body)
        .map_err(|e| AppError::message(format!("Azure Translator parse: {e}")))?;
    v.get(0)
        .and_then(|x| x.get("translations"))
        .and_then(|x| x.get(0))
        .and_then(|x| x.get("text"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::message("Unexpected Azure Translator response"))
}

fn azure_lang(code: &str) -> &str {
    match code {
        "zh-CN" | "zh-Hans" => "zh-Hans",
        "zh-TW" | "zh-Hant" => "zh-Hant",
        "en" => "en",
        _ => lang_base(code),
    }
}

// ─── Google Cloud Translation ──────────────────────────────────────────────

#[derive(Serialize)]
struct GoogleCloudRequest<'a> {
    q: &'a str,
    target: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<&'a str>,
    format: &'a str,
}

async fn translate_google_cloud(
    text: &str,
    source: &str,
    target: &str,
    timeout: Duration,
    api_key: Option<&str>,
    base_url: Option<&str>,
) -> Result<String, AppError> {
    let key = required_api_key("Google Cloud Translate", api_key)?;
    let url = optional_endpoint(
        base_url,
        "https://translation.googleapis.com",
        "/language/translate/v2",
    );
    let client = http::client(timeout)?;
    let resp = client
        .post(&url)
        .query(&[("key", key)])
        .header("Content-Type", "application/json")
        .json(&GoogleCloudRequest {
            q: text,
            target: google_cloud_target(target),
            source: if source == "auto" {
                None
            } else {
                Some(google_cloud_source(source))
            },
            format: "text",
        })
        .send()
        .await
        .map_err(|e| AppError::message(format!("Google Cloud Translate request failed: {e}")))?;
    let (status, body) = read_body(resp).await?;
    if !status.is_success() {
        return Err(http_err(status, &body, "Google Cloud Translate"));
    }
    let v: Value = serde_json::from_str(&body)
        .map_err(|e| AppError::message(format!("Google Cloud Translate parse: {e}")))?;
    v.get("data")
        .and_then(|x| x.get("translations"))
        .and_then(|x| x.get(0))
        .and_then(|x| x.get("translatedText"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::message("Unexpected Google Cloud Translate response"))
}

fn google_cloud_source(code: &str) -> &str {
    match code {
        "zh-CN" | "zh-Hans" => "zh",
        _ => lang_base(code),
    }
}

fn google_cloud_target(code: &str) -> &str {
    match code {
        "zh-CN" | "zh-Hans" => "zh-CN",
        _ => lang_base(code),
    }
}

// ─── OpenAI-compatible chat translation ────────────────────────────────────

#[derive(Serialize)]
struct OpenAiMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct OpenAiRequest<'a> {
    model: &'a str,
    messages: [OpenAiMessage<'a>; 2],
    temperature: f32,
}

/// Instruction block for the OpenAI-compatible path. Mirrors the Agent prompt in
/// `src/lib/translate/prompt.ts`; keep both in sync.
const OPENAI_TRANSLATE_SYSTEM: &str = "You are a professional academic translator. You render research-paper prose into fluent, idiomatic target-language text and output only the translation.";

/// Literal word-for-word output at 0.0 reads badly for paper prose; a small
/// amount of sampling lets the model restructure sentences.
const OPENAI_TRANSLATE_TEMPERATURE: f32 = 0.2;

fn openai_translate_prompt(text: &str, source: &str, target: &str) -> String {
    // Numbered batch payload ([[1]] …, [[2]] …): ask the model to keep the
    // markers and paragraph count so the caller can split the result back.
    let numbered_hint = if text.contains("[[1]]") {
        "\n- The text contains several paragraphs, each prefixed with a [[n]] marker. Translate every paragraph and keep the same [[n]] markers, in the same order, with the same number of paragraphs. Do not merge paragraphs."
    } else {
        ""
    };
    let from = if source == "auto" {
        "the source language"
    } else {
        source
    };
    format!(
        "Translate the text below from {from} to {target}.\n\nRules:\n\
         - The source is prose from a research paper, often extracted from a PDF text layer. Translate the meaning, not the word order: re-order clauses and split long sentences when that reads better.\n\
         - Keep mathematics, symbols, variable names, units, inline code, URLs, citation markers and figure/table/equation numbers exactly as they appear, including any ⟦n⟧ placeholders.\n\
         - Use the established target-language term for each concept and stay consistent.\n\
         - Do not add, drop, summarize or explain anything. No translator notes, no markdown fences.\n\
         - Output only the translation.{numbered_hint}\n\nText:\n{text}"
    )
}

async fn translate_openai_compatible(
    text: &str,
    source: &str,
    target: &str,
    timeout: Duration,
    api_key: Option<&str>,
    base_url: Option<&str>,
    model: Option<&str>,
) -> Result<String, AppError> {
    let key = required_api_key("OpenAI-compatible", api_key)?;
    let model = model
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            AppError::message("OpenAI-compatible requires model (Settings → Translate)")
        })?;
    let url = optional_endpoint(base_url, "https://api.openai.com/v1", "/chat/completions");
    let prompt = openai_translate_prompt(text, source, target);
    let client = http::client(timeout)?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .json(&OpenAiRequest {
            model,
            messages: [
                OpenAiMessage {
                    role: "system",
                    content: OPENAI_TRANSLATE_SYSTEM,
                },
                OpenAiMessage {
                    role: "user",
                    content: &prompt,
                },
            ],
            temperature: OPENAI_TRANSLATE_TEMPERATURE,
        })
        .send()
        .await
        .map_err(|e| AppError::message(format!("OpenAI-compatible request failed: {e}")))?;
    let (status, body) = read_body(resp).await?;
    if !status.is_success() {
        return Err(http_err(status, &body, "OpenAI-compatible"));
    }
    let v: Value = serde_json::from_str(&body)
        .map_err(|e| AppError::message(format!("OpenAI-compatible parse: {e}")))?;
    v.get("choices")
        .and_then(|x| x.get(0))
        .and_then(|x| x.get("message"))
        .and_then(|x| x.get("content"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::message("Unexpected OpenAI-compatible response"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_google_segments() {
        let body = r#"[[["你好","Hello",null,null,10]],null,"en"]"#;
        let t = parse_google_gtx_body(body).unwrap();
        assert_eq!(t, "你好");
    }

    #[test]
    fn normalize_zh() {
        assert_eq!(normalize_lang("zh-CN", false), "zh-CN");
        assert_eq!(normalize_lang("Chinese", false), "zh-CN");
        assert_eq!(normalize_lang("auto", true), "auto");
    }

    #[test]
    fn openai_prompt_carries_academic_rules_and_marker_hint() {
        let single = openai_translate_prompt("Hello world", "auto", "zh-CN");
        assert!(single.contains("the source language"));
        assert!(single.contains("zh-CN"));
        assert!(single.contains("Translate the meaning, not the word order"));
        assert!(single.contains("Output only the translation."));
        assert!(!single.contains("[[n]] marker"));

        let batch = openai_translate_prompt("[[1]] a\n\n[[2]] b", "en", "zh-CN");
        assert!(batch.contains("from en to zh-CN"));
        assert!(batch.contains("[[n]] marker"));
    }

    #[test]
    fn free_providers_listed() {
        assert!(FREE_PROVIDERS.contains(&"deeplx"));
        assert!(FREE_PROVIDERS.contains(&"huoshanweb"));
        assert!(FREE_PROVIDERS.contains(&"tencenttransmart"));
        assert!(FREE_PROVIDERS.contains(&"googleapi"));
        assert!(FREE_PROVIDERS.contains(&"google"));
        for p in COMMERCIAL_PROVIDERS {
            assert!(
                !FREE_PROVIDERS.contains(p),
                "{p} should stay out of FREE_PROVIDERS"
            );
        }
        for p in ZH_RACE_PROVIDERS {
            assert!(
                FREE_PROVIDERS.contains(p),
                "{p} missing from FREE_PROVIDERS"
            );
        }
        assert_eq!(
            ZH_RACE_PROVIDERS,
            &["tencenttransmart", "huoshanweb", "deeplx"]
        );
        // Keep abstract-MT snappy: enough for slow success (~1.3s bench max);
        // parallel race → wall ≈ one timeout, not 3×.
        assert!((3_000..=8_000).contains(&FREE_MT_ZH_TIMEOUT_MS));
    }

    #[test]
    fn looks_mostly_cjk_detects_chinese() {
        assert!(looks_mostly_cjk("本文提出了一种新的注意力机制。"));
        assert!(!looks_mostly_cjk(
            "We propose a new attention mechanism for sequence transduction."
        ));
        assert!(!looks_mostly_cjk(""));
    }
}

#[cfg(feature = "desktop")]
pub mod commands;
