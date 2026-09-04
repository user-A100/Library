//! CLI-only config: `~/.config/agentero/config.toml` (isolated from GUI).

use crate::error::CliError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CliConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_vault: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub translator_base_url: Option<String>,
}

pub fn config_path() -> Result<PathBuf, CliError> {
    // Prefer XDG-style `~/.config/agentero` (docs/development/cli.md) even on macOS,
    // so agents/scripts share one predictable path across platforms.
    let base = dirs::home_dir()
        .map(|h| h.join(".config"))
        .or_else(dirs::config_dir)
        .ok_or_else(|| CliError::message("cannot resolve user config directory (~/.config)"))?;
    Ok(base.join("agentero").join("config.toml"))
}

pub fn load() -> Result<CliConfig, CliError> {
    let path = config_path()?;
    if !path.is_file() {
        return Ok(CliConfig::default());
    }
    let text = fs::read_to_string(&path)?;
    let cfg: CliConfig = toml::from_str(&text)
        .map_err(|e| CliError::message(format!("parse config {}: {e}", path.display())))?;
    Ok(cfg)
}

pub fn save(cfg: &CliConfig) -> Result<PathBuf, CliError> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let text = toml::to_string_pretty(cfg)
        .map_err(|e| CliError::message(format!("serialize config: {e}")))?;
    fs::write(&path, text)?;
    Ok(path)
}

pub fn set_key(key: &str, value: &str) -> Result<CliConfig, CliError> {
    let mut cfg = load()?;
    match key {
        "default_vault" => {
            let p = Path::new(value);
            let abs = if p.is_absolute() {
                p.to_path_buf()
            } else {
                std::env::current_dir()?.join(p)
            };
            cfg.default_vault = Some(abs.to_string_lossy().to_string());
        }
        "translator_base_url" | "translator" => {
            cfg.translator_base_url = Some(value.trim().to_string());
        }
        other => {
            return Err(CliError::usage(format!(
                "unknown config key '{other}' (allowed: default_vault, translator_base_url)"
            )));
        }
    }
    save(&cfg)?;
    Ok(cfg)
}
