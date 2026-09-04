//! Canonical timestamp formatting.
//!
//! Persisted timestamps (catalog, feeds, usage, sidecars) are compared as
//! strings (`ORDER BY updated_at`), so every writer MUST emit the same
//! fixed-width RFC 3339 form. Mixed variants — second precision
//! (`…:00Z`), bare `to_rfc3339()` (`…:00.123+00:00` with 0/3/6/9 fractional
//! digits) — do not sort correctly against the millisecond form because
//! `'+' < '.' < 'Z'`.

use crate::core::error::AppError;

/// RFC 3339 with millisecond precision and Z suffix, e.g. `2026-08-21T10:00:00.500Z`.
/// All persisted timestamps MUST use this format: catalog orders by string compare.
pub fn now_rfc3339_millis() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Re-format a stored RFC 3339 timestamp into the canonical millisecond form.
/// Returns `None` for empty or unparseable values (migrations leave those untouched).
pub fn normalize_rfc3339_millis(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(trimmed)
        .ok()
        .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

/// Compare two stored timestamps by parsed instant. Legacy sidecars may still
/// carry second-precision values, so string compare is only a fallback for
/// unparseable values.
pub fn rfc3339_after(a: &str, b: &str) -> bool {
    match (
        chrono::DateTime::parse_from_rfc3339(a.trim()),
        chrono::DateTime::parse_from_rfc3339(b.trim()),
    ) {
        (Ok(x), Ok(y)) => x > y,
        _ => a > b,
    }
}

/// Rewrite timestamp `columns` of `table` (keyed by `key_col`) into the
/// canonical millisecond form. Idempotent: values already in canonical form
/// parse back unchanged and are not rewritten; unparseable values are kept.
/// Returns the number of rewritten cells. Callers wrap in a transaction.
pub fn normalize_timestamp_columns(
    conn: &rusqlite::Connection,
    table: &str,
    key_col: &str,
    columns: &[&str],
) -> Result<usize, AppError> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {key_col}, {} FROM {table}",
            columns.join(", ")
        ))
        .map_err(|e| AppError::message(format!("normalize ts select {table}: {e}")))?;
    let mut rows = stmt
        .query([])
        .map_err(|e| AppError::message(format!("normalize ts query {table}: {e}")))?;

    // (key, column index, normalized value) for every cell needing a rewrite.
    // The key is kept as a dynamic Value so INTEGER keys (e.g. `arxiv_rec_state.id`) work.
    let mut updates: Vec<(rusqlite::types::Value, usize, String)> = Vec::new();
    while let Some(row) = rows
        .next()
        .map_err(|e| AppError::message(format!("normalize ts row {table}: {e}")))?
    {
        let key: rusqlite::types::Value = row
            .get(0)
            .map_err(|e| AppError::message(format!("normalize ts key {table}: {e}")))?;
        for idx in 0..columns.len() {
            let Ok(raw) = row.get::<_, Option<String>>(1 + idx) else {
                continue;
            };
            let Some(raw) = raw else { continue };
            if let Some(norm) = normalize_rfc3339_millis(&raw) {
                if norm != raw {
                    updates.push((key.clone(), idx, norm));
                }
            }
        }
    }
    drop(rows);
    drop(stmt);

    let mut rewritten = 0usize;
    for (key, idx, norm) in updates {
        rewritten += conn
            .execute(
                &format!(
                    "UPDATE {table} SET {} = ?1 WHERE {key_col} = ?2",
                    columns[idx]
                ),
                rusqlite::params![norm, key],
            )
            .map_err(|e| AppError::message(format!("normalize ts update {table}: {e}")))?;
    }
    Ok(rewritten)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn now_is_canonical_millis() {
        let s = now_rfc3339_millis();
        // Fixed width: YYYY-MM-DDTHH:MM:SS.mmmZ (24 chars).
        assert_eq!(s.len(), 24, "{s}");
        assert!(s.ends_with('Z'));
        assert_eq!(&s[19..20], ".");
        assert!(chrono::DateTime::parse_from_rfc3339(&s).is_ok());
    }

    #[test]
    fn normalize_rewrites_variants() {
        assert_eq!(
            normalize_rfc3339_millis("2026-08-21T10:00:00Z"),
            Some("2026-08-21T10:00:00.000Z".to_string())
        );
        assert_eq!(
            normalize_rfc3339_millis("2026-08-21T10:00:00.123456+00:00"),
            Some("2026-08-21T10:00:00.123Z".to_string())
        );
        assert_eq!(
            normalize_rfc3339_millis("2026-08-21T10:00:00.500Z"),
            Some("2026-08-21T10:00:00.500Z".to_string())
        );
        assert_eq!(normalize_rfc3339_millis(""), None);
        assert_eq!(normalize_rfc3339_millis("not-a-date"), None);
    }
}
