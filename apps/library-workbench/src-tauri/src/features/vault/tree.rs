//! One-shot vault file-tree listing.
//!
//! The renderer used to build the tree with one `readDir` IPC per directory
//! (serial); this walks the vault in-process and returns the whole tree in a
//! single command. Semantics mirror `src/lib/vault/tree.ts`:
//! - Eager roots (`papers/`, `notes/`, `.agents/`) recurse fully.
//! - Other vault-root trees are listed one level; subdirs stay pending.
//! - Inside a paper folder, `source/` (arXiv e-print, often hundreds of
//!   files) is a pending shell listed lazily on expand.

use crate::core::error::AppError;
use crate::features::catalog::CapsCache;
use crate::features::import::has_local_tex;
use serde::Serialize;
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_DEPTH: usize = 12;

const IGNORE_NAMES: &[&str] = &[
    ".git",
    ".DS_Store",
    "node_modules",
    "target",
    "dist",
    ".agentero",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".eggs",
    ".codex",
    ".idea",
    ".vscode",
    "site-packages",
];

const ALLOWED_DOT_NAMES: &[&str] = &[".env.example", ".agents"];

const EAGER_ROOT_NAMES: &[&str] = &["papers", "notes", ".agents"];

/// Any of these marks a directory as a paper unit whose `source/` is lazy.
const PAPER_MARKER_FILES: &[&str] = &["NOTES.md", "PAPER.md"];

const LAZY_PAPER_DIR: &str = "source";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultTreeNode {
    pub name: String,
    /// Absolute path (doubles as the renderer node id).
    pub path: String,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<VaultTreeNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children_pending: Option<bool>,
    /// Paper `source/` shells only: whether TeX exists on disk (children are
    /// lazy, so the renderer cannot infer this from the tree itself).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_tex: Option<bool>,
}

fn should_ignore(name: &str) -> bool {
    if name.is_empty() {
        return true;
    }
    if IGNORE_NAMES.contains(&name) {
        return true;
    }
    if ALLOWED_DOT_NAMES.contains(&name) {
        return false;
    }
    if name.starts_with('.') {
        return true;
    }
    name.ends_with(".egg-info")
}

fn natural_name_cmp(a: &str, b: &str) -> Ordering {
    let a = a.as_bytes();
    let b = b.as_bytes();
    let mut ai = 0;
    let mut bi = 0;

    while ai < a.len() && bi < b.len() {
        let ac = a[ai];
        let bc = b[bi];

        if ac.is_ascii_digit() && bc.is_ascii_digit() {
            let mut a_end = ai;
            while a_end < a.len() && a[a_end].is_ascii_digit() {
                a_end += 1;
            }

            let mut b_end = bi;
            while b_end < b.len() && b[b_end].is_ascii_digit() {
                b_end += 1;
            }

            let a_num = &a[ai..a_end];
            let b_num = &b[bi..b_end];
            match a_num.len().cmp(&b_num.len()).then_with(|| a_num.cmp(b_num)) {
                Ordering::Equal => {
                    ai = a_end;
                    bi = b_end;
                    continue;
                }
                cmp => return cmp,
            }
        }

        match ac.to_ascii_lowercase().cmp(&bc.to_ascii_lowercase()) {
            Ordering::Equal => {
                ai += 1;
                bi += 1;
            }
            cmp => return cmp,
        }
    }

    a.len().cmp(&b.len())
}

fn sort_nodes(nodes: &mut [VaultTreeNode]) {
    nodes.sort_by(|a, b| match (a.kind, b.kind) {
        ("directory", "file") => Ordering::Less,
        ("file", "directory") => Ordering::Greater,
        _ => natural_name_cmp(&a.name, &b.name),
    });
}

/// Whether a vault-relative dir (`""` = root) belongs to a fully-walked tree.
fn is_eager_rel(rel: &str) -> bool {
    let r = rel.trim_matches('/');
    if r.is_empty() {
        return true;
    }
    let top = r.split('/').next().unwrap_or("").to_ascii_lowercase();
    EAGER_ROOT_NAMES.contains(&top.as_str())
}

fn has_paper_marker(dir: &Path) -> bool {
    PAPER_MARKER_FILES.iter().any(|m| dir.join(m).is_file())
}

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    /// Recurse per-child semantics (eager roots deep, others one level).
    Eager,
    /// Files + pending directory shells only.
    OneLevel,
}

fn pending_shell(name: String, path: String) -> VaultTreeNode {
    VaultTreeNode {
        name,
        path,
        kind: "directory",
        children: Some(Vec::new()),
        children_pending: Some(true),
        has_tex: None,
    }
}

