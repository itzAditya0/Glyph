import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "glyph-autosave";
const isTauri = "__TAURI_INTERNALS__" in window;

interface AutoSaveSettings {
  enabled: boolean;
  intervalMs: number;
}

const DEFAULTS: AutoSaveSettings = { enabled: false, intervalMs: 30000 };

function loadSettings(): AutoSaveSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

export function useAutoSave(
  content: string,
  filePath: string | null,
  isDirty: boolean,
  saveFile: (content: string) => Promise<void>
) {
  const [settings, setSettings] = useState<AutoSaveSettings>(loadSettings);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<number | null>(null);

  const contentRef = useRef(content);
  const isDirtyRef = useRef(isDirty);
  const filePathRef = useRef(filePath);
  const saveFileRef = useRef(saveFile);

  contentRef.current = content;
  isDirtyRef.current = isDirty;
  filePathRef.current = filePath;
  saveFileRef.current = saveFile;

  const toggleEnabled = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!settings.enabled || !isTauri) return;

    const id = setInterval(() => {
      if (isDirtyRef.current && filePathRef.current) {
        saveFileRef.current(contentRef.current).then(() => {
          setLastAutoSaveAt(Date.now());
        });
      }
    }, settings.intervalMs);

    return () => clearInterval(id);
  }, [settings.enabled, settings.intervalMs]);

  return {
    autoSaveEnabled: settings.enabled,
    toggleAutoSave: toggleEnabled,
    lastAutoSaveAt,
  };
}
