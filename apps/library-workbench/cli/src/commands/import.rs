//! `agentero import *`

use crate::error::CliError;
use crate::output::to_value;
use crate::resolve::{resolve_vault, GlobalOpts};
use agentero_lib::features::import as paper_import;
use agentero_lib::features::import::{LookupImportArgs, PaperImportArgs};
use agentero_lib::features::zotero;
use clap::{Subcommand, ValueHint};
use serde_json::{json, Value};
use std::fs;
use std::io::{self, Read};
use std::path::PathBuf;

#[derive(Debug, Subcommand)]
pub enum ImportCmd {
    /// Magic-wand: exact id / DOI / arXiv / URL → catalog + shell (no paper-reader).
    Id {
        /// Identifier text (arxiv id, DOI, URL, …).
        text: String,
        /// Vault-relative parent (default `papers`).
        #[arg(long = "parent", default_value = "papers", value_hint = ValueHint::DirPath)]
        parent: String,
    },
    /// Import BibTeX/RIS/… via Translator (`-` = stdin).
    Bib {
        /// File path, or `-` for stdin.
        #[arg(value_hint = ValueHint::FilePath)]
        file: PathBuf,
        #[arg(long = "parent", default_value = "papers", value_hint = ValueHint::DirPath)]
        parent: String,
    },
}

pub async fn run(cmd: ImportCmd, globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        ImportCmd::Id { text, parent } => import_id(globals, &text, &parent).await,
        ImportCmd::Bib { file, parent } => import_bib(globals, &file, &parent).await,
    }
}

async fn import_id(globals: &GlobalOpts, text: &str, parent: &str) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let result = paper_import::import_by_identifier(LookupImportArgs {
        vault_path: vault.to_string_lossy().to_string(),
        parent_dir: parent.to_string(),
        text: text.to_string(),
        translator_base_url: globals.translator_base_url(),
        task_id: None,
    })
    .await
    .map_err(|e| CliError::import_failed(e.to_string()))?;

    // Shape aligned with cli.md: path, id, title, created[], skipped[]
    let created = {
        let mut c = vec![result.path.clone()];
        if result.pdf {
            c.push("pdf".into());
        }
        if result.tex {
            c.push("tex".into());
        }
        if result.paper_md {
            c.push("PAPER.md".into());
        }
        c
    };

    let body = json!({
        "path": result.path,
        "id": result.id,
        "title": result.title,
        "paperDir": result.paper_dir,
        "usedTranslator": result.used_translator,
        "translatorBaseUrl": result.translator_base_url,
        "pdf": result.pdf,
        "tex": result.tex,
        "paperMd": result.paper_md,
        "assetMessages": result.asset_messages,
        "created": created,
        "skipped": [],
        "lines": [format!(
            "imported {} → {} ({})",
            result.id, result.path, result.title
        )],
    });
    Ok(body)
}

async fn import_bib(globals: &GlobalOpts, file: &PathBuf, parent: &str) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let content = read_input(file)?;
    let result = zotero::import_catalog(
        PaperImportArgs {
            vault_path: vault.to_string_lossy().to_string(),
            parent_dir: Some(parent.to_string()),
            content,
            translator_base_url: globals.translator_base_url(),
        },
        None,
    )
    .await
    .map_err(|e| CliError::import_failed(e.to_string()))?;

    let mut v = to_value(&result)?;
    if let Some(obj) = v.as_object_mut() {
        obj.insert(
            "lines".into(),
            json!([format!(
                "imported={} skipped={} errors={}",
                result.imported,
                result.skipped,
                result.errors.len()
            )]),
        );
    }
    Ok(v)
}

fn read_input(file: &PathBuf) -> Result<String, CliError> {
    if file.as_os_str() == "-" {
        let mut buf = String::new();
        io::stdin().read_to_string(&mut buf)?;
        return Ok(buf);
    }
    Ok(fs::read_to_string(file)?)
}
