/**
 * Plugin manifest discovery.
 *
 * Stage 1 scaffold — actual plugin loading, activation, and the
 * `PluginContext` API surface land in Stage 7 (see V2_Plan.md §4).
 *
 * Today this module exposes the types and a stub `scanInstalledPlugins`
 * that returns `[]` in environments without a directory-listing command.
 * Stage 7 will add a `list_dir` Rust command (or adopt `tauri-plugin-fs`)
 * and wire this scanner to walk `<app-data>/Glyph/plugins/<id>/manifest.json`.
 */

/** Major API version the app supports. Plugins declare a compatible version via `glyphApi`. */
export const GLYPH_API_MAJOR = 1;

export interface PluginManifest {
  /** Reverse-DNS unique id. */
  id: string;
  name: string;
  version: string;
  /** Plugin's targeted Glyph API version, e.g. "1.0". */
  glyphApi: string;
  /** JS entry relative to the manifest directory. Absent for Rust-only plugins. */
  entry?: string;
  /** Native library path; platform suffix resolved at load time. */
  rustEntry?: string;
  /** Informational capability list shown in settings; not enforced. */
  declaredCapabilities: string[];
  contributes: {
    markdownRenderers?: string[];
    commands?: Array<{ id: string; title: string }>;
    panels?: Array<{ id: string; location: "left" | "right" | "bottom"; title: string }>;
  };
  /**
   * Resolved at scan time, not present on disk.
   * Absolute path with OS-native separators (the scanner derives this
   * from the manifest's `.../plugins/<id>/manifest.json` location).
   */
  manifestDir: string;
  /** Resolved by merging with `config.pluginsEnabled`. */
  enabled: boolean;
}

const isTauri = "__TAURI_INTERNALS__" in window;

/**
 * Validate a parsed manifest object. Returns the manifest or `null` if
 * any required field is missing / malformed. Caller logs rejections.
 */
export function validateManifest(
  raw: unknown,
  manifestDir: string,
): Omit<PluginManifest, "enabled"> | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;

  const requiredStrings: Array<keyof PluginManifest> = ["id", "name", "version", "glyphApi"];
  for (const key of requiredStrings) {
    if (typeof m[key] !== "string" || (m[key] as string).length === 0) {
      return null;
    }
  }

  const apiMajor = parseInt(String(m.glyphApi).split(".")[0], 10);
  if (Number.isNaN(apiMajor) || apiMajor > GLYPH_API_MAJOR) {
    return null;
  }

  const caps = Array.isArray(m.declaredCapabilities)
    ? (m.declaredCapabilities as unknown[]).filter((c): c is string => typeof c === "string")
    : [];

  const contributes = (m.contributes as PluginManifest["contributes"]) ?? {};

  return {
    id: String(m.id),
    name: String(m.name),
    version: String(m.version),
    glyphApi: String(m.glyphApi),
    entry: typeof m.entry === "string" ? m.entry : undefined,
    rustEntry: typeof m.rustEntry === "string" ? m.rustEntry : undefined,
    declaredCapabilities: caps,
    contributes,
    manifestDir,
  };
}

/**
 * Walk `<app-data>/Glyph/plugins/*\/manifest.json` and return validated manifests.
 *
 * Stage 1: returns `[]` when the backing directory-listing command is not
 * yet available. Stage 7 will replace this body with the real scanner.
 */
export async function scanInstalledPlugins(): Promise<PluginManifest[]> {
  if (!isTauri) return [];
  // Stage 7 will add a `list_plugin_manifests` Rust command that returns
  // `[{ manifestDir, rawJson }]`; this function will then map that list
  // through `validateManifest` and merge enabled state from `loadConfig`.
  return [];
}
