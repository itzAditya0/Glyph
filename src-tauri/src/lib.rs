mod commands;
mod config;
mod plugins;

use std::env;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{Emitter, Manager};

/// Parsed form of the `glyph` subcommand handed to the frontend.
#[derive(Clone, Serialize)]
struct CliExportRequest {
    input: String,
    output: String,
}

/// Parse argv for `glyph export <file> --html [--output <path>]`.
/// Returns `None` when the user just wants to open files.
fn parse_cli_export(args: &[String]) -> Option<CliExportRequest> {
    // args[0] is the binary path; the first positional is args[1].
    let mut iter = args.iter().skip(1);
    if iter.next()? != "export" {
        return None;
    }

    let mut input: Option<String> = None;
    let mut output: Option<String> = None;
    let mut want_html = false;

    while let Some(tok) = iter.next() {
        match tok.as_str() {
            "--html" => want_html = true,
            "--output" | "-o" => {
                if let Some(next) = iter.next() {
                    output = Some(next.clone());
                }
            }
            other if !other.starts_with('-') => {
                if input.is_none() {
                    input = Some(other.to_string());
                }
            }
            other => {
                eprintln!("[glyph cli] ignoring unknown argument: {other}");
            }
        }
    }

    if !want_html {
        // Only --html is supported in v2.0; --pdf lands in a follow-up.
        return None;
    }
    let input = input?;
    let output = output.unwrap_or_else(|| {
        let input_path = PathBuf::from(&input);
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("untitled");
        format!("{stem}.html")
    });

    Some(CliExportRequest { input, output })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Single-instance: if the user runs `glyph <file>` while an existing
    // instance is already running, raise that window and forward the path
    // rather than spawning a second copy. Desktop-only — iOS/Android have
    // their own single-activity model.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
            if let Some(file_path) = argv.get(1) {
                let _ = window.emit("open-file", file_path);
            }
        }
    }));

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::save_file,
            config::app_data_dir,
            config::list_themes,
            plugins::list_plugin_manifests
        ])
        .setup(|app| {
            // First-instance argv. Branch on `export` subcommand vs plain
            // file-to-open. CLI export resolves a relative output path
            // against the invoking cwd (the app's own cwd may differ).
            let args: Vec<String> = env::args().collect();
            if let Some(mut request) = parse_cli_export(&args) {
                if let Ok(cwd) = env::current_dir() {
                    let output = PathBuf::from(&request.output);
                    if output.is_relative() {
                        request.output = cwd.join(output).to_string_lossy().into_owned();
                    }
                    let input = PathBuf::from(&request.input);
                    if input.is_relative() {
                        request.input = cwd.join(input).to_string_lossy().into_owned();
                    }
                }
                if let Some(webview) = app.get_webview_window("main") {
                    let _ = webview.emit("cli-export", &request);
                }
            } else if args.len() > 1 {
                let file_path = args[1].clone();
                if let Some(webview) = app.get_webview_window("main") {
                    let _ = webview.emit("open-file", &file_path);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
