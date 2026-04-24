//! Plugin-manifest discovery.
//!
//! v2.0 Stage 7 (JS tier). Walks `<app-data>/Glyph/plugins/<id>/manifest.json`
//! and returns the raw JSON plus the absolute directory path for each
//! plugin. Validation and the JS API surface live in the frontend
//! (`src/state/plugins.ts`) so manifest-shape evolution doesn't require
//! a binary rebuild.
//!
//! Plugin *code* is loaded by the frontend via a blob-URL dynamic import
//! seeded from `entry` in the manifest, so this scanner only needs to
//! expose the directory path — the frontend resolves `entry` relative
//! to it.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::Manager;

/// One entry per discovered plugin directory.
#[derive(Serialize)]
pub struct PluginManifestEntry {
    /// Absolute path to the plugin folder (the manifest's parent).
    pub manifest_dir: String,
    /// Raw JSON of `manifest.json`. The frontend parses + validates.
    pub raw_json: String,
    /// Raw contents of the JS entry point (if `entry` is present and readable).
    /// Pre-loaded here so the frontend can hand it to a Blob URL without
    /// another round-trip through `read_file`.
    pub entry_source: Option<String>,
}

#[tauri::command]
pub fn list_plugin_manifests(app: tauri::AppHandle) -> Result<Vec<PluginManifestEntry>, String> {
    let root: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    let plugins_dir = root.join("Glyph").join("plugins");

    if !plugins_dir.exists() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    let entries = fs::read_dir(&plugins_dir)
        .map_err(|e| format!("failed to read plugins dir {}: {e}", plugins_dir.display()))?;

    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let manifest_path = dir.join("manifest.json");
        if !manifest_path.is_file() {
            continue;
        }
        let raw_json = match fs::read_to_string(&manifest_path) {
            Ok(s) => s,
            Err(err) => {
                eprintln!(
                    "[glyph plugins] skipping {}: manifest read failed: {err}",
                    manifest_path.display(),
                );
                continue;
            }
        };

        // Best-effort pre-read of the entry file. If the manifest doesn't
        // declare one or the read fails, `entry_source` stays `None` and
        // the frontend logs a clearer rejection with the manifest's id.
        let entry_source = fs::read_to_string(&manifest_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|v| v.get("entry").and_then(|e| e.as_str()).map(String::from))
            .and_then(|entry| fs::read_to_string(dir.join(&entry)).ok());

        out.push(PluginManifestEntry {
            manifest_dir: dir.to_string_lossy().into_owned(),
            raw_json,
            entry_source,
        });
    }

    out.sort_by(|a, b| a.manifest_dir.cmp(&b.manifest_dir));
    Ok(out)
}
