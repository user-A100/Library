//! `agentero feed *` — XDG `feeds.sqlite` subscriptions (same store as Plaza).

use crate::error::CliError;
use crate::resolve::GlobalOpts;
use agentero_lib::features::feeds::{add_and_fetch, list, remove_by_ref};
use clap::{Subcommand, ValueHint};
use serde_json::{json, Value};

#[derive(Debug, Subcommand)]
pub enum FeedCmd {
    /// Subscribe to an RSS / Atom / JSON Feed URL.
    Add {
        #[arg(value_hint = ValueHint::Url)]
        url: String,
        #[arg(long)]
        title: Option<String>,
    },
    /// List subscriptions.
    List,
    /// Remove a subscription by id or URL.
    Remove {
        /// Subscription id or feed URL.
        target: String,
    },
}

pub async fn run(cmd: FeedCmd, globals: &GlobalOpts) -> Result<Value, CliError> {
    let _ = globals;
    match cmd {
        FeedCmd::Add { url, title } => {
            let sub = add_and_fetch(url, title).await?;
            Ok(json!({
                "subscription": sub,
                "lines": [format!("{}  {}  ({} items)", sub.title, sub.url, sub.item_count)],
            }))
        }
        FeedCmd::List => {
            let data = list()?;
            let lines: Vec<String> = data
                .subscriptions
                .iter()
                .map(|row| format!("{}  {}  {} items", row.title, row.url, row.item_count))
                .collect();
            Ok(json!({ "subscriptions": data.subscriptions, "lines": lines }))
        }
        FeedCmd::Remove { target } => {
            let sub = remove_by_ref(&target)?;
            Ok(json!({
                "removed": sub,
                "lines": [format!("removed  {}  {}", sub.title, sub.url)],
            }))
        }
    }
}
