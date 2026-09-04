//! `agentero vault *`

use crate::config;
use crate::error::CliError;
use crate::output::to_value;
use crate::resolve::{looks_like_vault, resolve_vault, GlobalOpts};
use agentero_lib::features::catalog::{self, papers};
use agentero_lib::features::vault as vault_svc;
use clap::{Subcommand, ValueHint};
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Subcommand)]
pub enum VaultCmd {
    /// Scaffold a new vault (catalog + dirs + AGENTS.md). Does not overwrite existing files.
    Create {
        /// Directory to create / scaffold.
        #[arg(value_hint = ValueHint::DirPath)]
        path: PathBuf,
        /// Also print absolute path suitable for shell cd (text: path only).
        #[arg(long = "open")]
        open: bool,
    },
    /// Print the resolved vault absolute path.
    Which,
    /// Read-only discovery summary.
    Info,
    /// Structural / schema health check (non-zero if issues).
    Check,
    /// Persist CLI default_vault.
    Use {
        #[arg(value_hint = ValueHint::DirPath)]
        path: PathBuf,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultInfoData {
    path: String,
    valid: bool,
    schema_version: Option<i32>,
    counts: VaultCounts,
    has_agents_md: bool,
    layers: VaultLayers,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultCounts {
    papers: usize,
    unread: usize,
    notes_files: usize,
}

#[derive(Debug, Serialize)]
struct VaultLayers {
    #[serde(rename = "L0")]
    l0: String,
    #[serde(rename = "L1")]
    l1: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckIssue {
    code: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckData {
    path: String,
    ok: bool,
    issues: Vec<CheckIssue>,
}

pub async fn run(cmd: VaultCmd, globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        VaultCmd::Create { path, open } => create(&path, open, globals),
        VaultCmd::Which => which(globals),
        VaultCmd::Info => info(globals),
        VaultCmd::Check => check(globals),
        VaultCmd::Use { path } => use_vault(&path, globals),
    }
}

fn detect_cli_locale() -> String {
    let env = std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LANG"))
        .unwrap_or_default()
        .to_lowercase();
    if env.starts_with("zh") {
        "zh-CN".into()
    } else {
        "en".into()
    }
}

fn create(path: &Path, open: bool, globals: &GlobalOpts) -> Result<Value, CliError> {
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };
    let locale = detect_cli_locale();
    let result = vault_svc::create_vault(&abs, &locale)?;
    let mut v = to_value(&result)?;
    if open {
        if let Some(obj) = v.as_object_mut() {
            obj.insert("openPath".into(), json!(result.open_path));
        }
    }
    let style = globals.style;
    if let Some(obj) = v.as_object_mut() {
        let mut lines = vec![format!(
            "{} {}",
            style.ok("created"),
            style.path(&result.path)
        )];
        if !result.created.is_empty() {
            lines.push(format!(
                "{} {}",
                style.key("new"),
                result.created.join(", ")
            ));
        } else {
            lines.push(style.dim("Already scaffolded (nothing new)"));
        }
        obj.insert("lines".into(), json!(lines));
    }
    Ok(v)
}

fn which(globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let path = vault.to_string_lossy().to_string();
    Ok(json!({ "path": path }))
}

fn info(globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let path = vault.to_string_lossy().to_string();
    let valid = looks_like_vault(&vault);

    let (schema_version, papers, unread) = match catalog::ensure_catalog(&vault) {
        Ok(conn) => {
            let ver = catalog::schema_version(&conn).ok();
            drop(conn);
            let rows = papers::list_all(&vault).unwrap_or_default();
            let unread = rows.iter().filter(|r| !r.is_read).count();
            (ver, rows.len(), unread)
        }
        Err(_) => (None, 0, 0),
    };

    let notes_files = count_md_files(&vault.join("notes"));
    let has_agents_md = vault.join("AGENTS.md").is_file();

    let data = VaultInfoData {
        path,
        valid,
        schema_version,
        counts: VaultCounts {
            papers,
            unread,
            notes_files,
        },
        has_agents_md,
        layers: VaultLayers {
            l0: "AGENTS.md".into(),
            l1: "catalog.sqlite (use: paper list)".into(),
        },
    };
    let style = globals.style;
    let valid_s = if data.valid {
        style.ok("yes")
    } else {
        style.bright_red("no")
    };
    let schema = data
        .schema_version
        .map(|v| v.to_string())
        .unwrap_or_else(|| "?".into());
    let mut v = to_value(&data)?;
    if let Some(obj) = v.as_object_mut() {
        obj.insert(
            "lines".into(),
            json!([
                format!("{} {}", style.key("vault"), style.path(&data.path)),
                format!(
                    "{} {}  {} {}  {} {}  {} {}  {} {}",
                    style.key("valid"),
                    valid_s,
                    style.key("schema"),
                    style.dim(&schema),
                    style.key("papers"),
                    style.bold(&data.counts.papers.to_string()),
                    style.key("unread"),
                    if data.counts.unread > 0 {
                        style.bright_yellow(&data.counts.unread.to_string())
                    } else {
                        style.dim("0")
                    },
                    style.key("notes"),
                    style.dim(&data.counts.notes_files.to_string()),
                ),
            ]),
        );
    }
    Ok(v)
}

fn check(globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let path = vault.to_string_lossy().to_string();
    let mut issues = Vec::new();

    for dir in ["papers", "notes", ".agentero"] {
        if !vault.join(dir).is_dir() {
            issues.push(CheckIssue {
                code: "missing_dir".into(),
                message: format!("missing directory: {dir}/"),
            });
        }
    }

    let db = catalog::catalog_db_path(&vault);
    if !db.is_file() {
        issues.push(CheckIssue {
            code: "catalog_missing".into(),
            message: "catalog.sqlite not found (run vault create or open in app)".into(),
        });
    } else {
        match catalog::ensure_catalog(&vault) {
            Ok(conn) => match catalog::schema_version(&conn) {
                Ok(v) if v < catalog::SCHEMA_VERSION => {
                    issues.push(CheckIssue {
                        code: "schema_outdated".into(),
                        message: format!(
                            "schema version {v} < expected {}",
                            catalog::SCHEMA_VERSION
                        ),
                    });
                }
                Ok(_) => {}
                Err(e) => issues.push(CheckIssue {
                    code: "schema_error".into(),
                    message: e.to_string(),
                }),
            },
            Err(e) => issues.push(CheckIssue {
                code: "catalog_open_failed".into(),
                message: e.to_string(),
            }),
        }
    }

    let data = CheckData {
        path,
        ok: issues.is_empty(),
        issues,
    };

    let style = globals.style;
    if !data.ok {
        let mut v = to_value(&data)?;
        if let Some(obj) = v.as_object_mut() {
            let lines: Vec<String> = data
                .issues
                .iter()
                .map(|i| {
                    format!(
                        "{} {}",
                        style.bright_red(&format!("{}:", i.code)),
                        i.message
                    )
                })
                .collect();
            obj.insert("lines".into(), json!(lines));
        }
        // cli.md: non-zero when issues.
        return Err(CliError::with_details(
            "vault_invalid",
            "vault check found issues",
            v,
            crate::error::ExitCode::Business,
        ));
    }

    let mut v = to_value(&data)?;
    if let Some(obj) = v.as_object_mut() {
        obj.insert("lines".into(), json!([style.ok("ok")]));
    }
    Ok(v)
}

fn use_vault(path: &Path, globals: &GlobalOpts) -> Result<Value, CliError> {
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };
    if !abs.is_dir() {
        return Err(CliError::vault_not_found(format!(
            "not a directory: {}",
            abs.display()
        )));
    }
    let abs = abs.canonicalize().unwrap_or(abs);
    let abs_str = abs.to_string_lossy().to_string();
    config::set_key("default_vault", &abs_str)?;
    let style = globals.style;
    Ok(json!({
        "defaultVault": abs_str,
        "lines": [format!(
            "{} {}",
            style.key("default_vault"),
            style.path(&abs_str)
        )]
    }))
}

fn count_md_files(root: &Path) -> usize {
    if !root.is_dir() {
        return 0;
    }
    let mut n = 0usize;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("md"))
            {
                n += 1;
            }
        }
    }
    n
}
