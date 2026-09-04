//! `agentero layout *` — sidebar-aligned layout index (figures / tables / …).

use crate::error::{CliError, ExitCode};
use crate::output::to_value;
use crate::resolve::{paper_dir, resolve_paper, resolve_vault, GlobalOpts};
use crate::style::{format_table, truncate_chars};
use clap::{Subcommand, ValueHint};
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

const LAYOUT_INDEX_FILE: &str = "layout-index.json";
const LAYOUT_RAW_FILE: &str = "layout.json";

#[derive(Debug, Subcommand)]
pub enum LayoutCmd {
    /// List sidebar-aligned regions (figure / table / algorithm / formula).
    List {
        /// Vault-relative paper path or id.
        #[arg(value_hint = ValueHint::DirPath)]
        r#ref: String,
        /// Filter: figure (image+chart), image, chart, table, algorithm, formula.
        /// Repeatable; OR semantics.
        #[arg(
            long = "kind",
            value_name = "KIND",
            value_parser = ["figure", "image", "chart", "table", "algorithm", "formula"]
        )]
        kinds: Vec<String>,
        /// Minimum score (0–1). Default: index minScore or 0.3.
        #[arg(long = "min-score", value_name = "N")]
        min_score: Option<f64>,
    },
    /// Get one region by id (CLI id from `layout list`).
    Get {
        /// Vault-relative paper path or id.
        #[arg(value_hint = ValueHint::DirPath)]
        r#ref: String,
        /// Region id (e.g. figure-3).
        id: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutIndexItem {
    pub id: String,
    pub stable_key: String,
    pub kind: String,
    pub section: String,
    pub page: u32,
    pub page_index: u32,
    pub bbox: Bbox,
    pub score: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub layout_region_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Bbox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LayoutListData {
    paper_path: String,
    index_path: String,
    generated_at: String,
    min_score: f64,
    counts: LayoutCounts,
    items: Vec<LayoutIndexItem>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct LayoutCounts {
    total: usize,
    figure: usize,
    table: usize,
    algorithm: usize,
    formula: usize,
}

pub fn run(cmd: LayoutCmd, globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        LayoutCmd::List {
            r#ref,
            kinds,
            min_score,
        } => list(globals, &r#ref, &kinds, min_score),
        LayoutCmd::Get { r#ref, id } => get(globals, &r#ref, &id),
    }
}

fn list(
    globals: &GlobalOpts,
    ref_: &str,
    kinds: &[String],
    min_score: Option<f64>,
) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let paper = resolve_paper(&vault, ref_, globals)?;
    let (index_path, generated_at, file_min, mut items) = load_index_items(&vault, &paper.path)?;

    let threshold = min_score.unwrap_or(file_min);
    items.retain(|i| i.score + f64::EPSILON >= threshold);

    let filters = normalize_kind_filters(kinds)?;
    if !filters.is_empty() {
        items.retain(|i| item_matches_filters(i, &filters));
    }

    let counts = count_items(&items);
    let style = globals.style;
    let table_rows: Vec<Vec<String>> = items
        .iter()
        .map(|i| {
            vec![
                i.id.clone(),
                i.section.clone(),
                i.kind.clone(),
                i.page.to_string(),
                format!("{:.0}%", i.score * 100.0),
                truncate_chars(i.title.as_deref().unwrap_or(""), 48),
            ]
        })
        .collect();
    let lines = if items.is_empty() {
        vec![style.dim("(no layout regions)")]
    } else {
        format_table(
            style,
            &["ID", "SECTION", "KIND", "PAGE", "SCORE", "TITLE"],
            &table_rows,
        )
    };

    let mut data = to_value(&LayoutListData {
        paper_path: paper.path.clone(),
        index_path,
        generated_at,
        min_score: threshold,
        counts,
        items,
    })?;
    if let Some(obj) = data.as_object_mut() {
        obj.insert("lines".into(), json!(lines));
    }
    Ok(data)
}

fn get(globals: &GlobalOpts, ref_: &str, id: &str) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let paper = resolve_paper(&vault, ref_, globals)?;
    let (index_path, generated_at, _min, items) = load_index_items(&vault, &paper.path)?;
    let id = id.trim();
    let item = items.into_iter().find(|i| i.id == id).ok_or_else(|| {
        CliError::with_details(
            "layout_region_not_found",
            format!("no layout region id '{id}'"),
            json!({ "paperPath": paper.path, "id": id, "indexPath": index_path }),
            ExitCode::Business,
        )
    })?;

    let lines = {
        let mut lines = vec![format!(
            "{}  {}  page {}  {}  score {:.0}%",
            item.id,
            item.section,
            item.page,
            item.kind,
            item.score * 100.0
        )];
        if let Some(t) = &item.title {
            lines.push(format!("title: {t}"));
        }
        lines.push(format!(
            "bbox: x={:.4} y={:.4} w={:.4} h={:.4}",
            item.bbox.x, item.bbox.y, item.bbox.w, item.bbox.h
        ));
        lines
    };
    Ok(json!({
        "paperPath": paper.path,
        "indexPath": index_path,
        "generatedAt": generated_at,
        "item": item,
        "lines": lines,
    }))
}

fn load_index_items(
    vault: &Path,
    paper_path: &str,
) -> Result<(String, String, f64, Vec<LayoutIndexItem>), CliError> {
    let dir = paper_dir(vault, paper_path);
    let index_abs = dir.join("source").join(LAYOUT_INDEX_FILE);
    let rel_index = format!("{paper_path}/source/{LAYOUT_INDEX_FILE}");

    if !index_abs.is_file() {
        let raw = dir.join("source").join(LAYOUT_RAW_FILE);
        let hint = if raw.is_file() {
            "source/layout.json exists but layout-index.json is missing — open the paper in Agentero (or re-run layout analysis) to write the sidebar index"
        } else {
            "no source/layout-index.json — open the paper in Agentero and run layout analysis (Figures) first"
        };
        return Err(CliError::with_details(
            "layout_index_missing",
            hint,
            json!({
                "paperPath": paper_path,
                "indexPath": rel_index,
                "hasLayoutJson": raw.is_file(),
            }),
            ExitCode::Business,
        ));
    }

    let text = fs::read_to_string(&index_abs)
        .map_err(|e| CliError::message(format!("failed to read layout index: {e}")))?;
    let raw: Value = serde_json::from_str(&text).map_err(|e| {
        CliError::with_details(
            "layout_index_invalid",
            format!("invalid layout-index.json: {e}"),
            json!({ "indexPath": rel_index }),
            ExitCode::Business,
        )
    })?;

    parse_index_file(&raw, &rel_index)
}

fn parse_index_file(
    raw: &Value,
    rel_index: &str,
) -> Result<(String, String, f64, Vec<LayoutIndexItem>), CliError> {
    let schema = raw.get("schemaVersion").and_then(|v| v.as_u64());
    if schema != Some(1) {
        return Err(CliError::with_details(
            "layout_index_invalid",
            format!(
                "unsupported layout-index schemaVersion (want 1, got {:?})",
                schema
            ),
            json!({ "indexPath": rel_index }),
            ExitCode::Business,
        ));
    }
    let source = raw.get("source").ok_or_else(|| {
        CliError::with_details(
            "layout_index_invalid",
            "layout-index.json missing source",
            json!({ "indexPath": rel_index }),
            ExitCode::Business,
        )
    })?;
    if source.get("mode").and_then(|v| v.as_str()) != Some("sidebar") {
        return Err(CliError::with_details(
            "layout_index_invalid",
            "layout-index.json source.mode must be \"sidebar\"",
            json!({ "indexPath": rel_index }),
            ExitCode::Business,
        ));
    }
    let generated_at = source
        .get("generatedAt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let min_score = source
        .get("minScore")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.3);

    let arr = raw.get("items").and_then(|v| v.as_array()).ok_or_else(|| {
        CliError::with_details(
            "layout_index_invalid",
            "layout-index.json missing items array",
            json!({ "indexPath": rel_index }),
            ExitCode::Business,
        )
    })?;

    let mut items = Vec::with_capacity(arr.len());
    for (i, entry) in arr.iter().enumerate() {
        match parse_item(entry) {
            Some(item) => items.push(item),
            None => {
                return Err(CliError::with_details(
                    "layout_index_invalid",
                    format!("invalid layout index item at index {i}"),
                    json!({ "indexPath": rel_index, "index": i }),
                    ExitCode::Business,
                ));
            }
        }
    }

    Ok((rel_index.to_string(), generated_at, min_score, items))
}

fn parse_item(v: &Value) -> Option<LayoutIndexItem> {
    let id = v.get("id")?.as_str()?.to_string();
    let stable_key = v
        .get("stableKey")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let kind = v.get("kind")?.as_str()?.to_string();
    let section = v.get("section")?.as_str()?.to_string();
    let page = v.get("page")?.as_u64()? as u32;
    let page_index = v.get("pageIndex")?.as_u64()? as u32;
    let score = v.get("score")?.as_f64()?;
    let layout_region_id = v
        .get("layoutRegionId")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let bbox_v = v.get("bbox")?;
    let bbox = Bbox {
        x: bbox_v.get("x")?.as_f64()?,
        y: bbox_v.get("y")?.as_f64()?,
        w: bbox_v.get("w")?.as_f64()?,
        h: bbox_v.get("h")?.as_f64()?,
    };
    let title = v
        .get("title")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());
    if id.is_empty() || kind.is_empty() || section.is_empty() {
        return None;
    }
    Some(LayoutIndexItem {
        id,
        stable_key,
        kind,
        section,
        page: page.max(1),
        page_index,
        bbox,
        score,
        title,
        layout_region_id,
    })
}

fn normalize_kind_filters(kinds: &[String]) -> Result<Vec<String>, CliError> {
    let mut out = Vec::new();
    for k in kinds {
        let t = k.trim().to_ascii_lowercase();
        if t.is_empty() {
            continue;
        }
        match t.as_str() {
            "figure" | "image" | "chart" | "table" | "algorithm" | "formula" => {
                out.push(t);
            }
            other => {
                return Err(CliError::usage(format!(
                    "unknown --kind '{other}' (use figure|image|chart|table|algorithm|formula)"
                )));
            }
        }
    }
    Ok(out)
}

fn item_matches_filters(item: &LayoutIndexItem, filters: &[String]) -> bool {
    filters.iter().any(|f| match f.as_str() {
        "figure" => item.section == "figure",
        "image" | "chart" | "table" | "algorithm" | "formula" => item.kind == *f,
        _ => false,
    })
}

fn count_items(items: &[LayoutIndexItem]) -> LayoutCounts {
    let mut c = LayoutCounts {
        total: items.len(),
        ..Default::default()
    };
    for i in items {
        match i.section.as_str() {
            "figure" => c.figure += 1,
            "table" => c.table += 1,
            "algorithm" => c.algorithm += 1,
            "formula" => c.formula += 1,
            _ => {}
        }
    }
    c
}

/// Shared by `mark add --region`.
pub fn load_region(
    vault: &Path,
    paper_path: &str,
    region_id: &str,
) -> Result<LayoutIndexItem, CliError> {
    let (_path, _gen, _min, items) = load_index_items(vault, paper_path)?;
    items
        .into_iter()
        .find(|i| i.id == region_id)
        .ok_or_else(|| {
            CliError::with_details(
                "layout_region_not_found",
                format!("no layout region id '{region_id}'"),
                json!({ "paperPath": paper_path, "id": region_id }),
                ExitCode::Business,
            )
        })
}
