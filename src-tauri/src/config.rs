//! Resolves and materializes the per-OS app-data directory used for
//! Glyph config, plugins, themes, and session state.
//!
//! v2.0 Stage 1 scaffold — later stages consume this to persist settings
//! (Stages 2, 4, 5), discover plugins (Stage 7), and restore sessions
//! (Stage 6). See V2_Plan.md §2.2.

use std::fs;
use std::path::PathBuf;

use tauri::Manager;

/// Returns the absolute path to `<app-data>/Glyph/` as a string, creating
/// the directory and its `plugins/` + `themes/` subdirectories if missing.
///
/// Sync rather than async because the body only does blocking filesystem
/// work; Tauri handles sync commands on a worker thread without tying up
/// the async runtime.
#[tauri::command]
pub fn app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let root: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;

    let glyph_root = root.join("Glyph");
    let plugins_dir = glyph_root.join("plugins");
    let themes_dir = glyph_root.join("themes");

    for dir in [&glyph_root, &plugins_dir, &themes_dir] {
        fs::create_dir_all(dir)
            .map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
    }

    // `to_string_lossy` degrades gracefully on the (extremely rare) non-UTF-8
    // home directory, which is preferable to failing the entire config layer.
    Ok(glyph_root.to_string_lossy().into_owned())
}
