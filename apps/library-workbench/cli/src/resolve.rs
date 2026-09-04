//! Vault resolution and paper ref resolution.

use crate::config;
use crate::error::CliError;
use crate::output::OutputFormat;
use crate::style::Style;
use agentero_lib::features::catalog::papers::{self, PaperRecord};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct GlobalOpts {
    pub vault_flag: Option<PathBuf>,
    pub yes: bool,
    pub quiet: bool,
    pub translator_url: Option<String>,
    pub format: OutputFormat,
    /// Pretty-print JSON (default compact to save agent tokens).
    pub pretty: bool,
    /// Text-mode paint switch (always false for JSON).
    pub style: Style,
}

impl GlobalOpts {
    pub fn translator_base_url(&self) -> Option<String> {
        if let Some(u) = &self.translator_url {
            let t = u.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
        if let Ok(env) = std::env::var("AGENTERO_TRANSLATOR_URL") {
            let t = env.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
        config::load()
            .ok()
            .and_then(|c| c.translator_base_url)
            .filter(|s| !s.trim().is_empty())
    }
}

/// Resolve vault root per docs/development/cli.md §5.1.
pub fn resolve_vault(globals: &GlobalOpts) -> Result<PathBuf, CliError> {
    // 1. --vault
    if let Some(p) = &globals.vault_flag {
        return canonicalize_existing(p).or_else(|_| {
            // Allow non-existing for create; for other cmds require dir.
            let abs = absolutize(p)?;
            if abs.is_dir() {
                Ok(abs)
            } else {
                Err(CliError::vault_not_found(format!(
                    "vault path is not a directory: {}",
                    abs.display()
                )))
            }
        });
    }

    // 2. AGENTERO_VAULT
    if let Ok(env) = std::env::var("AGENTERO_VAULT") {
        let t = env.trim();
        if !t.is_empty() {
            let p = PathBuf::from(t);
            return canonicalize_existing(&p).map_err(|_| {
                CliError::vault_not_found(format!("AGENTERO_VAULT is not a directory: {t}"))
            });
        }
    }

    // 3. Walk up from cwd
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(found) = walk_up_vault(&cwd) {
            return Ok(found);
        }
    }

    // 4. CLI config default_vault
    if let Ok(cfg) = config::load() {
        if let Some(p) = cfg.default_vault {
            let path = PathBuf::from(p.trim());
            if !path.as_os_str().is_empty() {
                return canonicalize_existing(&path).map_err(|_| {
                    CliError::vault_not_found(format!(
                        "config default_vault is not a directory: {}",
                        path.display()
                    ))
                });
            }
        }
    }

    Err(CliError::vault_not_found(
        "could not resolve vault (pass --vault, set AGENTERO_VAULT, cd into a vault, or config set default_vault)",
    ))
}

fn absolutize(p: &Path) -> Result<PathBuf, CliError> {
    if p.is_absolute() {
        Ok(p.to_path_buf())
    } else {
        Ok(std::env::current_dir()?.join(p))
    }
}

fn canonicalize_existing(p: &Path) -> Result<PathBuf, CliError> {
    let abs = absolutize(p)?;
    if !abs.is_dir() {
        return Err(CliError::vault_not_found(format!(
            "not a directory: {}",
            abs.display()
        )));
    }
    Ok(abs.canonicalize().unwrap_or(abs))
}

/// True if path looks like an Agentero vault root.
pub fn looks_like_vault(root: &Path) -> bool {
    let catalog = root.join(".agentero").join("catalog.sqlite");
    if catalog.is_file() {
        return true;
    }
    root.join("papers").is_dir() && root.join("notes").is_dir() && root.join(".agentero").is_dir()
}

fn walk_up_vault(start: &Path) -> Option<PathBuf> {
    let mut cur = start.to_path_buf();
    loop {
        if looks_like_vault(&cur) {
            return Some(cur.canonicalize().unwrap_or(cur));
        }
        if !cur.pop() {
            return None;
        }
    }
}

/// Whether `ref` should be treated as a vault-relative path.
pub fn looks_like_path(ref_: &str) -> bool {
    let t = ref_.trim();
    t.contains('/') || t.contains('\\') || t.starts_with("papers")
}

/// Resolve paper by path or id (with ambiguity detection).
///
/// When multiple rows share an id and stdin is a TTY (not `--json`), prompts with `inquire::Select`.
pub fn resolve_paper(
    vault: &Path,
    ref_: &str,
    globals: &GlobalOpts,
) -> Result<PaperRecord, CliError> {
    let ref_ = ref_.trim();
    if ref_.is_empty() {
        return Err(CliError::usage("paper ref is required"));
    }

    if looks_like_path(ref_) {
        let path = ref_.replace('\\', "/").trim_matches('/').to_string();
        return papers::get_by_path(vault, &path)?.ok_or_else(|| CliError::paper_not_found(ref_));
    }

    let matches = papers::list_by_id(vault, ref_)?;
    match matches.len() {
        0 => Err(CliError::paper_not_found(ref_)),
        1 => Ok(matches.into_iter().next().expect("len 1")),
        _ => {
            let candidates: Vec<String> = matches.iter().map(|p| p.path.clone()).collect();
            if let Some(path) = crate::prompt::select_one(
                globals,
                &format!("Multiple papers match id '{ref_}'"),
                candidates.clone(),
            )? {
                return papers::get_by_path(vault, &path)?
                    .ok_or_else(|| CliError::paper_not_found(&path));
            }
            Err(CliError::paper_ambiguous(ref_, &candidates))
        }
    }
}

pub fn paper_dir(vault: &Path, path_rel: &str) -> PathBuf {
    let mut p = vault.to_path_buf();
    for part in path_rel.split('/').filter(|s| !s.is_empty()) {
        p.push(part);
    }
    p
}
