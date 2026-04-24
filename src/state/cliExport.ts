/**
 * CLI export handler.
 *
 * v2.0 Stage 8. When the user runs `glyph export <file> --html`, the Rust
 * side emits a `cli-export` event with the resolved input + output paths.
 * This module performs the render + write + quit entirely from the
 * frontend so the export pipeline matches what the GUI produces,
 * including KaTeX, Mermaid (pre-rendered to inline SVG), and any user
 * theme that was active.
 *
 * Only `--html` is supported in this stage. `--pdf` will arrive with
 * Tauri's headless print-to-PDF API wired up in a later minor.
 */

import DOMPurify from "dompurify";
import { md, ensureShikiReady } from "../hooks/useMarkdown";
import { buildHtmlDocument } from "../utils/exportHtml";
import { prerenderMermaid } from "../utils/mermaidRender";
import { findTheme, listThemes } from "./themes";
import { loadConfig } from "./config";
import { activatePlugin, scanInstalledPlugins } from "./plugins";

interface CliExportRequest {
  input: string;
  output: string;
}

/**
 * Render the input markdown through the full GUI pipeline (Shiki + KaTeX +
 * Mermaid + active theme + plugins) and write the resulting self-contained
 * HTML to `output`, then exit the process. Errors log to stderr and exit
 * with a non-zero status so shell scripts can react.
 *
 * Register this as a one-shot Tauri event listener at app startup.
 */
export async function runCliExport(request: CliExportRequest): Promise<never> {
  const { invoke } = await import("@tauri-apps/api/core");
  const exit = async (code: number): Promise<never> => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    } catch {
      // Fallback when window API is unavailable — the process will exit
      // when the Tauri runtime tears down.
    }
    throw new Error(`cli export exited with code ${code}`);
  };

  try {
    // Bring plugins online so users' fence renderers apply to the export.
    const manifests = await scanInstalledPlugins();
    for (const m of manifests) {
      if (m.enabled) {
        await activatePlugin(m).catch(() => undefined);
      }
    }

    // Make sure Shiki's grammar tables are loaded before the first render —
    // the GUI normally handles this across async state, but here we have one
    // synchronous shot.
    await ensureShikiReady();

    const source = await invoke<string>("read_file", { path: request.input });
    const rendered = md.render(source);
    const sanitized = DOMPurify.sanitize(rendered, { ALLOW_DATA_ATTR: true });
    const withDiagrams = await prerenderMermaid(sanitized, "cli");

    // Resolve the active theme (if any) and inline it so the exported file
    // matches the GUI's preview appearance.
    const [cfg, themes] = await Promise.all([loadConfig(), listThemes()]);
    const activeTheme = findTheme(themes, cfg.previewTheme);

    const baseName =
      request.input.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ??
      "untitled";

    const doc = buildHtmlDocument(withDiagrams, baseName, "light", activeTheme?.css ?? null);
    await invoke("save_file", { path: request.output, content: doc });

    console.log(`[glyph cli] wrote ${request.output}`);
    return exit(0);
  } catch (err) {
    console.error("[glyph cli] export failed:", err);
    return exit(3);
  }
}
