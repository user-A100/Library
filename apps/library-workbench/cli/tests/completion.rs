//! Shell completion generation / install.

use assert_cmd::cargo::cargo_bin_cmd;
use predicates::prelude::*;
use serde_json::Value;
use std::fs;
use tempfile::tempdir;

fn agentero() -> assert_cmd::Command {
    cargo_bin_cmd!("agentero-cli")
}

#[test]
fn completion_zsh_prints_raw_script() {
    let out = agentero()
        .args(["completion", "zsh", "--bin-name", "agentero"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let script = String::from_utf8(out).unwrap();
    assert!(
        script.contains("#compdef agentero") || script.contains("compdef agentero"),
        "zsh script should define agentero:\n{script}"
    );
    assert!(
        !script.contains("\"ok\""),
        "completion stdout must stay a raw script, not a JSON envelope"
    );
}

#[test]
fn completion_bash_lists_subcommands() {
    let out = agentero()
        .args(["completion", "bash", "--bin-name", "agentero"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let script = String::from_utf8(out).unwrap();
    assert!(script.contains("paper"));
    assert!(script.contains("vault"));
    assert!(script.contains("completion"));
}

#[test]
fn completion_json_flag_still_prints_raw_script() {
    let out = agentero()
        .args(["--json", "completion", "fish", "--bin-name", "agentero"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let script = String::from_utf8(out).unwrap();
    assert!(script.contains("complete") || script.contains("agentero"));
    assert!(!script.trim_start().starts_with('{'));
}

#[test]
fn completion_unknown_shell_fails() {
    agentero()
        .args(["completion", "noshell"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("bash").or(predicate::str::contains("invalid")));
}

#[test]
fn completion_install_bash_writes_xdg_file() {
    let tmp = tempdir().unwrap();
    let home = tmp.path();
    let data = home.join("share");
    let out = agentero()
        .env("HOME", home)
        .env("XDG_DATA_HOME", &data)
        .args([
            "completion",
            "bash",
            "--install",
            "--bin-name",
            "agentero",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let v: Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["data"]["shell"], "bash");
    assert_eq!(v["data"]["binName"], "agentero");
    let path = v["data"]["path"].as_str().unwrap();
    assert!(path.ends_with("bash-completion/completions/agentero"));
    let script = fs::read_to_string(path).unwrap();
    assert!(script.contains("agentero"));
}

#[test]
fn help_lists_completion() {
    agentero()
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("completion"));
}
