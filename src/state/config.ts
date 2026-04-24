/**
 * Glyph app config I/O.
 *
 * Stage 1 scaffolding — consumers arrive in Stages 2 (vim), 4 (themes),
 * 5 (sidebar width), 7 (plugins enable map). See V2_Plan.md §2.2.
 *
 * Uses the existing Rust `read_file`/`save_file` commands rooted at the
 * `app_data_dir` command (also Stage 1). No new Tauri plugins required.
 * In non-Tauri contexts (plain `npm run dev`) the helpers return defaults
 * without invoking Rust, so the UI still works during frontend-only dev.
 */

const isTauri = "__TAURI_INTERNALS__" in window;

export interface GlyphConfig {
  schemaVersion: 1;
  /** Plugin id -> enabled flag. Stage 7. */
  pluginsEnabled: Record<string, boolean>;
  /** Filename (without extension) of the active preview theme, or null for default. Stage 4. */
  previewTheme: string | null;
  /** TOC sidebar width in px. Stage 5. */
  sidebarWidth: number;
  /** TOC sidebar open/closed state — persisted across launches. Stage 5. */
  sidebarOpen: boolean;
  /** Vim editor mode flag. Stage 2. */
  vimMode: boolean;
}

export const DEFAULT_CONFIG: GlyphConfig = {
  schemaVersion: 1,
  pluginsEnabled: {},
  previewTheme: null,
  sidebarWidth: 220,
  sidebarOpen: true,
  vimMode: false,
};

async function resolveConfigPath(): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  const root = await invoke<string>("app_data_dir");
  // `app_data_dir` returns an absolute path; `/` separator works on Windows here
  // because Rust `PathBuf` accepts it and we never hand it back to the shell.
  return `${root}/config.json`;
}

function merge(partial: Partial<GlyphConfig> | undefined): GlyphConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(partial ?? {}),
    pluginsEnabled: {
      ...DEFAULT_CONFIG.pluginsEnabled,
      ...(partial?.pluginsEnabled ?? {}),
    },
  };
}

async function writeConfigToDisk(config: GlyphConfig): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await resolveConfigPath();
  await invoke("save_file", { path, content: JSON.stringify(config, null, 2) });
}

export async function loadConfig(): Promise<GlyphConfig> {
  if (!isTauri) return { ...DEFAULT_CONFIG };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await resolveConfigPath();
    const raw = await invoke<string>("read_file", { path });
    const parsed = JSON.parse(raw) as Partial<GlyphConfig>;
    // TODO: once we ship a `schemaVersion: 2`, branch here on
    // `parsed.schemaVersion` to migrate older configs before merging.
    return merge(parsed);
  } catch {
    // Missing or malformed config — seed defaults on disk and return them.
    // We write directly here rather than calling `saveConfig` so a corrupt
    // file can't trigger a read/parse/write loop.
    const fresh = { ...DEFAULT_CONFIG };
    await writeConfigToDisk(fresh).catch(() => {
      // First-run write failure is non-fatal; in-memory defaults still work.
    });
    return fresh;
  }
}

// Serialize saves so concurrent patches don't clobber each other. Each
// `saveConfig` call awaits the previous one, reads current state fresh,
// then merges and writes. Without this, two quick toggles of different
// keys would both read the same "current" and one patch would lose.
let saveQueue: Promise<GlyphConfig | void> = Promise.resolve();

export async function saveConfig(patch: Partial<GlyphConfig>): Promise<GlyphConfig> {
  if (!isTauri) return merge(patch);
  const run = saveQueue.then(async () => {
    const current = await loadConfig();
    const next = merge({ ...current, ...patch });
    await writeConfigToDisk(next);
    return next;
  });
  // Keep the queue alive even if this write rejects.
  saveQueue = run.catch(() => undefined);
  return run;
}
