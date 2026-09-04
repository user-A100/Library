//! `agentero wiki *`

use crate::error::{CliError, ExitCode};
use crate::output::to_value;
use crate::resolve::{resolve_vault, GlobalOpts};
use agentero_lib::core::fs::sanitize_vault_rel;
use agentero_lib::features::wiki::index::WikiIndex;
use agentero_lib::features::wiki::models::LinkResolutionStatus;
use clap::{Subcommand, ValueHint};
use serde_json::{json, Value};
use std::path::Path;

#[derive(Debug, Subcommand)]
pub enum WikiCmd {
    /// Check Vault-local links with the same resolver used by the desktop app.
    Check {
        /// Optional Vault-relative Markdown file or directory.
        #[arg(value_hint = ValueHint::AnyPath)]
        source: Option<String>,
    },
}

pub fn run(cmd: WikiCmd, globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        WikiCmd::Check { source } => check(source.as_deref(), globals),
    }
}

fn check(source: Option<&str>, globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let scope = source.map(validate_scope).transpose()?;
    if let Some(rel) = scope.as_deref() {
        let path = vault.join(rel);
        if !path.exists() {
            return Err(CliError::message(format!("path not found: {rel}")));
        }
        if path.is_file() && !is_markdown(&path) {
            return Err(CliError::usage(
                "wiki check source must be a Markdown file or directory",
            ));
        }
    }

    let vault_str = vault.to_string_lossy();
    let mut index = WikiIndex::default();
    index.rebuild(&vault_str).map_err(|error| {
        CliError::with_details(
            "wiki_index_failed",
            "could not build Wiki index",
            json!({ "cause": error }),
            ExitCode::Business,
        )
    })?;
    let report = index.check_links(&vault_str, scope.as_deref());
    let mut value = to_value(&report)?;

    if !report.issues.is_empty() {
        if let Some(object) = value.as_object_mut() {
            object.insert("lines".into(), json!(issue_lines(&report.issues)));
        }
        return Err(CliError::with_details(
            "wikilink_check_failed",
            "wikilink check found unresolved or invalid links",
            value,
            ExitCode::Business,
        ));
    }

    if let Some(object) = value.as_object_mut() {
        object.insert(
            "lines".into(),
            json!([format!(
                "ok: {} Markdown file(s), {} resolved link(s)",
                report.checked_files, report.counts.resolved
            )]),
        );
    }
    Ok(value)
}

fn validate_scope(raw: &str) -> Result<String, CliError> {
    if Path::new(raw).is_absolute() {
        return Err(CliError::usage("wiki check source must be Vault-relative"));
    }
    sanitize_vault_rel(raw).map_err(CliError::usage)
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "mdx" | "markdown"
            )
        })
}

fn issue_lines(issues: &[agentero_lib::features::wiki::models::WikiCheckIssue]) -> Vec<String> {
    issues
        .iter()
        .map(|issue| {
            format!(
                "{}: {}:{} -> {}",
                status_label(&issue.status),
                issue.source,
                issue.line,
                issue.target_raw
            )
        })
        .collect()
}

fn status_label(status: &LinkResolutionStatus) -> &'static str {
    match status {
        LinkResolutionStatus::Resolved => "resolved",
        LinkResolutionStatus::Missing => "missing",
        LinkResolutionStatus::Ambiguous => "ambiguous",
        LinkResolutionStatus::InvalidFragment => "invalidFragment",
    }
}
