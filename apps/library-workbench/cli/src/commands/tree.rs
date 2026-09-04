//! `agentero tree`

use crate::error::CliError;
use crate::output::to_value;
use crate::resolve::{resolve_vault, GlobalOpts};
use crate::style::Style;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeNode {
    path: String,
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeNode>>,
}

pub fn run(sub: Option<&str>, depth: i32, globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let rel = sub
        .unwrap_or("")
        .replace('\\', "/")
        .trim_matches('/')
        .to_string();
    if rel.split('/').any(|p| p == "..") {
        return Err(CliError::usage("path must not contain .."));
    }
    let root = if rel.is_empty() {
        vault.clone()
    } else {
        vault.join(&rel)
    };
    if !root.exists() {
        return Err(CliError::message(format!("path not found: {rel}")));
    }

    let max_depth = if depth < 0 { i32::MAX } else { depth };
    let nodes = if root.is_dir() {
        walk_dir(&vault, &root, 0, max_depth)?
    } else {
        let path = vault_relative(&vault, &root);
        vec![TreeNode {
            path,
            kind: "file",
            children: None,
        }]
    };

    let lines = flatten_lines(&nodes, 0, globals.style);
    Ok(json!({
        "nodes": to_value(&nodes)?,
        "lines": lines,
    }))
}

fn walk_dir(
    vault: &Path,
    dir: &Path,
    depth: i32,
    max_depth: i32,
) -> Result<Vec<TreeNode>, CliError> {
    let mut entries: Vec<_> = fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
            // Skip heavy / hidden noise except .agentero and .agents
            if name == ".git" || name == "node_modules" || name == "target" {
                return false;
            }
            true
        })
        .collect();
    entries.sort_by_key(|p| {
        (
            !p.is_dir(),
            p.file_name()
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default(),
        )
    });

    let mut out = Vec::with_capacity(entries.len());
    for path in entries {
        let rel = vault_relative(vault, &path);
        if path.is_dir() {
            let children = if depth + 1 < max_depth {
                Some(walk_dir(vault, &path, depth + 1, max_depth)?)
            } else {
                Some(vec![])
            };
            out.push(TreeNode {
                path: rel,
                kind: "dir",
                children,
            });
        } else {
            out.push(TreeNode {
                path: rel,
                kind: "file",
                children: None,
            });
        }
    }
    Ok(out)
}

fn vault_relative(vault: &Path, path: &Path) -> String {
    path.strip_prefix(vault)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"))
}

fn flatten_lines(nodes: &[TreeNode], indent: usize, style: Style) -> Vec<String> {
    let mut lines = Vec::new();
    let pad = "  ".repeat(indent);
    for n in nodes {
        let name = n.path.rsplit('/').next().unwrap_or(&n.path);
        let label = if n.kind == "dir" {
            style.dir(&format!("{name}/"))
        } else {
            style.file(name)
        };
        lines.push(format!("{pad}{label}"));
        if let Some(ch) = &n.children {
            lines.extend(flatten_lines(ch, indent + 1, style));
        }
    }
    lines
}
