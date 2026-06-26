/**
 * Plugin discovery, activation, and the host-side registries plugins
 * contribute to.
 *
 * v2.0 Stage 7 ships a focused JS tier: plugins drop into
 * `<app-data>/Glyph/plugins/<id>/`, each has a `manifest.json` and a
 * JS `entry` file, and the only contribution type they can register is
 * a markdown fence renderer (`ctx.markdown.registerRenderer(lang, fn)`).
 * Commands, UI panels, and the Rust tier land in v2.1.
 *
 * Plugin code is executed by importing a blob URL seeded from the
 * manifest's `entry` file contents, which the Rust scanner already
 * pre-reads to save a round-trip. This works for single-file plugins;
 * multi-file plugins needing relative imports will arrive with a
 * custom Tauri URI scheme in a follow-up.
 *
 * The host does NOT sandbox plugins. Following the Obsidian model, if
 * a plugin is enabled it is trusted; disabling is the trust control
 * (Settings → Plugins). `declaredCapabilities` is informational.
 */

import { loadConfig, saveConfig } from "./config";

/** Major API version the host supports. Plugins targeting a larger major are rejected. */
export const GLYPH_API_MAJOR = 1;

const isTauri = "__TAURI_INTERNALS__" in window;

// -------- Manifest types --------

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  glyphApi: string;
  entry?: string;
  declaredCapabilities: string[];
  contributes: {
    markdownRenderers?: string[];
  };
  manifestDir: string;
  enabled: boolean;
  /** Populated by the scanner when `entry` is present and readable. */
  entrySource: string | null;
}

interface RawManifestEntry {
  manifestDir: string;
  rawJson: string;
  entrySource: string | null;
}

function validateManifest(
  parsed: unknown,
  manifestDir: string,
): Omit<PluginManifest, "enabled" | "entrySource"> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const m = parsed as Record<string, unknown>;

  const required: Array<keyof PluginManifest> = ["id", "name", "version", "glyphApi"];
  for (const key of required) {
    if (typeof m[key] !== "string" || (m[key] as string).length === 0) return null;
  }

  const majorStr = String(m.glyphApi).split(".")[0];
  const major = parseInt(majorStr, 10);
  if (Number.isNaN(major) || major > GLYPH_API_MAJOR) return null;

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
    declaredCapabilities: caps,
    contributes,
    manifestDir,
  };
}

// -------- Host-side registries --------

export type MarkdownRenderer = (source: string) => string;

const markdownRenderers = new Map<string, { pluginId: string; fn: MarkdownRenderer }>();

/**
 * Look up a fence renderer by language (`info` string from markdown-it).
 * Used by the custom fence rule in `useMarkdown.ts` to give plugins a
 * chance before Shiki syntax-highlights the block.
 */
export function getMarkdownRenderer(lang: string): MarkdownRenderer | null {
  return markdownRenderers.get(lang)?.fn ?? null;
}

// -------- Command + panel registries --------

export interface PluginCommand {
  id: string;
  title: string;
  pluginId: string;
  run: () => void | Promise<void>;
}

const commands = new Map<string, PluginCommand>();

/** All registered commands, for the command palette. */
export function getCommands(): PluginCommand[] {
  return [...commands.values()];
}

/** Run a registered command by id. */
export async function runCommand(id: string): Promise<void> {
  const command = commands.get(id);
  if (!command) return;
  try {
    await command.run();
  } catch (err) {
    console.error(`[glyph plugins] command "${id}" threw:`, err);
  }
}

export interface PluginPanel {
  id: string;
  title: string;
  pluginId: string;
  /** Populate the given container with the panel's DOM. May return a cleanup fn. */
  mount: (container: HTMLElement) => void | (() => void);
}

const panels = new Map<string, PluginPanel>();

/** All registered panels, for the panel dock. */
export function getPanels(): PluginPanel[] {
  return [...panels.values()];
}

// -------- Plugin context (the surface plugins see) --------

export interface PluginContext {
  markdown: {
    /**
     * Register a renderer for `\`\`\`lang` fences. The function receives the
     * raw fence content and returns the HTML that should replace it. Host
     * sanitizes the result in `Preview` before it reaches the DOM.
     */
    registerRenderer: (lang: string, fn: MarkdownRenderer) => void;
  };
  commands: {
    /** Register a command surfaced in the command palette (Cmd/Ctrl+Shift+P). */
    register: (id: string, title: string, run: () => void | Promise<void>) => void;
  };
  ui: {
    /**
     * Register a side panel. `mount` receives a container element to populate
     * with DOM and may return a cleanup function called on deactivate.
     */
    registerPanel: (
      panel: { id: string; title: string; mount: (container: HTMLElement) => void | (() => void) },
    ) => void;
  };
}

export interface ActivatedPlugin {
  manifest: PluginManifest;
  /** Plugin-provided `deactivate` function (if exported). */
  deactivate?: () => void | Promise<void>;
  /** Keys registered by this plugin, used for clean teardown. */
  registered: {
    markdownLangs: string[];
    commandIds: string[];
    panelIds: string[];
  };
  /** Object URL to revoke on deactivate (single-file blob fallback only). */
  blobUrl: string | null;
}

const activePlugins = new Map<string, ActivatedPlugin>();

// -------- Discovery --------

