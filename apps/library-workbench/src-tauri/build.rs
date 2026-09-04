use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    if env::var_os("CARGO_FEATURE_DESKTOP").is_some() {
        tauri_build::build();
    }
    forward_posthog_key();
    generate_onboarding_templates();
}

/// Bake the PostHog project API key into the binary at compile time.
/// An explicit `AGENTERO_POSTHOG_KEY` env var wins; otherwise fall back to
/// the repo-root `.env` (gitignored). Absent both, telemetry compiles out.
fn forward_posthog_key() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dotenv = manifest_dir.join("../.env");
    println!("cargo:rerun-if-env-changed=AGENTERO_POSTHOG_KEY");
    println!("cargo:rerun-if-changed={}", dotenv.display());
    if env::var("AGENTERO_POSTHOG_KEY").is_ok() {
        return;
    }
    let Ok(content) = fs::read_to_string(&dotenv) else {
        return;
    };
    for line in content.lines() {
        let Some(value) = line
            .trim()
            .strip_prefix("AGENTERO_POSTHOG_KEY=")
            .map(str::trim)
            .filter(|v| !v.is_empty())
        else {
            continue;
        };
        println!("cargo:rustc-env=AGENTERO_POSTHOG_KEY={value}");
        return;
    }
}

fn generate_onboarding_templates() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let notes_root = manifest_dir.join("../templates/vault/notes");
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR is set by Cargo"));
    let generated = out_dir.join("onboarding_templates.rs");

    println!("cargo:rerun-if-changed={}", notes_root.display());

    let mut entries = Vec::new();
    let locales = fs::read_dir(&notes_root)
        .unwrap_or_else(|e| panic!("read onboarding notes directory: {e}"))
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect::<Vec<_>>();

    for locale_dir in locales {
        let locale = locale_dir.file_name().to_string_lossy().into_owned();
        let mut files = fs::read_dir(locale_dir.path())
            .unwrap_or_else(|e| panic!("read onboarding locale {locale}: {e}"))
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.path().is_file() && entry.path().extension().is_some_and(|ext| ext == "md")
            })
            .collect::<Vec<_>>();
        files.sort_by_key(|entry| entry.file_name());

        for file in files {
            let filename = file.file_name().to_string_lossy().into_owned();
            // Keep the selected locale in the embedded entry, but flatten the
            // generated Vault paths so onboarding notes live directly in notes/.
            let rel = format!("notes/{filename}");
            let path = file.path();
            entries.push((locale.clone(), rel, path));
        }
    }

    entries.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

    let mut source =
        String::from("pub(crate) static BUNDLED_ONBOARDING_FILES: &[(&str, &str, &str)] = &[\n");
    for (locale, rel, path) in entries {
        source.push_str(&format!(
            "    ({:?}, {:?}, include_str!({:?})),\n",
            locale,
            rel,
            path.to_string_lossy().to_string()
        ));
    }
    source.push_str("];\n");

    fs::write(generated, source).expect("write generated onboarding templates");
}
