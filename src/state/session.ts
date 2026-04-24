/**
 * Tab session persistence.
 *
 * v2.0 Stage 6. Saves a compact snapshot of open tabs to
 * `<app-data>/Glyph/session.json` so the next launch restores the
 * same set of files at the same cursor positions. Content is not
 * persisted — disk is the source of truth — so closing Glyph on a
 * dirty Untitled tab still prompts the standard unsaved-changes
 * confirmation before the session is written.
 *
 * File shape (`schemaVersion` gates migrations):
 *
 *   { "schemaVersion": 1,
 *     "tabs": [{ "path": "/abs/path.md", "cursor": {"line":1,"col":1}, "scrollTop": 0 }],
 *     "activePath": "/abs/path.md" }
 */

const isTauri = "__TAURI_INTERNALS__" in window;

export interface PersistedTab {
  path: string;
  cursor: { line: number; col: number };
  scrollTop: number;
}

export interface PersistedSession {
  schemaVersion: 1;
  tabs: PersistedTab[];
  /** Path of the active tab at save time — or `null` when no saved file was active. */
  activePath: string | null;
}

const EMPTY_SESSION: PersistedSession = {
  schemaVersion: 1,
  tabs: [],
  activePath: null,
};

async function sessionPath(): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  const root = await invoke<string>("app_data_dir");
  return `${root}/session.json`;
}

export async function loadSession(): Promise<PersistedSession> {
  if (!isTauri) return EMPTY_SESSION;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await sessionPath();
    const raw = await invoke<string>("read_file", { path });
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    // Schema gate — future bumps will branch here into a migration. Today
    // we only know schema 1; anything else (missing, 0, 2+) is treated as
    // unreadable and the user lands on a fresh session.
    if (parsed.schemaVersion !== 1) return EMPTY_SESSION;
    if (!Array.isArray(parsed.tabs)) return EMPTY_SESSION;
    return {
      schemaVersion: 1,
      tabs: parsed.tabs.filter(
        (t): t is PersistedTab =>
          !!t && typeof t.path === "string" && t.path.length > 0,
      ),
      activePath: typeof parsed.activePath === "string" ? parsed.activePath : null,
    };
  } catch {
    // Missing or corrupt session.json — start fresh.
    return EMPTY_SESSION;
  }
}

// Serialize concurrent writes so rapid tab mutations don't clobber each other.
let writeQueue: Promise<unknown> = Promise.resolve();

export async function saveSession(session: PersistedSession): Promise<void> {
  if (!isTauri) return;
  const run = writeQueue.then(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await sessionPath();
    await invoke("save_file", {
      path,
      content: JSON.stringify(session, null, 2),
    });
  });
  // Log queue errors so they don't disappear silently (the caller's .catch
  // only catches the current call's rejection, not subsequent queued work).
  writeQueue = run.catch((err) => {
    console.error("[glyph session] write failed:", err);
  });
  return run;
}
