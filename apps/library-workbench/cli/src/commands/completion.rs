//! `agentero completion` — generate / install shell tab-completion scripts.

use crate::error::CliError;
use crate::resolve::GlobalOpts;
use clap::Command;
use clap_complete::{generate, Shell};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{self, IsTerminal, Write};
use std::path::{Path, PathBuf};

/// Print a completion script, or write it into the user completion directory.
///
/// Returns `None` when the script was written to stdout (caller must not wrap
/// it in the JSON/text envelope). Returns `Some` after `--install`.
pub fn run(
    shell: Shell,
    install: bool,
    bin_name: Option<&str>,
    mut cmd: Command,
    globals: &GlobalOpts,
) -> Result<Option<Value>, CliError> {
    let name = resolve_bin_name(bin_name);
    if install {
        let path = write_install(shell, &name, &mut cmd)?;
        return Ok(Some(install_payload(shell, &name, &path, globals)));
    }
    print_script(shell, &name, &mut cmd, globals)?;
    Ok(None)
}

fn print_script(
    shell: Shell,
    bin_name: &str,
    cmd: &mut Command,
    globals: &GlobalOpts,
) -> Result<(), CliError> {
    generate(shell, cmd, bin_name, &mut io::stdout());
    // A TTY means the user is looking at the script, not sourcing it.
    if !globals.quiet && io::stdout().is_terminal() {
        let _ = writeln!(
            io::stderr(),
            "hint: write this with `{} completion {shell} --install` (does not edit shell rc)",
            invoked_name()
        );
    }
    Ok(())
}

fn write_install(shell: Shell, bin_name: &str, cmd: &mut Command) -> Result<PathBuf, CliError> {
    let path = install_path(shell, bin_name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut buf = Vec::new();
    generate(shell, cmd, bin_name, &mut buf);
    fs::write(&path, buf)?;
    Ok(path)
}

fn install_payload(shell: Shell, bin_name: &str, path: &Path, globals: &GlobalOpts) -> Value {
    let next = next_steps(shell, bin_name, path);
    let style = globals.style;
    let mut lines = vec![format!(
        "{} {}  {}",
        style.ok("installed"),
        shell,
        style.path(&path.display().to_string())
    )];
    lines.extend(next.iter().cloned());
    json!({
        "shell": shell.to_string(),
        "binName": bin_name,
        "path": path.display().to_string(),
        "nextSteps": next,
        "lines": lines,
    })
}

fn resolve_bin_name(explicit: Option<&str>) -> String {
    if let Some(name) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        return name.to_string();
    }
    match invoked_name().as_str() {
        "agentero" | "agentero-cli" => invoked_name(),
        _ if cfg!(windows) => "agentero-cli".into(),
        _ => "agentero".into(),
    }
}

fn invoked_name() -> String {
    env::args_os()
        .next()
        .as_ref()
        .map(Path::new)
        .and_then(Path::file_stem)
        .and_then(|s| s.to_str())
        .unwrap_or("agentero")
        .to_string()
}

fn install_path(shell: Shell, bin_name: &str) -> Result<PathBuf, CliError> {
    let home =
        dirs::home_dir().ok_or_else(|| CliError::message("cannot resolve home directory"))?;
    let path = match shell {
        Shell::Bash => xdg_data_home(&home)
            .join("bash-completion")
            .join("completions")
            .join(bin_name),
        Shell::Elvish => xdg_config_home(&home)
            .join("elvish")
            .join("lib")
            .join(format!("{bin_name}.elv")),
        Shell::Fish => xdg_config_home(&home)
            .join("fish")
            .join("completions")
            .join(format!("{bin_name}.fish")),
        Shell::PowerShell => xdg_config_home(&home)
            .join("powershell")
            .join("Completions")
            .join(format!("{bin_name}.ps1")),
        Shell::Zsh => home.join(".zfunc").join(format!("_{bin_name}")),
        other => {
            return Err(CliError::usage(format!(
                "unsupported shell '{other}' (use bash, zsh, fish, powershell, or elvish)"
            )));
        }
    };
    Ok(path)
}

fn xdg_data_home(home: &Path) -> PathBuf {
    env::var_os("XDG_DATA_HOME")
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local").join("share"))
}

fn xdg_config_home(home: &Path) -> PathBuf {
    env::var_os("XDG_CONFIG_HOME")
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".config"))
}

fn next_steps(shell: Shell, bin_name: &str, path: &Path) -> Vec<String> {
    match shell {
        Shell::Bash => vec![
            "bash-completion 2.8+ loads ~/.local/share/bash-completion/completions automatically"
                .into(),
            "open a new terminal, or: source the file above".into(),
        ],
        Shell::Zsh => vec![
            "add to ~/.zshrc if needed:".into(),
            "  fpath=(~/.zfunc $fpath)".into(),
            "  autoload -Uz compinit && compinit".into(),
            "then open a new terminal".into(),
        ],
        Shell::Fish => vec!["fish loads ~/.config/fish/completions automatically".into()],
        Shell::PowerShell => vec![
            "add to $PROFILE:".into(),
            format!("  . '{}'", path.display()),
        ],
        Shell::Elvish => vec![format!("add to rc.elv:  use {bin_name}")],
        _ => vec![],
    }
}
