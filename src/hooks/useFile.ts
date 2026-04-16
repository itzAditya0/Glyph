/**
 * File I/O helpers that read and write through the active tab in TabsContext.
 *
 * Pre-v2.0 this hook owned `filePath`, `isDirty`, and `savedContent` via
 * `useState`. v2.0 moves that state into `TabsContext` (see
 * `src/state/tabs.ts`); this hook is now a thin wrapper exposing only
 * imperative actions that dispatch into the store.
 */

import { useCallback } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useActiveTab, useTabs } from "../state/tabs";

const MARKDOWN_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
];

const MARKDOWN_SAVE_FILTERS = [{ name: "Markdown", extensions: ["md"] }];

export interface FileActions {
  /** Open the native file picker and load the selected file into a tab. */
  openFile: () => Promise<void>;
  /** Save the given content to the active tab's path (or prompt Save As if unsaved). */
  saveFile: (content: string) => Promise<void>;
  /** Always prompt for a path before writing. */
  saveFileAs: (content: string) => Promise<void>;
  /** Read a file by path and load it into a tab. */
  openFileFromPath: (path: string) => Promise<void>;
}

export function useFile(): FileActions {
  const { tab, setPath, markSaved } = useActiveTab();
  const { actions } = useTabs();

  const openFile = useCallback(async () => {
    try {
      const selected = await open({ multiple: false, filters: MARKDOWN_FILTERS });
      if (selected === null) return;
      const content = await invoke<string>("read_file", { path: selected });
      actions.open(selected, content);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  }, [actions]);

  const saveFileAs = useCallback(
    async (contentToSave: string) => {
      try {
        const savePath = await save({
          filters: MARKDOWN_SAVE_FILTERS,
          defaultPath: tab?.path ?? "untitled.md",
        });
        if (savePath === null) return;
        await invoke("save_file", { path: savePath, content: contentToSave });
        setPath(savePath);
        // Pass the exact bytes we wrote — otherwise a keystroke between the
        // await and `markSaved` could snapshot post-save typing as the new
        // "clean" baseline, leaving the buffer dirty-but-marked-clean.
        markSaved(contentToSave);
      } catch (err) {
        console.error("Failed to save file:", err);
      }
    },
    [tab?.path, setPath, markSaved],
  );

  const saveFile = useCallback(
    async (contentToSave: string) => {
      try {
        const path = tab?.path ?? null;
        if (path === null) {
          await saveFileAs(contentToSave);
          return;
        }
        await invoke("save_file", { path, content: contentToSave });
        markSaved(contentToSave);
      } catch (err) {
        console.error("Failed to save file:", err);
      }
    },
    [tab?.path, saveFileAs, markSaved],
  );

  const openFileFromPath = useCallback(
    async (path: string) => {
      try {
        const content = await invoke<string>("read_file", { path });
        actions.open(path, content);
      } catch (err) {
        console.error("Failed to open file from path:", err);
      }
    },
    [actions],
  );

  return { openFile, saveFile, saveFileAs, openFileFromPath };
}
