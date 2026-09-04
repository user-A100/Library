//! Atomic local-disk writes: sibling temp file + rename.
//!
//! Before `docs/development/refactor-audit-2026-08.md` P2-17, eight features
//! each open-coded their own "write temp, rename into place" loop (temp
//! naming / Windows rename fallback / 0o600 permissions in every possible
//! combination). They now share this module.
//!
//! Contracts preserved from the originals:
//! - temp files end in `.tmp` by default — `features/sync/snapshot.rs`
//!   excludes `*.tmp` from vault scans, so temps are never synced;
//! - wiki rename passes a `.agentero-rename-` temp name so
//!   `features/watcher` classifies the swap as a content modify instead of a
//!   user rename;
//! - the deliberate FSEvents exceptions (doctor alias repair, refs cite
//!   sidecars) stay plain in-place writes and must NOT use this module.
//!
//! Like every original implementation, this does not `fsync`; durability is
//! "atomic replacement", not "crash-proof persistence".

use crate::core::error::AppError;
use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Options for [`atomic_write_with`] / [`json_store_with`].
#[derive(Debug, Clone, Default)]
pub struct AtomicOpts {
    /// Sibling temp file name. Defaults to `{file_name}.tmp` — the `.tmp`
    /// suffix is what sync snapshot scans filter out.
    pub temp_name: Option<String>,
    /// Unix permission mode applied to the written file (best-effort), e.g.
    /// `0o600` for files that hold secrets. Ignored on other platforms.
    pub unix_mode: Option<u32>,
}

impl AtomicOpts {
    /// Owner-only file on Unix (0o600): settings / sync credentials.
    pub const OWNER_ONLY: Self = Self {
        temp_name: None,
        unix_mode: Some(0o600),
    };
}

/// Atomic write with default options (temp `{file_name}.tmp`).
pub fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    atomic_write_with(path, bytes, &AtomicOpts::default())
}

/// Write `bytes` to `path` via a sibling temp file + rename.
///
/// When the rename fails (Windows refuses to rename over an existing file),
/// the temp is removed and the target is written directly instead — same
/// fallback the original implementations used.
pub fn atomic_write_with(path: &Path, bytes: &[u8], opts: &AtomicOpts) -> io::Result<()> {
    let temp = temp_path(path, opts);
    fs::write(&temp, bytes)?;
    apply_mode(&temp, opts);
    if fs::rename(&temp, path).is_err() {
        // Windows may fail rename over an existing file.
        let _ = fs::remove_file(&temp);
        fs::write(path, bytes)?;
        apply_mode(path, opts);
    }
    Ok(())
}

/// Serialize `value` as pretty JSON and write it atomically (see
/// [`atomic_write`]). Field order and formatting come from the `Serialize`
/// impl, exactly as a direct `serde_json::to_vec_pretty` would produce.
pub fn json_store<T: Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    json_store_with(path, value, &AtomicOpts::default())
}

/// [`json_store`] with options (e.g. [`AtomicOpts::OWNER_ONLY`] for secrets).
pub fn json_store_with<T: Serialize>(
    path: &Path,
    value: &T,
    opts: &AtomicOpts,
) -> Result<(), AppError> {
    let raw = serde_json::to_vec_pretty(value)?;
    atomic_write_with(path, &raw, opts)?;
    Ok(())
}

fn temp_path(path: &Path, opts: &AtomicOpts) -> PathBuf {
    match &opts.temp_name {
        Some(name) => path.with_file_name(name),
        None => {
            let name = path.file_name().map(|n| n.to_string_lossy());
            path.with_file_name(format!("{}.tmp", name.unwrap_or_default()))
        }
    }
}

/// Best-effort permission change, mirroring the original `let _ = …` calls.
/// Applied to the temp before rename so the target never exists with looser
/// permissions, and to the target after the Windows fallback write.
#[cfg(unix)]
fn apply_mode(path: &Path, opts: &AtomicOpts) {
    use std::os::unix::fs::PermissionsExt;
    if let Some(mode) = opts.unix_mode {
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode));
    }
}

#[cfg(not(unix))]
fn apply_mode(_path: &Path, _opts: &AtomicOpts) {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn atomic_write_replaces_content_and_leaves_no_temp() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("notes.md");
        fs::write(&path, "old").expect("seed");

        atomic_write(&path, b"new").expect("atomic write");

        assert_eq!(fs::read_to_string(&path).expect("read"), "new");
        let names: Vec<String> = fs::read_dir(dir.path())
            .expect("read_dir")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(names, vec!["notes.md".to_string()]);
    }

    #[test]
    fn custom_temp_name_is_honored_and_cleaned_up() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("NOTES.md");
        // Watcher contract: wiki temps carry the `.agentero-rename-` marker.
        let opts = AtomicOpts {
            temp_name: Some(".NOTES.md.agentero-rename-deadbeef.tmp".into()),
            ..Default::default()
        };

        atomic_write_with(&path, b"x", &opts).expect("atomic write");

        assert_eq!(fs::read(&path).expect("read"), b"x");
        assert!(!dir
            .path()
            .join(".NOTES.md.agentero-rename-deadbeef.tmp")
            .exists());
    }

    #[test]
    fn json_store_writes_pretty_json() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("state.json");
        let value = json!({"k": "v", "n": 1});

        json_store(&path, &value).expect("json store");

        let expected = serde_json::to_string_pretty(&value).expect("serialize");
        assert_eq!(fs::read_to_string(&path).expect("read"), expected);
    }

    #[cfg(unix)]
    #[test]
    fn owner_only_mode_is_applied() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("secrets.json");

        json_store_with(&path, &json!({"a": 1}), &AtomicOpts::OWNER_ONLY).expect("json store");

        let mode = fs::metadata(&path).expect("metadata").permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }
}
