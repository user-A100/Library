//! Text / JSON emission helpers.

use crate::error::CliError;
use crate::resolve::GlobalOpts;
use crate::style::Style;
use clap::ValueEnum;
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum OutputFormat {
    Text,
    Json,
}

#[derive(Debug, Serialize)]
struct JsonOk<T: Serialize> {
    ok: bool,
    data: T,
}

pub fn emit_ok(globals: &GlobalOpts, data: &Value) -> Result<(), CliError> {
    match globals.format {
        OutputFormat::Json => {
            // Unwrap paper list helper shape → data is PaperRecord[].
            let payload = normalize_json_data(data);
            let envelope = JsonOk {
                ok: true,
                data: payload,
            };
            println!("{}", render_json(&envelope, globals.pretty)?);
        }
        OutputFormat::Text => {
            if globals.quiet {
                return Ok(());
            }
            emit_text(data, globals.style);
        }
    }
    Ok(())
}

/// Serialize JSON compact by default; `--pretty` opts into indentation.
fn render_json<T: Serialize>(v: &T, pretty: bool) -> Result<String, CliError> {
    if pretty {
        Ok(serde_json::to_string_pretty(v)?)
    } else {
        Ok(serde_json::to_string(v)?)
    }
}

/// Prefer stable public shapes for `--json` (strip internal text helpers).
fn normalize_json_data(data: &Value) -> Value {
    if let Some(obj) = data.as_object() {
        if obj.get("__paper_list").and_then(|v| v.as_bool()) == Some(true) {
            return obj
                .get("items")
                .cloned()
                .unwrap_or_else(|| Value::Array(vec![]));
        }
        if obj.get("__path_list").and_then(|v| v.as_bool()) == Some(true) {
            return obj
                .get("items")
                .cloned()
                .unwrap_or_else(|| Value::Array(vec![]));
        }
        // Drop text-only helpers from success payloads.
        let mut clean = obj.clone();
        clean.remove("lines");
        clean.remove("__paper_list");
        clean.remove("__path_list");
        return Value::Object(clean);
    }
    data.clone()
}

pub fn emit_err(globals: &GlobalOpts, err: &CliError) -> Result<(), CliError> {
    match globals.format {
        OutputFormat::Json => {
            // Business result only on stdout per cli.md.
            let fail = err.to_json_fail();
            println!("{}", render_json(&fail, globals.pretty)?);
        }
        OutputFormat::Text => {
            let style = globals.style;
            eprintln!(
                "{} {} {}",
                style.error_label("error:"),
                err.message,
                style.dim(&format!("({})", err.code))
            );
            if !err.details.is_null() && err.details != json!({}) {
                // Prefer human lines inside details when present.
                if let Some(lines) = err.details.get("lines").and_then(|v| v.as_array()) {
                    for line in lines {
                        if let Some(s) = line.as_str() {
                            eprintln!("  {s}");
                        }
                    }
                } else {
                    eprintln!("{}", serde_json::to_string_pretty(&err.details)?);
                }
            }
        }
    }
    Ok(())
}

fn emit_text(data: &Value, style: Style) {
    match data {
        Value::String(s) => println!("{s}"),
        Value::Array(items) if items.iter().all(|v| v.is_string()) => {
            for item in items {
                if let Some(s) = item.as_str() {
                    // Bare path lists (no color wrapper).
                    println!("{s}");
                }
            }
        }
        Value::Object(map) if map.contains_key("path") && map.len() == 1 => {
            if let Some(p) = map.get("path").and_then(|v| v.as_str()) {
                println!("{}", style.path(p));
            }
        }
        Value::Object(map) if map.contains_key("lines") => {
            if let Some(lines) = map.get("lines").and_then(|v| v.as_array()) {
                for line in lines {
                    if let Some(s) = line.as_str() {
                        println!("{s}");
                    }
                }
                return;
            }
            println!("{}", serde_json::to_string_pretty(data).unwrap_or_default());
        }
        Value::Null => {}
        other => {
            // Fallback: pretty JSON-ish for complex structs in text mode.
            println!(
                "{}",
                serde_json::to_string_pretty(other).unwrap_or_default()
            );
        }
    }
}

/// Wrap an already-serializable value as JSON Value.
pub fn to_value<T: Serialize>(v: &T) -> Result<Value, CliError> {
    Ok(serde_json::to_value(v)?)
}
