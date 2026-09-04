//! Path safety and shared FS metadata types.

use crate::core::error::AppError;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Capability flags so UI / business logic can degrade without guesswork.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsCaps {
    pub atomic_rename: bool,
    pub reliable_watch: bool,
    pub sqlite_native: bool,
    pub cheap_random_read: bool,
    pub agent_cwd_local: bool,
    pub finder_reveal: bool,
}

impl FsCaps {
    pub const LOCAL: Self = Self {
        atomic_rename: true,
        reliable_watch: true,
        sqlite_native: true,
        cheap_random_read: true,
        agent_cwd_local: true,
        finder_reveal: true,
    };

    pub const REMOTE: Self = Self {
        atomic_rename: true,
        reliable_watch: false,
        sqlite_native: false,
        cheap_random_read: false,
        agent_cwd_local: false,
        finder_reveal: false,
    };
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsDirEntry {
    pub name: String,
    pub is_dir: bool,
    pub is_file: bool,
    /// Vault-relative path using `/`.
    pub path: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FsFileMeta {
    pub size: u64,
    /// Modified time as unix seconds when known; 0 if unavailable.
    pub mtime: u64,
    pub is_dir: bool,
    pub is_file: bool,
}

/// Normalize a vault-relative path to UNIX style without leading `/`.
/// Drops `.` segments and collapses duplicate slashes.
pub fn normalize_rel(rel: &str) -> String {
    let s = rel.trim().replace('\\', "/");
    let parts: Vec<&str> = s
        .split('/')
        .filter(|p| !p.is_empty() && *p != ".")
        .collect();
    parts.join("/")
}

/// Returns true if `rel` attempts to escape the vault root via `..` segments.
pub fn path_escapes_root(rel: &str) -> bool {
    let norm = normalize_rel(rel);
    if norm.is_empty() {
        return false;
    }
    for part in norm.split('/') {
        if part == ".." {
            return true;
        }
    }
    false
}

/// Normalize a vault-relative path and reject empty or root-escaping inputs.
/// The canonical guard for user/IPC-provided paper/file paths.
pub fn sanitize_vault_rel(rel: &str) -> Result<String, String> {
    let norm = normalize_rel(rel);
    if norm.is_empty() {
        return Err("empty vault path".into());
    }
    if norm.split('/').any(|p| p == "..") {
        return Err("path escapes vault root".into());
    }
    Ok(norm)
}

/// Join remote root (absolute remote path) with vault-relative path.
pub fn join_remote(remote_root: &str, rel: &str) -> Result<String, String> {
    if path_escapes_root(rel) {
        return Err("path escapes vault root".into());
    }
    let root = remote_root.trim_end_matches('/');
    let rel = normalize_rel(rel);
    if rel.is_empty() {
        Ok(if root.is_empty() {
            "/".into()
        } else {
            root.to_string()
        })
    } else if root.is_empty() {
        Ok(format!("/{rel}"))
    } else {
        Ok(format!("{root}/{rel}"))
    }
}

/// Trim + validate that `vault_path` points at an existing directory.
pub fn resolve_vault(vault_path: &str) -> Result<PathBuf, AppError> {
    let vault = PathBuf::from(vault_path.trim());
    ensure_vault_dir(&vault)?;
    Ok(vault)
}

/// Validate that `root` is an existing directory — shared vault guard for
/// callers that already hold a resolved vault `&Path`.
pub fn ensure_vault_dir(root: &Path) -> Result<(), AppError> {
    if !root.is_dir() {
        return Err(AppError::message("vault path is not a directory"));
    }
    Ok(())
}

/// Resolve a paper folder inside the vault: sanitize `rel` (normalized
/// separators, no leading/trailing slashes), join under `vault_root`, and
/// require an existing directory. Returns `(abs_dir, sanitized_rel)`.
pub fn resolve_paper_dir(vault_root: &Path, rel: &str) -> Result<(PathBuf, String), AppError> {
    let rel = sanitize_vault_rel(rel).map_err(|_| AppError::message("invalid paper path"))?;
    let dir = vault_root.join(&rel);
    if !dir.is_dir() {
        return Err(AppError::message("paper folder not found"));
    }
    Ok((dir, rel))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_and_collapses() {
        assert_eq!(normalize_rel("/a//b/"), "a/b");
        assert_eq!(normalize_rel("."), "");
        assert_eq!(normalize_rel("./notes/x.md"), "notes/x.md");
        assert_eq!(normalize_rel("a/./b"), "a/b");
        assert_eq!(normalize_rel("papers\\x\\NOTES.md"), "papers/x/NOTES.md");
    }

    #[test]
    fn escape_detection() {
        assert!(path_escapes_root("../etc/passwd"));
        assert!(path_escapes_root("a/../../b"));
        assert!(!path_escapes_root("papers/1706.03762/NOTES.md"));
        assert!(!path_escapes_root(""));
    }

    #[test]
    fn sanitize_vault_rel_guards() {
        assert_eq!(
            sanitize_vault_rel("/papers//x\\NOTES.md").unwrap(),
            "papers/x/NOTES.md"
        );
        assert!(sanitize_vault_rel("").is_err());
        assert!(sanitize_vault_rel("a/../b").is_err());
        // Dots inside names are fine (unlike a naive contains("..") check).
        assert_eq!(sanitize_vault_rel("notes..md").unwrap(), "notes..md");
    }

    #[test]
    fn join_remote_ok() {
        assert_eq!(
            join_remote("/data/vault", "papers/x").unwrap(),
            "/data/vault/papers/x"
        );
        assert_eq!(join_remote("/data/vault/", "").unwrap(), "/data/vault");
        assert!(join_remote("/data/vault", "../x").is_err());
    }

    #[test]
    fn resolve_vault_trims_and_requires_directory() {
        let dir = std::env::temp_dir();
        let raw = dir.to_str().expect("temp dir is utf-8");
        assert_eq!(resolve_vault(raw).unwrap(), dir);
        assert_eq!(resolve_vault(&format!(" {raw} ")).unwrap(), dir);

        let missing = dir.join("agentero-no-such-vault-dir");
        let err = resolve_vault(missing.to_str().unwrap()).unwrap_err();
        assert_eq!(err.to_string(), "vault path is not a directory");
    }

    #[test]
    fn resolve_paper_dir_sanitizes_and_requires_directory() {
        let tmp =
            std::env::temp_dir().join(format!("agentero-resolve-paper-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(tmp.join("papers/x")).expect("create paper dir");

        let (dir, rel) = resolve_paper_dir(&tmp, " /papers//x ").expect("resolve paper dir");
        assert_eq!(rel, "papers/x");
        assert_eq!(dir, tmp.join("papers/x"));

        assert!(resolve_paper_dir(&tmp, "papers/missing").is_err());
        let escape = resolve_paper_dir(&tmp, "../escape").unwrap_err();
        assert_eq!(escape.to_string(), "invalid paper path");
        let empty = resolve_paper_dir(&tmp, " / ").unwrap_err();
        assert_eq!(empty.to_string(), "invalid paper path");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
