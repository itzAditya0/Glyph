//! Crash-safe draft persistence for unsaved tab content.
//!
//! v2.1. Each dirty tab (an Untitled buffer or a saved file with unsaved
//! edits) is written to `<app-data>/Glyph/drafts/<key>.json` on a debounce.
//! On launch the frontend reads them back and recovers the content. The
//! frontend owns the JSON shape; these commands only move bytes and manage
//! the directory.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::Manager;

/// One stored draft: the filename stem (the tab's session id) plus raw JSON.
#[derive(Serialize)]
pub struct DraftEntry {
    pub key: String,
    pub json: String,
}

fn drafts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    Ok(root.join("Glyph").join("drafts"))
}

/// Read every `*.json` file under the drafts directory.
#[tauri::command]
pub fn list_drafts(app: tauri::AppHandle) -> Result<Vec<DraftEntry>, String> {
    let dir = drafts_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("failed to read drafts dir {}: {e}", dir.display()))?;

    let mut drafts = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        match fs::read_to_string(&path) {
            Ok(json) => drafts.push(DraftEntry {
                key: stem.to_string(),
                json,
            }),
            Err(err) => eprintln!("[glyph drafts] skipping {}: {err}", path.display()),
        }
    }
    Ok(drafts)
}

/// Write (or overwrite) a single draft. Creates the directory on first use.
#[tauri::command]
pub fn save_draft(app: tauri::AppHandle, key: String, json: String) -> Result<(), String> {
    let dir = drafts_dir(&app)?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create drafts dir {}: {e}", dir.display()))?;
    let path = dir.join(sanitize_key(&key));
    fs::write(&path, json).map_err(|e| format!("failed to write draft {}: {e}", path.display()))
}

/// Delete a single draft by key. Missing file is not an error.
#[tauri::command]
pub fn delete_draft(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let dir = drafts_dir(&app)?;
    let path = dir.join(sanitize_key(&key));
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("failed to delete draft {}: {e}", path.display()))?;
    }
    Ok(())
}

/// Map a draft key to a safe `<key>.json` filename. Strips path separators so
/// a hostile or malformed key can't escape the drafts directory.
fn sanitize_key(key: &str) -> String {
    let cleaned: String = key
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    format!("{cleaned}.json")
}
