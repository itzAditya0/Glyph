mod commands;
mod config;
mod drafts;
mod pdf;
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
    /// "html" or "pdf".
    format: String,
}

/// Parse argv for `glyph export <file> (--html|--pdf) [--output <path>]`.
/// Returns `None` when the user just wants to open files.
fn parse_cli_export(args: &[String]) -> Option<CliExportRequest> {
    // args[0] is the binary path; the first positional is args[1].
    let mut iter = args.iter().skip(1);
    if iter.next()? != "export" {
        return None;
    }

    let mut input: Option<String> = None;
    let mut output: Option<String> = None;
    let mut format: Option<&str> = None;

    while let Some(tok) = iter.next() {
        match tok.as_str() {
            "--html" => format = Some("html"),
            "--pdf" => format = Some("pdf"),
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

    // No format flag means this isn't an export request.
    let format = format?;
    let input = input?;
    let output = output.unwrap_or_else(|| {
        let input_path = PathBuf::from(&input);
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("untitled");
        format!("{stem}.{format}")
    });

    Some(CliExportRequest {
        input,
        output,
        format: format.to_string(),
    })
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
        // `glyph-plugin://<id>/<path>` serves files from a plugin's directory so
        // the frontend can import multi-file plugins with working relative paths.
        .register_uri_scheme_protocol("glyph-plugin", |ctx, request| {
            let app = ctx.app_handle();
            let uri = request.uri();
            let plugin_id = uri.host().unwrap_or("").to_string();
            let path = uri.path().to_string();
            match plugins::serve_plugin_asset(app, &plugin_id, &path) {
                Ok((bytes, mime)) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", mime)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap_or_else(|_| {
                        tauri::http::Response::builder()
                            .status(500)
                            .body(Vec::new())
                            .expect("static 500 response")
                    }),
                Err(err) => {
                    eprintln!("[glyph plugins] {err}");
                    tauri::http::Response::builder()
                        .status(404)
                        .body(err.into_bytes())
                        .expect("static 404 response")
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::save_file,
            config::app_data_dir,
            config::list_themes,
            plugins::list_plugin_manifests,
            drafts::list_drafts,
            drafts::save_draft,
            drafts::delete_draft,
            pdf::html_to_pdf
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
