/**
 * Crash-safe drafts for unsaved tab content.
 *
 * v2.1. `session.json` persists only file paths (disk is the source of
 * truth), so an Untitled buffer or unsaved edits to a saved file would be
 * lost if Glyph were killed rather than quit cleanly. This module mirrors
 * every dirty tab's content into `<app-data>/Glyph/drafts/<tabId>.json`
 * so it can be recovered on the next launch.
 *
 * Drafts are keyed by the tab's session id. The set on disk is reconciled
 * against the live dirty set on a debounce: dirty tabs get (over)written,
 * and tabs that became clean (saved) or were closed get their draft
 * deleted.
 */

const isTauri = "__TAURI_INTERNALS__" in window;

export interface Draft {
  /** Owning file path, or null for an Untitled buffer. */
  path: string | null;
  /** Unsaved buffer content. */
  content: string;
  /** Epoch ms when the draft was written — shown if we ever surface age. */
  savedAt: number;
}

export interface StoredDraft {
  key: string;
  draft: Draft;
}

export async function listDrafts(): Promise<StoredDraft[]> {
  if (!isTauri) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<Array<{ key: string; json: string }>>("list_drafts");
    const out: StoredDraft[] = [];
    for (const { key, json } of raw) {
      try {
        const draft = JSON.parse(json) as Draft;
        if (typeof draft.content === "string") {
          out.push({ key, draft });
        }
      } catch {
        // Corrupt draft file — ignore it rather than blocking recovery.
      }
    }
    return out;
  } catch (err) {
    console.warn("[glyph drafts] list failed:", err);
    return [];
  }
}

export async function saveDraft(key: string, draft: Draft): Promise<void> {
  if (!isTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_draft", { key, json: JSON.stringify(draft) });
  } catch (err) {
    console.warn("[glyph drafts] save failed:", err);
  }
}

export async function deleteDraft(key: string): Promise<void> {
  if (!isTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_draft", { key });
  } catch (err) {
    console.warn("[glyph drafts] delete failed:", err);
  }
}
