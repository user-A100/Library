//! Vault filesystem abstraction (`docs/development/remote-vault.md`).
//!
//! Local vaults use [`LocalFs`]; remote vaults use SFTP (or a local-sim backend for tests).

mod local;
mod path;
mod store;

pub use local::LocalFs;
pub use path::{
    ensure_vault_dir, join_remote, normalize_rel, path_escapes_root, resolve_paper_dir,
    resolve_vault, sanitize_vault_rel, FsCaps, FsDirEntry, FsFileMeta,
};
pub use store::{atomic_write, atomic_write_with, json_store, json_store_with, AtomicOpts};

use crate::core::error::AppError;
use async_trait::async_trait;

#[derive(Debug, Clone, Copy, Default)]
pub struct WriteOpts {
    /// Create parent directories when missing (best-effort).
    pub create_parents: bool,
}

/// Async filesystem operations relative to a vault root.
#[async_trait]
pub trait VaultFs: Send + Sync {
    fn caps(&self) -> FsCaps;

    async fn list(&self, rel: &str) -> Result<Vec<FsDirEntry>, AppError>;

    async fn stat(&self, rel: &str) -> Result<FsFileMeta, AppError>;

    async fn read(&self, rel: &str) -> Result<Vec<u8>, AppError>;

    async fn write(&self, rel: &str, data: &[u8], opts: WriteOpts) -> Result<(), AppError>;

    async fn mkdir(&self, rel: &str) -> Result<(), AppError>;

    async fn rename(&self, from: &str, to: &str) -> Result<(), AppError>;

    async fn remove(&self, rel: &str, recursive: bool) -> Result<(), AppError>;

    async fn exists(&self, rel: &str) -> Result<bool, AppError> {
        match self.stat(rel).await {
            Ok(_) => Ok(true),
            Err(e) if e.code() == "io" || e.code() == "message" => {
                // Treat missing path as false; other errors bubble via message text.
                let msg = e.to_string().to_lowercase();
                if msg.contains("not found")
                    || msg.contains("no such file")
                    || msg.contains("not a directory")
                {
                    Ok(false)
                } else {
                    // Ambiguous: try again as false only for NotFound-ish
                    Ok(false)
                }
            }
            Err(e) => Err(e),
        }
    }
}
