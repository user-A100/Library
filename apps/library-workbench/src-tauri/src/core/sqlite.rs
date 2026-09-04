//! Shared SQLite plumbing for the app's local databases (catalog / usage / feeds).
//!
//! Each database owns its DDL and migration steps in its own `schema.rs`;
//! this module only factors out the verbatim-shared skeleton: open + standard
//! PRAGMA batch + `schema_meta.schema_version` read/write. Error-message
//! wording grew independently per database (catalog predates the `usage ` /
//! `feeds ` prefixes) and is preserved verbatim by [`DbMsgs`].

use crate::core::error::AppError;
use rusqlite::Connection;
use std::path::Path;

/// Standard PRAGMA batch applied right after every Agentero database open.
/// WAL lets readers proceed while the app writes; `busy_timeout` absorbs
/// short lock contention instead of failing commands immediately.
pub const STANDARD_PRAGMAS: &str = "PRAGMA journal_mode = WAL;\n\
     PRAGMA synchronous = NORMAL;\n\
     PRAGMA busy_timeout = 5000;\n\
     PRAGMA foreign_keys = ON;";

/// Historical error-message wording of one database, kept stable so logs and
/// greps on the strings below do not break.
#[derive(Clone, Copy)]
pub struct DbMsgs {
    /// `open {name} <path>: …`
    pub name: &'static str,
    /// `{scope}pragma: …` and `write {scope}schema_version: …`
    /// (`""` for catalog, `"<name> "` for usage / feeds).
    pub scope: &'static str,
    /// `{read}schema_version: …` (`"read "` for catalog, else same as `scope`).
    pub read: &'static str,
}

impl DbMsgs {
    pub const CATALOG: Self = Self {
        name: "catalog",
        scope: "",
        read: "read ",
    };
    pub const USAGE: Self = Self {
        name: "usage",
        scope: "usage ",
        read: "usage ",
    };
    pub const FEEDS: Self = Self {
        name: "feeds",
        scope: "feeds ",
        read: "feeds ",
    };
}

/// Open `db_path` and apply [`STANDARD_PRAGMAS`].
pub fn open_standard(db_path: &Path, msgs: DbMsgs) -> Result<Connection, AppError> {
    let conn = Connection::open(db_path)
        .map_err(|e| AppError::message(format!("open {} {}: {e}", msgs.name, db_path.display())))?;
    conn.execute_batch(STANDARD_PRAGMAS)
        .map_err(|e| AppError::message(format!("{}pragma: {e}", msgs.scope)))?;
    Ok(conn)
}

/// Read `schema_meta.schema_version`; a missing table or row yields `Ok(0)`.
pub fn read_schema_version(conn: &Connection, msgs: DbMsgs) -> Result<i32, AppError> {
    // Table may not exist yet
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_meta'",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if !exists {
        return Ok(0);
    }
    conn.query_row(
        "SELECT value FROM schema_meta WHERE key = 'schema_version'",
        [],
        |row| {
            let v: String = row.get(0)?;
            Ok(v.parse::<i32>().unwrap_or(0))
        },
    )
    .map_err(|e| AppError::message(format!("{}schema_version: {e}", msgs.read)))
}

/// Upsert `schema_meta.schema_version`. The `schema_meta` table must already
/// exist (each database's v1 DDL creates it before the first version stamp).
pub fn write_schema_version(conn: &Connection, version: i32, msgs: DbMsgs) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO schema_meta(key, value) VALUES('schema_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [version.to_string()],
    )
    .map_err(|e| AppError::message(format!("write {}schema_version: {e}", msgs.scope)))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The PRAGMA batch must stay verbatim: catalog / usage / feeds shipped
    /// with exactly this string and opening behavior must not drift.
    #[test]
    fn pragma_batch_is_verbatim() {
        assert_eq!(
            STANDARD_PRAGMAS,
            "PRAGMA journal_mode = WAL;\nPRAGMA synchronous = NORMAL;\nPRAGMA busy_timeout = 5000;\nPRAGMA foreign_keys = ON;"
        );
    }

    #[test]
    fn open_applies_pragmas_and_keeps_historical_error_wording() {
        let dir = std::env::temp_dir().join(format!(
            "agentero-core-sqlite-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("probe.sqlite");

        let conn = open_standard(&db, DbMsgs::CATALOG).expect("open");
        let mode: String = conn
            .query_row("PRAGMA journal_mode;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);

        // Missing parent dir → historical per-database open error wording.
        let err = open_standard(&dir.join("no").join("such.sqlite"), DbMsgs::USAGE)
            .expect_err("open must fail");
        assert!(err.to_string().starts_with("open usage "), "{err}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn schema_version_roundtrip_and_missing_table_default() {
        let conn = Connection::open_in_memory().unwrap();
        for msgs in [DbMsgs::CATALOG, DbMsgs::USAGE, DbMsgs::FEEDS] {
            assert_eq!(read_schema_version(&conn, msgs).unwrap(), 0);
        }

        conn.execute_batch(
            "CREATE TABLE schema_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
        )
        .unwrap();
        write_schema_version(&conn, 3, DbMsgs::FEEDS).unwrap();
        assert_eq!(read_schema_version(&conn, DbMsgs::FEEDS).unwrap(), 3);
        write_schema_version(&conn, 7, DbMsgs::FEEDS).unwrap();
        assert_eq!(read_schema_version(&conn, DbMsgs::FEEDS).unwrap(), 7);

        // Historical per-database write error wording (no schema_meta table).
        let bare = Connection::open_in_memory().unwrap();
        let err = write_schema_version(&bare, 1, DbMsgs::CATALOG).expect_err("write must fail");
        assert!(
            err.to_string().starts_with("write schema_version: "),
            "{err}"
        );
        let err = write_schema_version(&bare, 1, DbMsgs::USAGE).expect_err("write must fail");
        assert!(
            err.to_string().starts_with("write usage schema_version: "),
            "{err}"
        );
    }
}
