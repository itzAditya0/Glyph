//! Resolves and materializes the per-OS app-data directory used for
//! Glyph config, plugins, themes, and session state.
//!
//! v2.0 Stage 1 scaffold — later stages consume this to persist settings
//! (Stages 2, 4, 5), discover plugins (Stage 7), and restore sessions
//! (Stage 6). See V2_Plan.md §2.2.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::Manager;

/// A user-supplied preview theme discovered under `<app-data>/Glyph/themes/`.
#[derive(Serialize)]
pub struct ThemeEntry {
    /// Filename without the `.css` extension — used as both label and config key.
    pub name: String,
    /// Raw CSS content, ready to be injected into a `<style>` tag.
    pub css: String,
}

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

/// Discover `*.css` files under `<app-data>/Glyph/themes/` and return their
/// contents. Each file is one theme; filename (sans `.css`) is the theme
/// name shown in Settings and stored in `config.json` under `previewTheme`.
///
/// Unreadable files are skipped with a logged warning rather than aborting
/// the whole scan — a broken theme should not prevent other themes from
/// loading.
#[tauri::command]
pub fn list_themes(app: tauri::AppHandle) -> Result<Vec<ThemeEntry>, String> {
    let root: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    let themes_dir = root.join("Glyph").join("themes");

    // Missing dir is not an error — Glyph may be installed but the themes
    // directory hasn't been created yet (first launch before any invoke
    // materializes it). Return an empty list.
    if !themes_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&themes_dir)
        .map_err(|e| format!("failed to read themes dir {}: {e}", themes_dir.display()))?;

    let mut themes = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("css") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        match fs::read_to_string(&path) {
            Ok(css) => themes.push(ThemeEntry {
                name: stem.to_string(),
                css,
            }),
            Err(err) => {
                eprintln!("[glyph] skipping theme {}: {err}", path.display());
            }
        }
    }

    themes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(themes)
}
