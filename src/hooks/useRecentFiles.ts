import { useState, useCallback } from "react";

const STORAGE_KEY = "glyph-recent-files";
const MAX_ENTRIES = 10;

interface RecentFile {
  path: string;
  openedAt: number;
}

function loadRecent(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function useRecentFiles() {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(loadRecent);

  const addRecentFile = useCallback((path: string) => {
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f.path !== path);
      const next = [{ path, openedAt: Date.now() }, ...filtered].slice(
        0,
        MAX_ENTRIES
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecentFiles = useCallback(() => {
    setRecentFiles([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { recentFiles, addRecentFile, clearRecentFiles };
}
