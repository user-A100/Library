//! ANSI styling for human text output.
//!
//! JSON mode never uses this module. Text mode only paints when
//! [`Style::enabled`] is true (`--color always`, or `auto` + TTY, and not
//! `NO_COLOR` / `--color never`).

use std::fmt::Write as _;
use std::io::{self, IsTerminal};

/// Resolved paint switch for one CLI invocation.
#[derive(Debug, Clone, Copy)]
pub struct Style {
    enabled: bool,
}

impl Style {
    pub fn new(enabled: bool) -> Self {
        Self { enabled }
    }

    pub fn enabled(self) -> bool {
        self.enabled
    }

    /// Resolve from CLI `--color` + env + whether stdout is a TTY.
    pub fn from_when(when: ColorWhen) -> Self {
        let enabled = match when {
            ColorWhen::Always => true,
            ColorWhen::Never => false,
            ColorWhen::Auto => {
                if std::env::var_os("NO_COLOR").is_some() {
                    false
                } else if matches!(
                    std::env::var("CLICOLOR_FORCE").as_deref(),
                    Ok(v) if v != "0" && !v.is_empty()
                ) {
                    true
                } else if matches!(std::env::var("CLICOLOR").as_deref(), Ok("0")) {
                    false
                } else {
                    io::stdout().is_terminal()
                }
            }
        };
        Self { enabled }
    }

    fn paint(self, code: &str, s: &str) -> String {
        if !self.enabled || s.is_empty() {
            return s.to_string();
        }
        format!("\x1b[{code}m{s}\x1b[0m")
    }

    pub fn bold(self, s: &str) -> String {
        self.paint("1", s)
    }

    pub fn dim(self, s: &str) -> String {
        self.paint("2", s)
    }

    pub fn cyan(self, s: &str) -> String {
        self.paint("36", s)
    }

    pub fn bright_red(self, s: &str) -> String {
        self.paint("91", s)
    }

    pub fn bright_green(self, s: &str) -> String {
        self.paint("92", s)
    }

    pub fn bright_yellow(self, s: &str) -> String {
        self.paint("93", s)
    }

    pub fn bright_blue(self, s: &str) -> String {
        self.paint("94", s)
    }

    pub fn bright_magenta(self, s: &str) -> String {
        self.paint("95", s)
    }

    /// Header / column label.
    pub fn header(self, s: &str) -> String {
        self.bold(s)
    }

    /// Vault-relative path (secondary).
    pub fn path(self, s: &str) -> String {
        self.cyan(s)
    }

    /// Paper id.
    pub fn id(self, s: &str) -> String {
        self.dim(s)
    }

    /// Primary title text.
    pub fn title(self, s: &str) -> String {
        s.to_string()
    }

    /// Read / unread badge.
    pub fn read_status(self, is_read: bool) -> String {
        if is_read {
            self.dim("read")
        } else {
            self.bright_yellow("unread")
        }
    }

    /// Directory name in `tree`.
    pub fn dir(self, s: &str) -> String {
        // bold + bright blue in one SGR (avoid nested reset).
        self.paint("1;94", s)
    }

    /// File name in `tree`.
    pub fn file(self, s: &str) -> String {
        s.to_string()
    }

    /// Success / ok line.
    pub fn ok(self, s: &str) -> String {
        self.bright_green(s)
    }

    /// Error prefix for stderr.
    pub fn error_label(self, s: &str) -> String {
        self.bright_red(&self.bold(s))
    }

    /// Key in `key=value` style lines.
    pub fn key(self, s: &str) -> String {
        self.dim(s)
    }

