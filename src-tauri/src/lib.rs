mod commands;
mod config;

use tauri::{Emitter, Manager};

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
            config::list_themes
        ])
        .setup(|app| {
            // First-instance argv: emit open-file for the first file argument so
            // the frontend's listener opens it in a tab. The same event is used
            // for macOS file associations (Finder double-click) and drag-drop.
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
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
