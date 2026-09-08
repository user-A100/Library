//! `library plaza *` — 广场 paper feeds for headless discovery.
//!
//! ModelScope serves its public feed as a latest-ingest firehose (no
//! server-side query), so topic filtering is local; arXiv is a real
//! `search_query` search, newest first.

use crate::error::CliError;
use crate::resolve::GlobalOpts;
use clap::Subcommand;
use library_lib::core::error::AppError;
use library_lib::features::modelscope;
use library_lib::features::scholar_api::sources::arxiv;
use serde_json::{json, Value};

#[derive(Debug, Subcommand)]
pub enum PlazaCmd {
    /// Latest papers from the ModelScope 论文广场 feed, keyword-filtered.
    ///
    /// The feed has no server-side search: --query keywords are matched locally
    /// against title / 中文标题 / abstract / domain tags (AND, case-insensitive).
    Modelscope {
        /// Keywords to match (repeatable, ANDed). Omit to list the feed as-is.
        #[arg(long = "query")]
        query: Vec<String>,
        /// Feed pages to fetch (1 page = --page-size papers). The feed is
        /// ingest-ordered, so a topic paper can sit ~600 records deep.
        #[arg(long, default_value_t = 12)]
        pages: usize,
        /// Papers per feed page.
        #[arg(long, default_value_t = 50)]
        page_size: usize,
    },
    /// Search arXiv (newest first), optionally limited to the last N days.
    Arxiv {
        /// arXiv `search_query` expression, e.g. `abs:"affective computing"`
        /// or `cat:cs.CL AND abs:"emotion"`.
        query: String,
        /// Maximum number of results.
        #[arg(long, default_value_t = 10)]
        max: usize,
        /// Keep only papers published within the last N days.
        #[arg(long)]
        days: Option<i64>,
    },
}

/// Star rating as a sortable number; unstarred papers sink below rated ones.
fn star_key(p: &modelscope::ModelScopePaper) -> f64 {
    p.star
        .as_deref()
        .and_then(|s| s.trim().parse::<f64>().ok())
        .unwrap_or(-1.0)
}

pub async fn run(cmd: PlazaCmd, _globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        PlazaCmd::Modelscope {
            query,
            pages,
            page_size,
        } => {
            let fetched = modelscope::fetch_modelscope_papers(pages, page_size).await?;
            let total = fetched.len();
            let mut papers = modelscope::filter_papers(&fetched, &query);
            // The public feed is ingest-ordered (the site's 热门 tab is not
            // exposed), so approximate 热门 by the star rating.
            papers.sort_by(|a, b| {
                star_key(b)
                    .partial_cmp(&star_key(a))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            let item_lines = papers
                .iter()
                .map(|p| {
                    let mut line = format!(
                        "{}  ★{}  {}",
                        p.publish_date
                            .as_deref()
                            .unwrap_or("          ")
                            .get(..10)
                            .unwrap_or(""),
                        p.star.as_deref().unwrap_or("-"),
                        p.title,
                    );
                    if let Some(cn) = p.title_cn.as_deref() {
                        line.push_str(&format!("（{cn}）"));
                    }
                    if let Some(id) = p.arxiv_id.as_deref() {
                        line.push_str(&format!("  arXiv:{id}"));
                    }
                    if let Some(url) = p.url.as_deref() {
                        line.push_str(&format!("  {url}"));
                    }
                    line
                })
                .collect::<Vec<_>>();
            let mut lines = vec![format!(
                "modelscope  fetched {total}  matched {}",
                papers.len()
            )];
            lines.extend(item_lines);
            Ok(json!({
                "source": "modelscope",
                "totalFetched": total,
                "matched": papers.len(),
                "papers": papers,
                "lines": lines,
            }))
        }
        PlazaCmd::Arxiv { query, max, days } => {
            let mut papers = arxiv::search_raw(&query, max)
                .await
                .map_err(AppError::from)?;
            if let Some(days) = days {
                papers = arxiv::within_days(papers, days);
            }
            let item_lines = papers
                .iter()
                .map(|p| {
                    let mut line = format!(
                        "{}  {}",
                        p.date
                            .as_deref()
                            .unwrap_or("          ")
                            .get(..10)
                            .unwrap_or(""),
                        p.title,
                    );
                    if let Some(id) = p.identifiers.arxiv_id.as_deref() {
                        line.push_str(&format!("  arXiv:{id}"));
                    }
                    if let Some(url) = p.urls.landing.as_deref() {
                        line.push_str(&format!("  {url}"));
                    }
                    line
                })
                .collect::<Vec<_>>();
            let mut lines = vec![format!("arxiv  matched {}", papers.len())];
            lines.extend(item_lines);
            Ok(json!({
                "source": "arxiv",
                "matched": papers.len(),
                "papers": papers,
                "lines": lines,
            }))
        }
    }
}
