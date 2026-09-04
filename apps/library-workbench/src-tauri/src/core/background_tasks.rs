//! Cooperative-cancellation registry for frontend background tasks.
//!
//! Frontend-tracked tasks (imports, downloads, parses, citing scans, …) pass a
//! `task_id`; long-running work polls [`is_cancelled`], the cancel command sets
//! it, and command exits call [`finish`] so a stale flag never kills the next
//! task reusing the id. Lives in `core` (not any one domain) because
//! import/refs/layout_model/agent all participate; JobCenter routes its
//! `cancel` through the same registry.

use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};

static CANCELLED: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

pub fn cancel(task_id: &str) {
    if let Ok(mut tasks) = CANCELLED.lock() {
        tasks.insert(task_id.to_string());
    }
}

pub fn is_cancelled(task_id: &str) -> bool {
    CANCELLED
        .lock()
        .map(|tasks| tasks.contains(task_id))
        .unwrap_or(false)
}

pub fn finish(task_id: &str) {
    if let Ok(mut tasks) = CANCELLED.lock() {
        tasks.remove(task_id);
    }
}