/// TeX presence for a paper's lazy `source/` shell.
///
/// Goes through `CapsCache` keyed by the paper's vault-relative path so a full
/// tree rebuild does not re-walk every paper's `source/` (arXiv e-prints often
/// contain hundreds of files; on NTFS that walk dominates build time). The
/// watcher invalidates the paper's caps entry when capability-relevant files
/// change, so cached values stay fresh.
fn source_shell_has_tex(root: &Path, paper_rel: &str, source_dir: &Path, caps: &CapsCache) -> bool {
    if paper_rel.is_empty() {
        // Paper markers at the vault root cannot be keyed in the cache.
        return has_local_tex(source_dir);
    }
    caps.caps_for(root, paper_rel).has_tex
}

fn list_dir(
    root: &Path,
    dir: &Path,
    rel: &str,
    depth: usize,
    mode: Mode,
    caps: &CapsCache,
) -> Vec<VaultTreeNode> {
    if depth > MAX_DEPTH {
        return Vec::new();
    }
    // Best-effort: unreadable subdirs yield an empty listing, not a hard error.
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut dirs: Vec<(String, PathBuf, String)> = Vec::new();
    let mut files: Vec<VaultTreeNode> = Vec::new();
    let mut paper_marker = false;

    for entry in entries.flatten() {
        let name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => continue,
        };
        if should_ignore(&name) {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let child_path = entry.path();
        let child_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        if file_type.is_dir() {
            dirs.push((name, child_path, child_rel));
        } else if file_type.is_file()
            // `file_type()` intentionally does not follow symlinks. A valid
            // symlink to a regular file is still a local paper asset (for
            // example a PDF kept in a shared Downloads folder), so include it
            // in the tree without ever traversing symlinked directories.
            || (file_type.is_symlink()
                && fs::metadata(&child_path)
                    .map(|metadata| metadata.is_file())
                    .unwrap_or(false))
        {
            if PAPER_MARKER_FILES.contains(&name.as_str()) {
                paper_marker = true;
            }
            files.push(VaultTreeNode {
                name,
                path: child_path.to_string_lossy().into_owned(),
                kind: "file",
                children: None,
                children_pending: None,
                has_tex: None,
            });
        }
    }

    let mut nodes: Vec<VaultTreeNode> = Vec::with_capacity(dirs.len() + files.len());
    for (name, child_path, child_rel) in dirs {
        let path_str = child_path.to_string_lossy().into_owned();
        let node = match mode {
            Mode::OneLevel => pending_shell(name, path_str),
            Mode::Eager => {
                if paper_marker && name == LAZY_PAPER_DIR {
                    let mut shell = pending_shell(name, path_str);
                    shell.has_tex = Some(source_shell_has_tex(root, rel, &child_path, caps));
                    shell
                } else if is_eager_rel(&child_rel) {
                    VaultTreeNode {
                        name,
                        path: path_str,
                        kind: "directory",
                        children: Some(list_dir(
                            root,
                            &child_path,
                            &child_rel,
                            depth + 1,
                            Mode::Eager,
                            caps,
                        )),
                        children_pending: None,
                        has_tex: None,
                    }
                } else {
                    VaultTreeNode {
                        name,
                        path: path_str,
                        kind: "directory",
                        children: Some(list_dir(
                            root,
                            &child_path,
                            &child_rel,
                            depth + 1,
                            Mode::OneLevel,
                            caps,
                        )),
                        children_pending: Some(false),
                        has_tex: None,
                    }
                }
            }
        };
        nodes.push(node);
    }
    nodes.extend(files);
    sort_nodes(&mut nodes);
    nodes
}

/// Full tree for the vault root, in one pass.
pub fn build_tree(root: &Path, caps: &CapsCache) -> Vec<VaultTreeNode> {
    list_dir(root, root, "", 0, Mode::Eager, caps)
}

/// True when `rel` sits at or below a paper folder's lazy `source/` subtree.
fn in_paper_source(root: &Path, rel: &str) -> bool {
    let segments: Vec<&str> = rel.split('/').filter(|s| !s.is_empty()).collect();
    let mut prefix = root.to_path_buf();
    for segment in &segments {
        if *segment == LAZY_PAPER_DIR && has_paper_marker(&prefix) {
            return true;
        }
        prefix.push(segment);
    }
    false
}

