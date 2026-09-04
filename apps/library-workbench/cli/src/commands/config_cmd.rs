//! `agentero config *`

use crate::config;
use crate::error::CliError;
use crate::output::to_value;
use crate::resolve::GlobalOpts;
use clap::Subcommand;
use serde_json::{json, Value};

#[derive(Debug, Subcommand)]
pub enum ConfigCmd {
    /// Show CLI config path and values.
    Show,
    /// Set a CLI config key (`default_vault`, `translator_base_url`).
    Set {
        #[arg(value_parser = ["default_vault", "translator_base_url", "translator"])]
        key: String,
        value: String,
    },
}

pub fn run(cmd: ConfigCmd, _globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        ConfigCmd::Show => {
            let path = config::config_path()?;
            let cfg = config::load()?;
            let mut v = to_value(&cfg)?;
            if let Some(obj) = v.as_object_mut() {
                obj.insert("configPath".into(), json!(path.to_string_lossy()));
                obj.insert(
                    "lines".into(),
                    json!([
                        format!("config: {}", path.display()),
                        format!("default_vault = {:?}", cfg.default_vault),
                        format!("translator_base_url = {:?}", cfg.translator_base_url),
                    ]),
                );
            }
            Ok(v)
        }
        ConfigCmd::Set { key, value } => {
            let cfg = config::set_key(&key, &value)?;
            let path = config::config_path()?;
            Ok(json!({
                "configPath": path.to_string_lossy(),
                "key": key,
                "value": value,
                "config": cfg,
                "lines": [format!("set {key}")],
            }))
        }
    }
}