export async function scanInstalledPlugins(): Promise<PluginManifest[]> {
  if (!isTauri) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const [entries, config] = await Promise.all([
      invoke<RawManifestEntry[]>("list_plugin_manifests"),
      loadConfig(),
    ]);

    const manifests: PluginManifest[] = [];
    for (const entry of entries) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(entry.rawJson);
      } catch (err) {
        console.warn(`[glyph plugins] malformed manifest in ${entry.manifestDir}:`, err);
        continue;
      }
      const validated = validateManifest(parsed, entry.manifestDir);
      if (!validated) {
        console.warn(`[glyph plugins] rejected manifest in ${entry.manifestDir}: missing or unsupported fields`);
        continue;
      }
      manifests.push({
        ...validated,
        enabled: config.pluginsEnabled[validated.id] ?? false,
        entrySource: entry.entrySource,
      });
    }
    return manifests;
  } catch (err) {
    console.warn("[glyph plugins] scan failed:", err);
    return [];
  }
}

// -------- Activation / deactivation --------

async function runPluginEntry(manifest: PluginManifest): Promise<ActivatedPlugin | null> {
  const registered: ActivatedPlugin["registered"] = {
    markdownLangs: [],
    commandIds: [],
    panelIds: [],
  };

  const ctx: PluginContext = {
    markdown: {
      registerRenderer(lang, fn) {
        if (markdownRenderers.has(lang)) {
          console.warn(
            `[glyph plugins] ${manifest.id} tried to register duplicate renderer for \`${lang}\`; ignoring`,
          );
          return;
        }
        markdownRenderers.set(lang, { pluginId: manifest.id, fn });
        registered.markdownLangs.push(lang);
      },
    },
    commands: {
      register(id, title, run) {
        // Namespace the command under the plugin id to avoid collisions.
        const key = `${manifest.id}:${id}`;
        commands.set(key, { id: key, title, pluginId: manifest.id, run });
        registered.commandIds.push(key);
      },
    },
    ui: {
      registerPanel(panel) {
        const key = `${manifest.id}:${panel.id}`;
        panels.set(key, {
          id: key,
          title: panel.title,
          pluginId: manifest.id,
          mount: panel.mount,
        });
        registered.panelIds.push(key);
      },
    },
  };

  // Prefer the `glyph-plugin://` protocol so multi-file plugins can use
  // relative imports. Fall back to a blob URL built from the pre-read entry
  // source for the rare case the protocol or entry path is unavailable.
  let importUrl: string;
  let blobUrl: string | null = null;
  if (manifest.entry && isTauri) {
    const rel = manifest.entry.replace(/^\.?\//, "");
    importUrl = `glyph-plugin://${manifest.id}/${rel}`;
  } else if (manifest.entrySource) {
    const blob = new Blob([manifest.entrySource], { type: "text/javascript" });
    blobUrl = URL.createObjectURL(blob);
    importUrl = blobUrl;
  } else {
    console.warn(`[glyph plugins] ${manifest.id} has no loadable entry; skipping`);
    return null;
  }

  try {
    const mod = (await import(/* @vite-ignore */ importUrl)) as {
      activate?: (ctx: PluginContext) => void | Promise<void>;
      deactivate?: () => void | Promise<void>;
    };
    if (typeof mod.activate !== "function") {
      console.warn(`[glyph plugins] ${manifest.id} exports no activate() function`);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      return null;
    }
    await mod.activate(ctx);
    return {
      manifest,
      deactivate: typeof mod.deactivate === "function" ? mod.deactivate : undefined,
      registered,
      blobUrl,
    };
  } catch (err) {
    console.error(`[glyph plugins] ${manifest.id} activation threw:`, err);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    return null;
  }
}

/**
 * Subscribe to host-side registry changes (a plugin activated or
 * deactivated, changing the set of renderers, commands, and panels).
 * The markdown hook, command palette, and panel dock all listen here.
 */
let registryVersion = 0;
const registryListeners = new Set<() => void>();

export function onPluginRegistryChange(listener: () => void): () => void {
  registryListeners.add(listener);
  return () => {
    registryListeners.delete(listener);
  };
}

/** @deprecated alias kept for the markdown hook; use onPluginRegistryChange. */
export const onRendererRegistryChange = onPluginRegistryChange;

export function getRendererRegistryVersion(): number {
  return registryVersion;
}

function bumpRegistry(): void {
  registryVersion++;
  for (const listener of registryListeners) listener();
}

export async function activatePlugin(manifest: PluginManifest): Promise<boolean> {
  if (activePlugins.has(manifest.id)) return true;
  const active = await runPluginEntry(manifest);
  if (!active) return false;
  activePlugins.set(manifest.id, active);
  bumpRegistry();
  return true;
}

export async function deactivatePlugin(id: string): Promise<void> {
  const active = activePlugins.get(id);
  if (!active) return;
  for (const lang of active.registered.markdownLangs) {
    const entry = markdownRenderers.get(lang);
    if (entry?.pluginId === id) markdownRenderers.delete(lang);
  }
  for (const key of active.registered.commandIds) commands.delete(key);
  for (const key of active.registered.panelIds) panels.delete(key);
  try {
    await active.deactivate?.();
  } catch (err) {
    console.error(`[glyph plugins] ${id} deactivate() threw:`, err);
  }
  if (active.blobUrl) URL.revokeObjectURL(active.blobUrl);
  activePlugins.delete(id);
  bumpRegistry();
}

/**
 * Persist a plugin's enabled flag and activate/deactivate to match. The
 * caller (Settings UI) passes the new desired state; the host reconciles.
 */
export async function setPluginEnabled(
  manifest: PluginManifest,
  enabled: boolean,
): Promise<void> {
  const current = await loadConfig();
  await saveConfig({
    pluginsEnabled: { ...current.pluginsEnabled, [manifest.id]: enabled },
  });
  if (enabled) {
    await activatePlugin({ ...manifest, enabled: true });
  } else {
    await deactivatePlugin(manifest.id);
  }
}
