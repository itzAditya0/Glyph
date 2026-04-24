/**
 * Custom preview-theme discovery and injection.
 *
 * v2.0 Stage 4 — users drop `*.css` files into `<app-data>/Glyph/themes/`
 * and Glyph picks them up on next scan. Themes scope to the preview only
 * via the `.glyph-preview-root` class (added by `Preview.tsx`); the editor
 * pane keeps its own theme system (see `oneDark` in `Editor.tsx`).
 *
 * The active theme's CSS is injected into `document.head` inside a single
 * managed `<style id="glyph-user-theme">` element — swapping themes means
 * replacing the node's text content rather than adding/removing elements,
 * so there is no layout flash between switches.
 */

export interface PreviewTheme {
  /** Filename without `.css`, shown in Settings and stored in config as `previewTheme`. */
  name: string;
  /** Raw CSS content, already resolved server-side. */
  css: string;
}

const isTauri = "__TAURI_INTERNALS__" in window;
const STYLE_ELEMENT_ID = "glyph-user-theme";

export async function listThemes(): Promise<PreviewTheme[]> {
  if (!isTauri) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const themes = await invoke<PreviewTheme[]>("list_themes");
    return themes;
  } catch (err) {
    console.warn("[glyph themes] failed to list themes:", err);
    return [];
  }
}

/**
 * Apply the given theme's CSS to the document, or remove any previously
 * applied theme when `theme` is null.
 */
export function applyTheme(theme: PreviewTheme | null): void {
  const existing = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;

  if (theme === null) {
    existing?.remove();
    return;
  }

  if (existing) {
    existing.textContent = theme.css;
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = theme.css;
  document.head.appendChild(style);
}

/** Find a theme by name in a pre-loaded list. Returns null when absent. */
export function findTheme(themes: PreviewTheme[], name: string | null): PreviewTheme | null {
  if (name === null) return null;
  return themes.find((t) => t.name === name) ?? null;
}
