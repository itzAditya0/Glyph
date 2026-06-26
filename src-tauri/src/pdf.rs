//! HTML-to-PDF conversion for `glyph export <file> --pdf`.
//!
//! v2.1. Glyph keeps a sub-10MB binary, so it does not bundle a PDF
//! engine. Instead it drives a headless Chromium-family browser (Chrome,
//! Chromium, Edge, or Brave) if one is installed, using `--print-to-pdf`.
//! This matches the rendering users already get from the GUI's print path
//! while keeping the conversion entirely offline.
//!
//! If no compatible browser is found, the command returns an error the CLI
//! surfaces with an actionable message.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Candidate browser executables, in preference order. macOS app-bundle
/// paths first, then bare names resolved via PATH (Linux / future).
fn find_browser() -> Option<PathBuf> {
    const MAC_CANDIDATES: &[&str] = &[
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
    for candidate in MAC_CANDIDATES {
        let p = Path::new(candidate);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }

    // PATH-resolved names for non-macOS or custom installs.
    const PATH_CANDIDATES: &[&str] = &[
        "google-chrome-stable",
        "google-chrome",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "brave-browser",
    ];
    for name in PATH_CANDIDATES {
        if let Ok(output) = Command::new("which").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(PathBuf::from(path));
                }
            }
        }
    }
    None
}

/// Render `html` to a PDF at `out_path` via a headless browser.
///
/// The HTML is written to a temp file so the browser can load it over a
/// `file://` URL (needed for the jsDelivr KaTeX stylesheet and any inline
/// SVG). The temp file is removed afterward.
#[tauri::command]
pub fn html_to_pdf(html: String, out_path: String) -> Result<(), String> {
    let browser = find_browser().ok_or_else(|| {
        "No Chromium-based browser found for PDF export. Install Google Chrome, \
         Chromium, Microsoft Edge, or Brave, or export to HTML with --html."
            .to_string()
    })?;

    let mut temp = std::env::temp_dir();
    temp.push(format!(
        "glyph-export-{}.html",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    fs::write(&temp, html).map_err(|e| format!("failed to write temp HTML: {e}"))?;

    let result = Command::new(&browser)
        .arg("--headless=new")
        .arg("--disable-gpu")
        .arg("--no-pdf-header-footer")
        .arg(format!("--print-to-pdf={out_path}"))
        .arg(format!("file://{}", temp.display()))
        .status();

    // Best-effort temp cleanup regardless of outcome.
    let _ = fs::remove_file(&temp);

    match result {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!(
            "{} exited with status {} during PDF export",
            browser.display(),
            status
        )),
        Err(e) => Err(format!("failed to run {}: {e}", browser.display())),
    }
}
