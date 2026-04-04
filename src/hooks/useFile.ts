import { useState, useCallback, useMemo } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

interface UseFileReturn {
  filePath: string | null;
  savedContent: string;
  isDirty: boolean;
  openFile: () => Promise<string | null>;
  saveFile: (content: string) => Promise<void>;
  saveFileAs: (content: string) => Promise<void>;
  openFileFromPath: (path: string) => Promise<string>;
  setSavedContent: (content: string) => void;
}

const MARKDOWN_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
];

const MARKDOWN_SAVE_FILTERS = [
  { name: "Markdown", extensions: ["md"] },
];

export function useFile(content: string): UseFileReturn {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string>("");

  const isDirty = useMemo(() => content !== savedContent, [content, savedContent]);

  const openFile = useCallback(async (): Promise<string | null> => {
    try {
      const selected = await open({
        multiple: false,
        filters: MARKDOWN_FILTERS,
      });

      if (selected === null) {
        return null;
      }

      const fileContent = await invoke<string>("read_file", { path: selected });
      setFilePath(selected);
      setSavedContent(fileContent);
      return fileContent;
    } catch (err) {
      console.error("Failed to open file:", err);
      return null;
    }
  }, []);

  const saveFileAs = useCallback(async (contentToSave: string): Promise<void> => {
    try {
      const savePath = await save({
        filters: MARKDOWN_SAVE_FILTERS,
        defaultPath: filePath ?? "untitled.md",
      });

      if (savePath === null) {
        return;
      }

      await invoke("save_file", { path: savePath, content: contentToSave });
      setFilePath(savePath);
      setSavedContent(contentToSave);
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }, [filePath]);

  const saveFile = useCallback(async (contentToSave: string): Promise<void> => {
    try {
      if (filePath === null) {
        await saveFileAs(contentToSave);
        return;
      }

      await invoke("save_file", { path: filePath, content: contentToSave });
      setSavedContent(contentToSave);
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }, [filePath, saveFileAs]);

  const openFileFromPath = useCallback(async (path: string): Promise<string> => {
    try {
      const fileContent = await invoke<string>("read_file", { path });
      setFilePath(path);
      setSavedContent(fileContent);
      return fileContent;
    } catch (err) {
      console.error("Failed to open file from path:", err);
      throw err;
    }
  }, []);

  return {
    filePath,
    savedContent,
    isDirty,
    openFile,
    saveFile,
    saveFileAs,
    openFileFromPath,
    setSavedContent,
  };
}
