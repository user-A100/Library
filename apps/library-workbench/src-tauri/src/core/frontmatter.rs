//! Minimal YAML frontmatter reading for `SKILL.md`-style documents.
//!
//! Skills in the wild write `description: >-` folded blocks and CRLF line
//! endings, so reading the text after `description:` on a single line yields
//! `>-` instead of the description.

pub fn frontmatter_block(content: &str) -> Option<&str> {
    let rest = content
        .strip_prefix("---\n")
        .or_else(|| content.strip_prefix("---\r\n"))?;
    rest.split_once("\n---").map(|(block, _)| block)
}

/// Read a top-level scalar field, resolving quotes, block scalars (`>` / `|`)
/// and plain multi-line continuations. Nested keys are ignored.
pub fn scalar_field(frontmatter: &str, key: &str) -> Option<String> {
    let lines: Vec<&str> = frontmatter
        .lines()
        .map(|line| line.trim_end_matches('\r'))
        .collect();
    let prefix = format!("{key}:");
    for (index, line) in lines.iter().enumerate() {
        if line.starts_with([' ', '\t']) {
            continue;
        }
        let Some(value) = line.strip_prefix(prefix.as_str()) else {
            continue;
        };
        let continuation: Vec<&str> = lines[index + 1..]
            .iter()
            .copied()
            .take_while(|line| line.trim().is_empty() || line.starts_with([' ', '\t']))
            .collect();
        let value = value.trim();
        let resolved = match value.chars().next() {
            Some('>') => fold_block(&continuation, false),
            Some('|') => fold_block(&continuation, true),
            None => fold_block(&continuation, false),
            _ => {
                let mut text = value.to_string();
                for line in continuation
                    .iter()
                    .map(|line| line.trim())
                    .filter(|line| !line.is_empty())
                {
                    text.push(' ');
                    text.push_str(line);
                }
                unquote(text.trim()).to_string()
            }
        };
        let resolved = resolved.trim().to_string();
        return (!resolved.is_empty()).then_some(resolved);
    }
    None
}

fn fold_block(lines: &[&str], literal: bool) -> String {
    let indent = lines
        .iter()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.len() - line.trim_start().len())
        .min()
        .unwrap_or(0);
    let mut out = String::new();
    for line in lines {
        let text = if line.len() >= indent {
            &line[indent..]
        } else {
            line.trim_start()
        };
        if literal {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(text);
        } else if text.trim().is_empty() {
            out.push('\n');
        } else {
            if !out.is_empty() && !out.ends_with('\n') {
                out.push(' ');
            }
            out.push_str(text.trim());
        }
    }
    out
}

fn unquote(value: &str) -> &str {
    let bytes = value.as_bytes();
    let quoted = bytes.len() >= 2
        && (bytes[0] == b'"' || bytes[0] == b'\'')
        && bytes[bytes.len() - 1] == bytes[0];
    if quoted {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_plain_and_quoted_scalars() {
        let block = frontmatter_block("---\nname: example\ndescription: \"Do things\"\n---\nBody")
            .expect("frontmatter");
        assert_eq!(scalar_field(block, "name").as_deref(), Some("example"));
        assert_eq!(
            scalar_field(block, "description").as_deref(),
            Some("Do things")
        );
    }

    #[test]
    fn folds_block_scalars_and_ignores_nested_keys() {
        let content = "---\nname: paper-reader\nversion: 2\ndescription: >-\n  Read and explain a\n  research paper.\nmetadata:\n  description: nested value\n---\n# Body";
        let block = frontmatter_block(content).expect("frontmatter");
        assert_eq!(
            scalar_field(block, "description").as_deref(),
            Some("Read and explain a research paper.")
        );
        assert_eq!(scalar_field(block, "version").as_deref(), Some("2"));
    }

    #[test]
    fn keeps_literal_block_newlines() {
        let block = frontmatter_block("---\ndescription: |\n  first\n  second\n---\n").unwrap();
        assert_eq!(
            scalar_field(block, "description").as_deref(),
            Some("first\nsecond")
        );
    }

    #[test]
    fn reads_crlf_frontmatter() {
        let block = frontmatter_block("---\r\nname: crlf-skill\r\n---\r\nBody").unwrap();
        assert_eq!(scalar_field(block, "name").as_deref(), Some("crlf-skill"));
    }

    #[test]
    fn joins_multi_line_plain_scalars() {
        let block = frontmatter_block("---\ndescription: \"one\n  two\"\n---\n").unwrap();
        assert_eq!(
            scalar_field(block, "description").as_deref(),
            Some("one two")
        );
    }

    #[test]
    fn missing_frontmatter_yields_none() {
        assert!(frontmatter_block("# Body only").is_none());
    }
}