    /// Apple 8-color palette ids (same as desktop Paper Info).
    const TAG_PALETTE: &'static [&'static str] = &[
        "red", "orange", "yellow", "green", "teal", "blue", "indigo", "purple",
    ];

    /// Apple-palette tag chip.
    ///
    /// Uses catalog `color` when set; otherwise a **stable display-only** default
    /// derived from the tag name (same name → same color across list/get/tag list).
    /// Does not write back to catalog.
    pub fn tag(self, name: &str, color: Option<&str>) -> String {
        if name.is_empty() {
            return String::new();
        }
        let id = color
            .map(str::trim)
            .filter(|c| !c.is_empty())
            .filter(|c| Self::TAG_PALETTE.iter().any(|p| p.eq_ignore_ascii_case(c)))
            .map(|c| c.to_ascii_lowercase())
            .unwrap_or_else(|| default_tag_color_id(name).to_string());
        self.paint_tag_color(name, &id)
    }

    fn paint_tag_color(self, name: &str, id: &str) -> String {
        match id {
            "red" => self.bright_red(name),
            "orange" => self.paint("38;5;208", name),
            "yellow" => self.bright_yellow(name),
            "green" => self.bright_green(name),
            "teal" => self.cyan(name),
            "blue" => self.bright_blue(name),
            "indigo" => self.paint("38;5;63", name),
            "purple" => self.bright_magenta(name),
            _ => self.bright_blue(name),
        }
    }

    /// Comma-separated colored tags.
    pub fn tags_join<'a>(
        self,
        tags: impl IntoIterator<Item = (&'a str, Option<&'a str>)>,
    ) -> String {
        let parts: Vec<String> = tags
            .into_iter()
            .filter(|(n, _)| !n.is_empty())
            .map(|(n, c)| self.tag(n, c))
            .collect();
        if parts.is_empty() {
            return self.dim("-");
        }
        parts.join(&self.dim(","))
    }
}

/// Stable default palette id for uncolored tags (display only).
///
/// Case-insensitive hash so `NLP` and `nlp` get the same default chip color.
fn default_tag_color_id(name: &str) -> &'static str {
    let mut h: u32 = 2166136261;
    for b in name.trim().bytes() {
        let b = if b.is_ascii_uppercase() { b + 32 } else { b };
        h ^= u32::from(b);
        h = h.wrapping_mul(16777619);
    }
    let palette = Style::TAG_PALETTE;
    palette[(h as usize) % palette.len()]
}

/// Mirrors CLI `--color` without depending on clap here.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorWhen {
    Auto,
    Always,
    Never,
}

/// Visible width ignoring ANSI CSI sequences (for column padding).
pub fn visible_width(s: &str) -> usize {
    let mut w = 0usize;
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for x in chars.by_ref() {
                    if x.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        w += 1;
    }
    w
}

/// Pad `s` on the right to at least `width` visible columns.
pub fn pad_right(s: &str, width: usize) -> String {
    let vis = visible_width(s);
    if vis >= width {
        return s.to_string();
    }
    let mut out = s.to_string();
    out.extend(std::iter::repeat_n(' ', width - vis));
    out
}

/// Truncate by visible chars (ANSI-safe enough for plain input).
pub fn truncate_chars(s: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    let count = s.chars().count();
    if count <= max {
        return s.to_string();
    }
    let t: String = s.chars().take(max.saturating_sub(1)).collect();
    format!("{t}…")
}

/// Build a simple aligned table: first row is header.
pub fn format_table(style: Style, headers: &[&str], rows: &[Vec<String>]) -> Vec<String> {
    if headers.is_empty() {
        return Vec::new();
    }
    let cols = headers.len();
    let mut widths: Vec<usize> = headers.iter().map(|h| visible_width(h)).collect();
    for row in rows {
        for (i, cell) in row.iter().enumerate().take(cols) {
            widths[i] = widths[i].max(visible_width(cell));
        }
    }
    // Cap very wide path/title columns a bit via caller truncation; here only pad.

    let mut lines = Vec::with_capacity(rows.len() + 2);
    let mut header_line = String::new();
    for (i, h) in headers.iter().enumerate() {
        if i > 0 {
            header_line.push_str("  ");
        }
        let _ = write!(header_line, "{}", pad_right(&style.header(h), widths[i]));
    }
    lines.push(header_line);

    let mut rule = String::new();
    for (i, w) in widths.iter().enumerate() {
        if i > 0 {
            rule.push_str("  ");
        }
        rule.push_str(&style.dim(&"-".repeat(*w)));
    }
    lines.push(rule);

    for row in rows {
        let mut line = String::new();
        for (i, width) in widths.iter().enumerate().take(cols) {
            if i > 0 {
                line.push_str("  ");
            }
            let cell = row.get(i).map(String::as_str).unwrap_or("");
            let _ = write!(line, "{}", pad_right(cell, *width));
        }
        lines.push(line);
    }
    lines
}
