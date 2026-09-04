use crate::core::error::{map_err, ApiResult, AppError};
use serde::{Deserialize, Serialize};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::State;

use super::{
    emit_job_changed, parse_lane, validate_job_paper, JobCenter, JobKind, JobLane, JobSnapshot,
    JobState, StartOutcome,
};

/// Shared enqueue args for kinds that take no extra parameters
/// (ParseRefs / LayoutAnalyze / DownloadAssets).
#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JobEnqueueArgs {
    pub vault_path: String,
    pub path: String,
    #[serde(default)]
    pub lane: Option<JobLane>,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JobParseBodyEnqueueArgs {
    pub vault_path: String,
    pub path: String,
    #[serde(default)]
    pub lane: Option<JobLane>,
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub task_id: Option<String>,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JobFocusPaperArgs {
    pub vault_path: String,
    pub path: String,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JobListArgs {
    #[serde(default)]
    pub vault_path: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JobReportArgs {
    pub job_id: String,
    #[serde(default)]
    pub progress: Option<f32>,
    #[serde(default)]
    pub phase: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub state: Option<JobState>,
}

/// Announce an enqueued job (`job:changed`) and start it when its kind has a
/// free slot and its dependencies are ready. Returns the enqueued snapshot.
async fn start_or_hold(
    app: &tauri::AppHandle,
    center: &JobCenter,
    snapshot: JobSnapshot,
) -> JobSnapshot {
    emit_job_changed(app, snapshot.clone());
    match center.try_start(&snapshot.id).await {
        StartOutcome::Started(started) => center.spawn_runner(app, started),
        StartOutcome::Skipped(skipped) => emit_job_changed(app, skipped),
        StartOutcome::Waiting => {}
    }
    snapshot
}

#[tauri::command]
#[specta::specta]
pub async fn job_parse_refs_enqueue(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    args: JobEnqueueArgs,
) -> Result<ApiResult<JobSnapshot>, String> {
    let (vault, path) = match validate_job_paper(&args.vault_path, &args.path) {
        Ok(valid) => valid,
        Err(e) => return Ok(map_err(e)),
    };
    let snapshot = center
        .enqueue_parse_refs(&vault, &path, parse_lane(args.lane), args.force)
        .await;
    Ok(ApiResult::ok(start_or_hold(&app, &center, snapshot).await))
}

#[tauri::command]
#[specta::specta]
pub async fn job_parse_body_enqueue(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    args: JobParseBodyEnqueueArgs,
) -> Result<ApiResult<JobSnapshot>, String> {
    let (vault, path) = match validate_job_paper(&args.vault_path, &args.path) {
        Ok(valid) => valid,
        Err(e) => return Ok(map_err(e)),
    };
    let snapshot = center
        .enqueue_parse_body(
            &vault,
            &path,
            parse_lane(args.lane),
            args.force,
            args.task_id,
        )
        .await;
    Ok(ApiResult::ok(start_or_hold(&app, &center, snapshot).await))
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JobReconcilePaperArgs {
    pub vault_path: String,
    pub path: String,
}

/// Shared backfill: enqueue a job via `enqueue` on `lane` and start it if a
/// slot is free. Returns the enqueued snapshot.
async fn enqueue_backfill<F, Fut>(
    app: &tauri::AppHandle,
    center: &JobCenter,
    lane: JobLane,
    enqueue: F,
) -> JobSnapshot
where
    F: FnOnce(JobLane) -> Fut,
    Fut: std::future::Future<Output = JobSnapshot>,
{
    let snapshot = enqueue(lane).await;
    start_or_hold(app, center, snapshot).await
}

/// Per-paper reconcile (pipeline-orchestration §7.4 入口②): backfill a
/// `ParseBody` job when the paper has a PDF but no TeX and no `PAPER.md`, and
/// a `ParseRefs` job when the cite sidecar is absent. Returns the enqueued
/// jobs (empty when nothing needs doing).
#[tauri::command]
#[specta::specta]
pub async fn job_reconcile_paper(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    caps: State<'_, crate::features::catalog::CapsCache>,
    args: JobReconcilePaperArgs,
) -> Result<ApiResult<Vec<JobSnapshot>>, String> {
    let (vault, path) = match validate_job_paper(&args.vault_path, &args.path) {
        Ok(valid) => valid,
        Err(e) => return Ok(map_err(e)),
    };
    let paper_caps = caps.caps_for(&vault, &path);
    let mut enqueued = Vec::new();
    if paper_caps.needs_paper_md() {
        enqueued.push(
            enqueue_backfill(&app, &center, parse_lane(None), |lane| {
                center.enqueue_parse_body(&vault, &path, lane, false, None)
            })
            .await,
        );
    }
    // Backfill references when the refs domain's registered probe flags the
    // paper (cite sidecar absent).
    if center
        .backfill_needed(JobKind::ParseRefs, &vault, &path)
        .await
    {
        enqueued.push(
            enqueue_backfill(&app, &center, parse_lane(None), |lane| {
                center.enqueue_parse_refs(&vault, &path, lane, false)
            })
            .await,
        );
    }
    Ok(ApiResult::ok(enqueued))
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JobReconcileVaultArgs {
    pub vault_path: String,
}

/// Vault-wide reconcile (§7.3 T2): backfill `ParseBody` for every catalog paper
/// that has a PDF but no TeX and no `PAPER.md`. Jobs enqueue on the idle lane;
/// the per-kind cap (ParseBody = 1) throttles execution. Returns the count.
#[tauri::command]
#[specta::specta]
pub async fn job_reconcile_vault(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    caps: State<'_, crate::features::catalog::CapsCache>,
    args: JobReconcileVaultArgs,
) -> Result<ApiResult<u32>, String> {
    let vault = match crate::core::fs::resolve_vault(&args.vault_path) {
        Ok(vault) => vault,
        Err(err) => return Ok(map_err(err)),
    };
    let caps_handle = (*caps).clone();
    let scan_vault = vault.clone();
    let needing = tauri::async_runtime::spawn_blocking(move || {
        let Ok(papers) = crate::features::catalog::papers::list_all(&scan_vault) else {
            return Vec::new();
        };
        papers
            .into_iter()
            .map(|paper| paper.path)
            .filter(|path| caps_handle.caps_for(&scan_vault, path).needs_paper_md())
            .collect::<Vec<_>>()
    })
    .await
    .unwrap_or_default();

    let mut enqueued = 0u32;
    for path in needing {
        enqueue_backfill(&app, &center, JobLane::Idle, |lane| {
            center.enqueue_parse_body(&vault, &path, lane, false, None)
        })
        .await;
        enqueued += 1;
    }
    Ok(ApiResult::ok(enqueued))
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JobPapersNeedingAssetsArgs {
    pub vault_path: String,
}

/// Vault-relative paths of papers still missing local assets, per §8.4 CapsCache
/// (replaces the frontend `collectPapersNeedingAssetDownload` tree walk). A
/// paper needs a download when it has no PDF, or its body is unknown (no
/// catalog `body_source`) and it has neither TeX nor `PAPER.md`.
#[tauri::command]
#[specta::specta]
pub async fn job_papers_needing_assets(
    caps: State<'_, crate::features::catalog::CapsCache>,
    args: JobPapersNeedingAssetsArgs,
) -> Result<ApiResult<Vec<String>>, String> {
    let vault = match crate::core::fs::resolve_vault(&args.vault_path) {
        Ok(vault) => vault,
        Err(err) => return Ok(map_err(err)),
    };
    let caps_handle = (*caps).clone();
    let scan_vault = vault.clone();
    let needing = tauri::async_runtime::spawn_blocking(move || {
        let Ok(papers) = crate::features::catalog::papers::list_all(&scan_vault) else {
            return Vec::new();
        };
        papers
            .into_iter()
            .filter(|paper| {
                let caps = caps_handle.caps_for(&scan_vault, &paper.path);
                caps.needs_asset_download(paper.body_source.as_deref())
            })
            .map(|paper| paper.path)
            .collect::<Vec<_>>()
    })
    .await
    .unwrap_or_default();
    Ok(ApiResult::ok(needing))
}

#[tauri::command]
#[specta::specta]
pub async fn job_layout_analyze_enqueue(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    args: JobEnqueueArgs,
) -> Result<ApiResult<JobSnapshot>, String> {
    let (vault, path) = match validate_job_paper(&args.vault_path, &args.path) {
        Ok(valid) => valid,
        Err(e) => return Ok(map_err(e)),
    };
    center.refresh_layout_backend().await;
    let snapshot = center
        .enqueue_layout_analyze(&vault, &path, parse_lane(args.lane), args.force)
        .await;
    Ok(ApiResult::ok(start_or_hold(&app, &center, snapshot).await))
}

#[tauri::command]
#[specta::specta]
pub async fn job_download_assets_enqueue(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    args: JobEnqueueArgs,
) -> Result<ApiResult<JobSnapshot>, String> {
    let (vault, path) = match validate_job_paper(&args.vault_path, &args.path) {
        Ok(valid) => valid,
        Err(e) => return Ok(map_err(e)),
    };
    let snapshot = center
        .enqueue_download_assets(&vault, &path, parse_lane(args.lane), args.force)
        .await;
    Ok(ApiResult::ok(start_or_hold(&app, &center, snapshot).await))
}

#[tauri::command]
#[specta::specta]
pub async fn job_focus_paper(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    args: JobFocusPaperArgs,
) -> Result<ApiResult<Vec<JobSnapshot>>, String> {
    let (vault, path) = match validate_job_paper(&args.vault_path, &args.path) {
        Ok(valid) => valid,
        Err(e) => return Ok(map_err(e)),
    };
    let promoted = center.promote_paper(&vault, &path).await;
    for snapshot in &promoted {
        emit_job_changed(&app, snapshot.clone());
    }
    Ok(ApiResult::ok(promoted))
}

#[tauri::command]
#[specta::specta]
pub async fn job_cancel(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    job_id: String,
) -> Result<ApiResult<bool>, String> {
    let cancelled = center.cancel(&job_id).await;
    if cancelled {
        if let Some(snapshot) = center.snapshot(&job_id).await {
            emit_job_changed(&app, snapshot);
        }
        // Don't wait for the cancelled runner's wait_for_terminal loop: a
        // freed slot should start the next queued job of that kind now.
        center.drain_and_spawn(&app).await;
    }
    Ok(ApiResult::ok(cancelled))
}

#[tauri::command]
#[specta::specta]
pub async fn job_report(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    args: JobReportArgs,
) -> Result<ApiResult<JobSnapshot>, String> {
    match center
        .job_report(
            &args.job_id,
            args.progress,
            args.phase,
            args.error,
            args.state,
        )
        .await
    {
        Some(snapshot) => {
            emit_job_changed(&app, snapshot.clone());
            if matches!(
                snapshot.state,
                JobState::Succeeded | JobState::Failed | JobState::Cancelled | JobState::Skipped
            ) {
                center.drain_and_spawn(&app).await;
            }
            Ok(ApiResult::ok(snapshot))
        }
        None => Ok(map_err(crate::core::error::AppError::message(
            "job not found or not running",
        ))),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn job_list(
    center: State<'_, JobCenter>,
    args: JobListArgs,
) -> Result<ApiResult<Vec<JobSnapshot>>, String> {
    let vault = args
        .vault_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from);
    Ok(ApiResult::ok(
        center.list(vault.as_deref(), args.path.as_deref()).await,
    ))
}

/// Which generated parse artifacts a bulk clear/reparse command touches.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ParseResultScope {
    Layout,
    Paper,
    All,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClearParseResultsArgs {
    pub vault_path: String,
    pub scope: ParseResultScope,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClearParseResultsResult {
    pub papers_scanned: u32,
    pub files_removed: u32,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClearAndReparseResult {
    pub papers_scanned: u32,
    pub files_removed: u32,
    pub layout_enqueued: u32,
    pub paper_enqueued: u32,
}

const LAYOUT_SIDECAR_FILES: &[&str] = &["layout.json", "layout-index.json"];
const PAPER_MD_FILE: &str = "PAPER.md";

fn remove_file_best_effort(path: &Path) -> Result<bool, AppError> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(false),
        Err(e) => Err(AppError::from(e)),
    }
}

/// Cancel queued/running jobs whose output files we are about to delete, so the
/// deletion is not immediately undone by a late runner write.
async fn cancel_related_parse_jobs(
    app: &tauri::AppHandle,
    center: &JobCenter,
    vault: &Path,
    scope: ParseResultScope,
) {
    let relevant_kinds: &[JobKind] = match scope {
        ParseResultScope::Layout => &[JobKind::LayoutAnalyze],
        ParseResultScope::Paper => &[JobKind::ParseBody],
        ParseResultScope::All => &[JobKind::LayoutAnalyze, JobKind::ParseBody],
    };
    let jobs = center.list(Some(vault), None).await;
    for job in jobs {
        if !matches!(job.state, JobState::Queued | JobState::Running) {
            continue;
        }
        if !relevant_kinds.contains(&job.kind) {
            continue;
        }
        if center.cancel(&job.id).await {
            if let Some(snapshot) = center.snapshot(&job.id).await {
                emit_job_changed(app, snapshot);
            }
        }
    }
}

/// Shared core: scan the catalog, delete the requested artifacts, invalidate
/// the capability cache, and return the affected paper paths for reparse.
async fn clear_parse_results_core(
    vault_path: &str,
    scope: ParseResultScope,
    caps: &crate::features::catalog::CapsCache,
    app: &tauri::AppHandle,
    center: &JobCenter,
) -> Result<(u32, u32, Vec<String>), AppError> {
    if crate::integration::remote::parse_remote_handle(vault_path).is_some() {
        return Err(AppError::message(
            "clearing parse results is only supported for local vaults",
        ));
    }

    let vault = crate::core::fs::resolve_vault(vault_path)?;
    center.refresh_layout_backend().await;
    cancel_related_parse_jobs(app, center, &vault, scope).await;

    let scan_vault = vault.clone();
    let papers = tauri::async_runtime::spawn_blocking(move || {
        crate::features::catalog::papers::list_all(&scan_vault)
    })
    .await
    .unwrap_or_else(|_| Ok(Vec::new()))
    .unwrap_or_default();

    let papers_scanned = papers.len() as u32;
    let mut files_removed = 0u32;
    let mut affected_paths = Vec::with_capacity(papers.len());

    for paper in papers {
        let paper_dir = vault.join(&paper.path);
        if !paper_dir.is_dir() {
            continue;
        }
        affected_paths.push(paper.path);

        if matches!(scope, ParseResultScope::Layout | ParseResultScope::All) {
            let source_dir = paper_dir.join("source");
            for file in LAYOUT_SIDECAR_FILES {
                if remove_file_best_effort(&source_dir.join(file))? {
                    files_removed += 1;
                }
            }
        }

        if matches!(scope, ParseResultScope::Paper | ParseResultScope::All)
            && remove_file_best_effort(&paper_dir.join(PAPER_MD_FILE))?
        {
            files_removed += 1;
        }
    }

    caps.clear();
    Ok((papers_scanned, files_removed, affected_paths))
}

/// Delete generated layout/paper parse artifacts for every paper in the vault.
#[tauri::command]
#[specta::specta]
pub async fn clear_parse_results(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    caps: State<'_, crate::features::catalog::CapsCache>,
    args: ClearParseResultsArgs,
) -> Result<ApiResult<ClearParseResultsResult>, String> {
    match clear_parse_results_core(&args.vault_path, args.scope, &caps, &app, &center).await {
        Ok((papers_scanned, files_removed, _)) => Ok(ApiResult::ok(ClearParseResultsResult {
            papers_scanned,
            files_removed,
        })),
        Err(e) => Ok(map_err(e)),
    }
}

/// Delete generated parse artifacts and enqueue force reparse jobs for the
/// affected papers. Uses the idle lane so the bulk work does not starve focus.
#[tauri::command]
#[specta::specta]
pub async fn clear_and_reparse(
    app: tauri::AppHandle,
    center: State<'_, JobCenter>,
    caps: State<'_, crate::features::catalog::CapsCache>,
    args: ClearParseResultsArgs,
) -> Result<ApiResult<ClearAndReparseResult>, String> {
    let vault = match crate::core::fs::resolve_vault(&args.vault_path) {
        Ok(vault) => vault,
        Err(err) => return Ok(map_err(err)),
    };

    let (papers_scanned, files_removed, affected_paths) =
        match clear_parse_results_core(&args.vault_path, args.scope, &caps, &app, &center).await {
            Ok(result) => result,
            Err(e) => return Ok(map_err(e)),
        };

    let mut layout_enqueued = 0u32;
    let mut paper_enqueued = 0u32;

    for path in affected_paths {
        if matches!(args.scope, ParseResultScope::Layout | ParseResultScope::All) {
            enqueue_backfill(&app, &center, JobLane::Idle, |lane| {
                center.enqueue_layout_analyze(&vault, &path, lane, true)
            })
            .await;
            layout_enqueued += 1;
        }
        if matches!(args.scope, ParseResultScope::Paper | ParseResultScope::All) {
            enqueue_backfill(&app, &center, JobLane::Idle, |lane| {
                center.enqueue_parse_body(&vault, &path, lane, true, None)
            })
            .await;
            paper_enqueued += 1;
        }
    }

    Ok(ApiResult::ok(ClearAndReparseResult {
        papers_scanned,
        files_removed,
        layout_enqueued,
        paper_enqueued,
    }))
}
