//! `agentero export *`

use crate::error::CliError;
use crate::output::to_value;
use crate::resolve::{resolve_vault, GlobalOpts};
use agentero_lib::features::zotero::{self, PaperExportArgs};
use clap::{Subcommand, ValueHint};
use serde_json::{json, Value};
use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;

#[derive(Debug, Subcommand)]
pub enum ExportCmd {
    /// Export catalog via Translator (default BibTeX).
    Bib {
        /// Translator format (bibtex, biblatex, ris, …).
        #[arg(long = "format", default_value = "bibtex")]
        format: String,
        /// Output file, or `-` for stdout (default `-`).
        /// Uses `-o` / `--out` so it does not clash with global `--output` (format).
        #[arg(
            short = 'o',
            long = "out",
            default_value = "-",
            value_name = "FILE",
            value_hint = ValueHint::FilePath
        )]
        out: PathBuf,
    },
}

pub async fn run(cmd: ExportCmd, globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        ExportCmd::Bib { format, out } => export_bib(globals, &format, &out).await,
    }
}

async fn export_bib(globals: &GlobalOpts, format: &str, out: &PathBuf) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let result = zotero::export_catalog(PaperExportArgs {
        vault_path: vault.to_string_lossy().to_string(),
        format: Some(format.to_string()),
        translator_base_url: globals.translator_base_url(),
    })
    .await
    .map_err(|e| CliError::export_failed(e.to_string()))?;

    let written_to = if out.as_os_str() == "-" {
        // When writing content to stdout, JSON mode would collide — write content to stdout
        // only in text mode without --json; in JSON mode put content in data.
        if matches!(globals.format, crate::output::OutputFormat::Json) {
            // content stays in JSON data
            "-".to_string()
        } else {
            io::stdout().write_all(result.content.as_bytes())?;
            if !result.content.ends_with('\n') {
                let _ = io::stdout().write_all(b"\n");
            }
            "-".to_string()
        }
    } else {
        if let Some(parent) = out.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)?;
            }
        }
        fs::write(out, &result.content)?;
        out.display().to_string()
    };

    let mut v = to_value(&result)?;
    if let Some(obj) = v.as_object_mut() {
        // In JSON mode keep content; when written to file still include content for scripts.
        obj.insert("writtenTo".into(), json!(written_to));
        obj.insert(
            "lines".into(),
            json!([format!(
                "exported {} entries as {} → {}",
                result.count, result.format, written_to
            )]),
        );
        // Avoid dumping huge bib twice in text mode (already wrote content to stdout).
        if matches!(globals.format, crate::output::OutputFormat::Text) && out.as_os_str() == "-" {
            obj.insert("content".into(), json!("(written to stdout)"));
        }
    }
    Ok(v)
}