/// Vault-relative path of `dir` under `root`, or an error when outside.
fn rel_under_root(root: &Path, dir: &Path) -> Result<String, AppError> {
    let strip = |base: &Path, target: &Path| -> Option<String> {
        target
            .strip_prefix(base)
            .ok()
            .map(|r| r.to_string_lossy().replace('\\', "/"))
    };
    if let Some(rel) = strip(root, dir) {
        return Ok(rel);
    }
    // Handle symlinked prefixes (e.g. /var vs /private/var on macOS).
    let root_canon = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let dir_canon = fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
    strip(&root_canon, &dir_canon)
        .ok_or_else(|| AppError::message("directory is outside the vault"))
}

/// Children of one directory, applying the same semantics as the full build:
/// eager subtrees recurse; non-eager dirs and paper `source/` list one level.
pub fn list_children(
    root: &Path,
    dir: &Path,
    caps: &CapsCache,
) -> Result<Vec<VaultTreeNode>, AppError> {
    let rel = rel_under_root(root, dir)?;
    if !dir.is_dir() {
        return Err(AppError::message("directory does not exist"));
    }
    let mode = if !is_eager_rel(&rel) || in_paper_source(root, &rel) {
        Mode::OneLevel
    } else {
        Mode::Eager
    };
    Ok(list_dir(root, dir, &rel, 0, mode, caps))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentero-tree-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn find<'a>(nodes: &'a [VaultTreeNode], name: &str) -> Option<&'a VaultTreeNode> {
        nodes.iter().find(|n| n.name == name)
    }

    #[test]
    fn eager_roots_recurse_and_paper_source_stays_pending() {
        let root = &temp_root("build");
        write(&root.join("papers/p1/NOTES.md"), "# n");
        write(&root.join("papers/p1/source/main.tex"), "x");
        write(&root.join("papers/p1/source/figs/a.png"), "x");
        write(&root.join("papers/p1/assets/img.png"), "x");
        write(&root.join("notes/idea.md"), "x");
        write(&root.join("src/lib/deep/file.ts"), "x");
        write(&root.join(".git/config"), "x");

        let tree = build_tree(root, &CapsCache::new());
        assert!(find(&tree, ".git").is_none());

        let papers = find(&tree, "papers").unwrap();
        let p1 = find(papers.children.as_ref().unwrap(), "p1").unwrap();
        let source = find(p1.children.as_ref().unwrap(), "source").unwrap();
        assert_eq!(source.children_pending, Some(true));
        assert!(source.children.as_ref().unwrap().is_empty());
        assert_eq!(source.has_tex, Some(true));
        let assets = find(p1.children.as_ref().unwrap(), "assets").unwrap();
        assert_ne!(assets.children_pending, Some(true));
        assert_eq!(assets.children.as_ref().unwrap().len(), 1);

        // Non-eager root: one level, nested dirs pending.
        let src = find(&tree, "src").unwrap();
        let lib = find(src.children.as_ref().unwrap(), "lib").unwrap();
        assert_eq!(lib.children_pending, Some(true));
    }

    #[test]
    fn list_children_modes() {
        let root = &temp_root("children");
        write(&root.join("papers/p1/NOTES.md"), "# n");
        write(&root.join("papers/p1/source/sub/deep.tex"), "x");
        write(&root.join("papers/p1/source/main.tex"), "x");
        let caps = CapsCache::new();

        // Expanding the paper's source/: one level, subdirs pending.
        let source_dir = root.join("papers/p1/source");
        let children = list_children(root, &source_dir, &caps).unwrap();
        assert!(find(&children, "main.tex").is_some());
        let sub = find(&children, "sub").unwrap();
        assert_eq!(sub.children_pending, Some(true));

        // Refreshing the paper folder recurses but keeps source/ pending.
        let paper = root.join("papers/p1");
        let children = list_children(root, &paper, &caps).unwrap();
        let source = find(&children, "source").unwrap();
        assert_eq!(source.children_pending, Some(true));
        assert_eq!(source.has_tex, Some(true));

        // Outside the vault is rejected.
        assert!(list_children(root, Path::new("/"), &caps).is_err());
    }

    #[test]
    fn source_shell_without_tex_reports_has_tex_false() {
        let root = &temp_root("notex");
        write(&root.join("papers/p1/NOTES.md"), "# n");
        write(&root.join("papers/p1/source/figs/a.png"), "x");

        let tree = build_tree(root, &CapsCache::new());
        let papers = find(&tree, "papers").unwrap();
        let p1 = find(papers.children.as_ref().unwrap(), "p1").unwrap();
        let source = find(p1.children.as_ref().unwrap(), "source").unwrap();
        assert_eq!(source.has_tex, Some(false));
    }

    #[test]
    fn source_probe_uses_caps_cache_until_invalidated() {
        let root = &temp_root("caps-fresh");
        write(&root.join("papers/p1/NOTES.md"), "# n");
        write(&root.join("papers/p1/source/notes.txt"), "x");
        let caps = CapsCache::new();

        let source_has_tex = |tree: &[VaultTreeNode]| {
            let papers = find(tree, "papers").unwrap();
            let p1 = find(papers.children.as_ref().unwrap(), "p1").unwrap();
            find(p1.children.as_ref().unwrap(), "source")
                .unwrap()
                .has_tex
        };

        assert_eq!(source_has_tex(&build_tree(root, &caps)), Some(false));

        // TeX appears; the cached probe is stale until the watcher invalidates.
        write(&root.join("papers/p1/source/main.tex"), "x");
        assert_eq!(source_has_tex(&build_tree(root, &caps)), Some(false));

        // Watcher-style invalidation of the paper folder refreshes the probe.
        caps.invalidate(root, "papers/p1");
        assert_eq!(source_has_tex(&build_tree(root, &caps)), Some(true));
    }

    #[cfg(unix)]
    #[test]
    fn valid_symlinked_pdf_is_listed_as_a_file() {
        use std::os::unix::fs::symlink;

        let root = &temp_root("symlink-pdf");
        let paper = root.join("papers/p1");
        write(&paper.join("NOTES.md"), "# n");
        write(&paper.join("source/main.tex"), "x");
        let target = root.join("outside.pdf");
        write(&target, "pdf");
        symlink(&target, paper.join("p1.pdf")).unwrap();

        let tree = build_tree(root, &CapsCache::new());
        let papers = find(&tree, "papers").unwrap();
        let p1 = find(papers.children.as_ref().unwrap(), "p1").unwrap();
        assert!(find(p1.children.as_ref().unwrap(), "p1.pdf").is_some());
    }

    /// Quantifies the caps-cache win: 20 papers with 200 files each under
    /// `source/`. The first build walks every source/ tree (cold); the second
    /// hits the cache and must not re-walk. Prints both durations
    /// (`cargo test ... -- --nocapture` to see the numbers).
    #[test]
    fn build_tree_second_pass_hits_caps_cache() {
        let root = &temp_root("caps-perf");
        for p in 0..20 {
            let paper = root.join(format!("papers/p{p:02}"));
            write(&paper.join("NOTES.md"), "# n");
            let src = paper.join("source");
            fs::create_dir_all(src.join("figs")).unwrap();
            for f in 0..199 {
                fs::write(src.join(format!("figs/f{f:03}.png")), "x").unwrap();
            }
            fs::write(src.join("main.tex"), "x").unwrap();
        }
        let caps = CapsCache::new();

        let cold_start = std::time::Instant::now();
        let cold_tree = build_tree(root, &caps);
        let cold = cold_start.elapsed();

        let warm_start = std::time::Instant::now();
        let warm_tree = build_tree(root, &caps);
        let warm = warm_start.elapsed();

        eprintln!(
            "build_tree 20 papers x 200 source files: cold={cold:?} warm={warm:?} ({:.1}x)",
            cold.as_secs_f64() / warm.as_secs_f64().max(f64::EPSILON)
        );

        let check = |tree: &[VaultTreeNode]| {
            let papers = find(tree, "papers").unwrap();
            for p in 0..20 {
                let paper = find(papers.children.as_ref().unwrap(), &format!("p{p:02}")).unwrap();
                let source = find(paper.children.as_ref().unwrap(), "source").unwrap();
                assert_eq!(source.has_tex, Some(true));
                assert_eq!(source.children_pending, Some(true));
            }
        };
        check(&cold_tree);
        check(&warm_tree);
        // The warm build only does directory listings + cache lookups; it must
        // beat the cold build that walked 20 x 200 source files.
        assert!(
            warm < cold,
            "warm build ({warm:?}) should be faster than cold build ({cold:?})"
        );
    }

    #[test]
    fn sorts_names_naturally_with_directories_first() {
        let root = &temp_root("sort");
        write(&root.join("papers/10-topic/NOTES.md"), "# n");
        write(&root.join("papers/9-topic/NOTES.md"), "# n");
        write(&root.join("10-note.md"), "x");
        write(&root.join("9-note.md"), "x");

        let tree = build_tree(root, &CapsCache::new());
        let names: Vec<&str> = tree.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["papers", "9-note.md", "10-note.md"]);

        let papers = find(&tree, "papers").unwrap();
        let paper_names: Vec<&str> = papers
            .children
            .as_ref()
            .unwrap()
            .iter()
            .map(|n| n.name.as_str())
            .collect();
        assert_eq!(paper_names, vec!["9-topic", "10-topic"]);
    }
}
