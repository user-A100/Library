//! `agentero trash *`

use crate::error::CliError;
use crate::resolve::{resolve_vault, GlobalOpts};
use agentero_lib::features::trash;
use clap::Subcommand;
use serde_json::{json, Value};

#[derive(Debug, Subcommand)]
pub enum TrashCmd {
    /// List items currently in the recycle bin.
    List,
    /// Restore one recycle-bin item.
    Restore {
        /// Batch id from `trash list`.
        batch_id: String,
        /// Stored name from `trash list`.
        stored: String,
    },
    /// Permanently delete one item, or the entire recycle bin when no item is given.
    Purge {
        /// Batch id from `trash list`.
        batch_id: Option<String>,
        /// Stored name from `trash list`.
        stored: Option<String>,
    },
}

pub fn run(cmd: TrashCmd, globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        TrashCmd::List => list(globals),
        TrashCmd::Restore { batch_id, stored } => restore(globals, &batch_id, &stored),
        TrashCmd::Purge { batch_id, stored } => {
            purge(globals, batch_id.as_deref(), stored.as_deref())
        }
    }
}

fn list(globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let items = trash::list_trash(&vault)?;
    let lines = if items.is_empty() {
        vec![globals.style.dim("(empty)")]
    } else {
        items
            .iter()
            .map(|item| {
                format!(
                    "{}  {}  {}",
                    globals.style.path(&item.rel),
                    globals.style.dim(&item.id),
                    globals.style.dim(&item.deleted_at)
                )
            })
            .collect()
    };
    Ok(json!({ "items": items, "lines": lines }))
}

fn restore(globals: &GlobalOpts, batch_id: &str, stored: &str) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let rel = trash::restore_item(&vault, batch_id, stored)?;
    Ok(json!({
        "batchId": batch_id,
        "stored": stored,
        "rel": rel,
        "lines": [format!("restored {}", globals.style.path(&rel))],
    }))
}

fn purge(
    globals: &GlobalOpts,
    batch_id: Option<&str>,
    stored: Option<&str>,
) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    match (batch_id, stored) {
        (Some(batch_id), Some(stored)) => {
            let msg = format!("Permanently delete recycle-bin item '{batch_id}::{stored}'?");
            if !crate::prompt::confirm(globals, &msg, false)? {
                return Err(CliError::needs_confirmation("purge cancelled"));
            }
            trash::purge_item(&vault, batch_id, stored)?;
            Ok(json!({
                "batchId": batch_id,
                "stored": stored,
                "lines": [format!("purged {batch_id}::{stored}")],
            }))
        }
        (None, None) => {
            if !crate::prompt::confirm(globals, "Permanently empty the recycle bin?", false)? {
                return Err(CliError::needs_confirmation("purge cancelled"));
            }
            trash::purge_all(&vault)?;
            Ok(json!({ "all": true, "lines": ["purged recycle bin"] }))
        }
        _ => Err(CliError::usage(
            "trash purge requires both batch_id and stored, or neither",
        )),
    }
}
