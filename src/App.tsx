import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import Editor from "./components/Editor";
import type { EditorHandle } from "./components/Editor";
import { Preview } from "./components/Preview";
import Toolbar from "./components/Toolbar";
import StatusBar from "./components/StatusBar";
import { useMarkdown } from "./hooks/useMarkdown";
import { useFile } from "./hooks/useFile";
import { useTheme } from "./hooks/useTheme";
import { useAutoSave } from "./hooks/useAutoSave";
import { useRecentFiles } from "./hooks/useRecentFiles";
import { buildHtmlDocument } from "./utils/exportHtml";
import { prerenderMermaid, prerenderMermaidFragment } from "./utils/mermaidRender";
import { useActiveTab, useTabs } from "./state/tabs";
import { loadConfig, saveConfig } from "./state/config";
import { loadSession, saveSession } from "./state/session";
import { listDrafts, saveDraft, deleteDraft } from "./state/drafts";
import { runCliExport } from "./state/cliExport";
import { applyTheme, findTheme, listThemes, type PreviewTheme } from "./state/themes";
import {
  activatePlugin,
  scanInstalledPlugins,
  setPluginEnabled,
  type PluginManifest,
} from "./state/plugins";
import { useHeadings, type HeadingEntry } from "./hooks/useHeadings";
import Settings from "./components/Settings";
import Outline from "./components/Outline";
import TabBar from "./components/TabBar";
import MissingFile from "./components/MissingFile";
import CommandPalette from "./components/CommandPalette";
import PluginPanels from "./components/PluginPanels";
import styles from "./App.module.css";

type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void;
  run: (options: { querySelector: string; suppressErrors?: boolean }) => Promise<unknown>;
};

const isTauri = "__TAURI_INTERNALS__" in window;

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const { state: tabsState, actions: tabsActions } = useTabs();
  const { tab, setContent, setCursor } = useActiveTab();
  const content = tab?.content ?? "";
  const cursor = tab?.cursor ?? { line: 1, col: 1 };
  const filePath = tab?.path ?? null;
  const isDirty = tab?.isDirty ?? false;
  const fileName = tab?.path ? tab.fileName : null;

  const [wysiwygMode, setWysiwygMode] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewThemes, setPreviewThemes] = useState<PreviewTheme[]>([]);
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [themeHotReload, setThemeHotReload] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const settingsHydratedRef = useRef(false);
  const headings = useHeadings(content);

  // Hydrate user settings on mount. Missing/corrupt config falls back to
  // defaults. Themes are discovered in parallel; their list is cached in
  // state for the lifetime of the session (re-scans require a restart).
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadConfig(), listThemes(), scanInstalledPlugins()]).then(
      async ([cfg, themes, manifests]) => {
        if (cancelled) return;
        setVimMode(cfg.vimMode);
        setPreviewThemes(themes);
        setPreviewTheme(cfg.previewTheme);
        setSidebarOpen(cfg.sidebarOpen);
        setPlugins(manifests);
        setThemeHotReload(cfg.themeHotReload);
        settingsHydratedRef.current = true;

        // Activate plugins the user had previously enabled. Failures are
        // logged by `activatePlugin` itself; we don't block startup on them.
        for (const manifest of manifests) {
          if (manifest.enabled) {
            activatePlugin(manifest).catch(() => {
              // already logged by the host
            });
          }
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the previous session's tabs (paths + cursor/scroll) on mount.
  // Missing files are silently skipped; the welcome Untitled tab stays if
  // no real files could be restored. Corrupt session.json yields an empty
  // session, which is also a no-op here.
  const sessionHydratedRef = useRef(false);
  // Draft keys seen this session, so the reconcile effect knows which draft
  // files to delete when a tab is saved or closed (including stale draft
  // files left over from a previous run, which carry old tab ids).
  const knownDraftKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [session, drafts] = await Promise.all([loadSession(), listDrafts()]);
      knownDraftKeysRef.current = new Set(drafts.map((d) => d.key));

      // Drafts keyed by their owning path, for recovering unsaved edits to a
      // saved file. Untitled drafts (path null) become fresh tabs below.
      const draftByPath = new Map<string, string>();
      const untitledDrafts: string[] = [];
      for (const { draft } of drafts) {
        if (draft.path) draftByPath.set(draft.path, draft.content);
        else if (draft.content.trim() !== "") untitledDrafts.push(draft.content);
      }

      type RestoredTab = {
        path: string | null;
        content: string;
        cursor: { line: number; col: number };
        scrollTop: number;
        missing?: boolean;
        savedContent?: string;
      };
      const restored: RestoredTab[] = [];

      if (session.tabs.length > 0) {
        const { invoke } = await import("@tauri-apps/api/core");
        // Read all files in parallel — cold-start latency with many tabs
        // was dominated by sequential Rust round-trips.
        const results = await Promise.allSettled(
          session.tabs.map((t) => invoke<string>("read_file", { path: t.path })),
        );
        results.forEach((result, i) => {
          const t = session.tabs[i];
          const recovered = draftByPath.get(t.path);
          if (result.status === "fulfilled") {
            // If a draft has different content than disk, restore the draft
            // as recovered (dirty), keeping disk content as the baseline so
            // reverting back to disk clears the dirty flag.
            if (recovered !== undefined && recovered !== result.value) {
              restored.push({
                path: t.path,
                content: recovered,
                cursor: t.cursor,
                scrollTop: t.scrollTop,
                savedContent: result.value,
              });
            } else {
              restored.push({
                path: t.path,
                content: result.value,
                cursor: t.cursor,
                scrollTop: t.scrollTop,
              });
            }
          } else if (recovered !== undefined) {
            // File unreadable but we have an unsaved draft — recover the
            // content as a dirty buffer (baseline empty) rather than a
            // missing placeholder.
            restored.push({
              path: t.path,
              content: recovered,
              cursor: t.cursor,
              scrollTop: t.scrollTop,
              savedContent: "",
            });
          } else {
            // File moved or deleted and no draft — keep a placeholder tab so
            // the user can see what was lost and dismiss it.
            restored.push({
              path: t.path,
              content: "",
              cursor: t.cursor,
              scrollTop: t.scrollTop,
              missing: true,
            });
          }
        });
      }

      // Append recovered Untitled buffers as dirty tabs (baseline empty).
      for (const content of untitledDrafts) {
        restored.push({
          path: null,
          content,
          cursor: { line: 1, col: 1 },
          scrollTop: 0,
          savedContent: "",
        });
      }

      if (cancelled) return;
      if (restored.length > 0) {
        tabsActions.hydrate(restored, session.activePath);
      }
      sessionHydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [tabsActions]);

  // Reconcile crash-safe drafts against the live dirty set, debounced. Dirty
  // tabs get their content (over)written; tabs that became clean (saved) or
  // were closed have their draft deleted. This also cleans up stale draft
  // files from a previous session whose ids no longer match any open tab.
  const draftKey = useMemo(
    () =>
      JSON.stringify(
        tabsState.tabs.filter((t) => t.isDirty).map((t) => [t.id, t.path, t.content]),
      ),
    [tabsState],
  );
  useEffect(() => {
    if (!sessionHydratedRef.current) return;
    const timer = setTimeout(() => {
      const dirty = tabsState.tabs.filter((t) => t.isDirty);
      const desired = new Set(dirty.map((t) => t.id));
      for (const tab of dirty) {
        saveDraft(tab.id, {
          path: tab.path,
          content: tab.content,
          savedAt: Date.now(),
        });
      }
      for (const key of knownDraftKeysRef.current) {
        if (!desired.has(key)) deleteDraft(key);
      }
      knownDraftKeysRef.current = desired;
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Persist the current tab set on changes, debounced so rapid edits don't
  // thrash disk. Content is intentionally excluded — disk remains the source
  // of truth — so we project tabs to just their persisted fields and gate
  // the effect on a stable key. Without this, every keystroke triggers the
  // debounce even though the keystroke never changes what gets written.
  const sessionKey = useMemo(() => {
    const activeTab = tabsState.tabs.find((t) => t.id === tabsState.activeId);
    return JSON.stringify({
      tabs: tabsState.tabs
        .filter((t) => t.path !== null)
        .map((t) => [t.path, t.cursor.line, t.cursor.col, t.scrollTop]),
      activePath: activeTab?.path ?? null,
    });
  }, [tabsState]);

  useEffect(() => {
    if (!sessionHydratedRef.current) return;
    const timer = setTimeout(() => {
      const persisted = tabsState.tabs
        .filter((t) => t.path !== null)
        .map((t) => ({
          path: t.path as string,
          cursor: t.cursor,
          scrollTop: t.scrollTop,
        }));
      const activeTab = tabsState.tabs.find((t) => t.id === tabsState.activeId);
      saveSession({
        schemaVersion: 1,
        tabs: persisted,
        activePath: activeTab?.path ?? null,
      }).catch((err) => {
        console.error("Failed to persist session:", err);
      });
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // Persist vimMode whenever it changes — but not on the initial hydrate,
  // or we'd overwrite disk with the default before `loadConfig` returns.
  useEffect(() => {
    if (!settingsHydratedRef.current) return;
    saveConfig({ vimMode }).catch((err) => {
      console.error("Failed to persist vimMode setting:", err);
    });
  }, [vimMode]);

  // Apply the active preview theme whenever the selection or the discovered
  // theme list changes. `applyTheme` swaps the text of a single managed
  // `<style>` tag in document.head so users never see an unstyled flash —
  // this also covers hot-reload, where `previewThemes` updates with fresh CSS.
  useEffect(() => {
    applyTheme(findTheme(previewThemes, previewTheme));
  }, [previewTheme, previewThemes]);

  // Persist the chosen theme name only when the selection changes, not when
  // the theme list refreshes (hot-reload would otherwise rewrite config on
  // every poll).
  useEffect(() => {
    if (!settingsHydratedRef.current) return;
    saveConfig({ previewTheme }).catch((err) => {
      console.error("Failed to persist previewTheme setting:", err);
    });
  }, [previewTheme]);

  const handleToggleVimMode = useCallback(() => {
    setVimMode((current) => !current);
  }, []);

  const handlePreviewThemeChange = useCallback((name: string | null) => {
    setPreviewTheme(name);
  }, []);

  const handleToggleThemeHotReload = useCallback(() => {
    setThemeHotReload((current) => {
      const next = !current;
      saveConfig({ themeHotReload: next }).catch((err) => {
        console.error("Failed to persist themeHotReload setting:", err);
      });
      return next;
    });
  }, []);

  // Theme hot-reload: while on, poll the themes folder and refresh the cached
  // list when any CSS changes. The apply effect re-runs on `previewThemes`,
  // so an edit to the active theme's file repaints the preview live. Only
  // updates state when the content actually differs to avoid needless churn.
  const themesSignatureRef = useRef("");
  useEffect(() => {
    if (!themeHotReload) return;
    let cancelled = false;
    const poll = async () => {
      const themes = await listThemes();
      if (cancelled) return;
      const signature = JSON.stringify(themes);
      if (signature !== themesSignatureRef.current) {
        themesSignatureRef.current = signature;
        setPreviewThemes(themes);
      }
    };
    themesSignatureRef.current = JSON.stringify(previewThemes);
    const id = window.setInterval(poll, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeHotReload]);

  const handleTogglePlugin = useCallback(
    (manifest: PluginManifest, enabled: boolean) => {
      setPlugins((current) =>
        current.map((p) => (p.id === manifest.id ? { ...p, enabled } : p)),
      );
      setPluginEnabled(manifest, enabled).catch((err) => {
        console.error(`Failed to toggle plugin ${manifest.id}:`, err);
      });
    },
    [],
  );

  // Persist sidebarOpen across launches; skip the initial hydrate.
  useEffect(() => {
    if (!settingsHydratedRef.current) return;
    saveConfig({ sidebarOpen }).catch((err) => {
      console.error("Failed to persist sidebarOpen setting:", err);
    });
  }, [sidebarOpen]);

  const confirmCloseDirty = useCallback(
    (fileName: string) =>
      window.confirm(`“${fileName}” has unsaved changes. Close anyway?`),
    [],
  );

  const handleHeadingClick = useCallback((heading: HeadingEntry) => {
    // Drive both panes: editor jumps to the source line, preview scrolls
    // to the anchor `markdown-it-anchor` attached to the rendered heading.
    editorRef.current?.scrollToLine(heading.line);
    const target = document.querySelector<HTMLElement>(
      `.glyph-preview-root #${CSS.escape(heading.slug)}`,
    );
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);
  const html = useMarkdown(content);
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const { openFile, saveFile, saveFileAs, openFileFromPath } = useFile();

  const { recentFiles, addRecentFile, clearRecentFiles } = useRecentFiles();
  const { autoSaveEnabled, toggleAutoSave } = useAutoSave(
    content,
    filePath,
    isDirty,
    saveFile
  );

  // Track opened files in recent files list
  useEffect(() => {
    if (filePath) addRecentFile(filePath);
  }, [filePath, addRecentFile]);

  const wordCount = useMemo(
    () => content.split(/\s+/).filter(Boolean).length,
    [content]
  );

  // Dynamic window title (Tauri only)
  useEffect(() => {
    if (!isTauri) return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const name = fileName ?? "Untitled";
      const prefix = isDirty ? "\u25cf " : "";
      getCurrentWindow().setTitle(`${prefix}${name} \u2014 Glyph`);
    });
  }, [fileName, isDirty]);

  // Mermaid orchestration: lazy-load on first sighting, re-init on theme change,
  // run on every html change. `data-source` on each placeholder lets us restore
  // the original diagram text across theme-only re-renders (since mermaid.run
  // replaces innerHTML with SVG).
  const mermaidModRef = useRef<MermaidModule | null>(null);
  const lastMermaidThemeRef = useRef<"light" | "dark" | null>(null);
  useEffect(() => {
    let ignore = false;
    (async () => {
      const nodes = document.querySelectorAll<HTMLElement>(".mermaid");
      if (nodes.length === 0 && mermaidModRef.current === null) return;
      if (ignore) return;

      if (mermaidModRef.current === null) {
        const mod = await import("mermaid");
        if (ignore) return;
        mermaidModRef.current = mod.default as unknown as MermaidModule;
      }
      const mermaid = mermaidModRef.current;

      const themeChanged = lastMermaidThemeRef.current !== resolvedTheme;
      if (themeChanged) {
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "default",
          securityLevel: "strict",
        });
        lastMermaidThemeRef.current = resolvedTheme;
        // Theme-only change: restore text content from data-source (URL-
        // encoded by the fence rule) and strip `data-processed` so
        // mermaid.run re-renders against fresh source.
        nodes.forEach((node) => {
          const src = node.dataset.source;
          if (src) {
            try {
              node.textContent = decodeURIComponent(src);
            } catch {
              node.textContent = src;
            }
            node.removeAttribute("data-processed");
          }
        });
      }

      try {
        await mermaid.run({ querySelector: ".mermaid", suppressErrors: true });
      } catch (err) {
        console.warn("mermaid.run failed:", err);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [html, resolvedTheme]);

  const handleOpenFile = useCallback(async () => {
    if (isDirty) {
      const ok = window.confirm("You have unsaved changes. Open a new file anyway?");
      if (!ok) return;
    }
    await openFile();
  }, [openFile, isDirty]);

  const handleOpenFromPath = useCallback(
    async (path: string) => {
      if (isDirty) {
        const ok = window.confirm("You have unsaved changes. Open a new file anyway?");
        if (!ok) return;
      }
      await openFileFromPath(path);
    },
    [openFileFromPath, isDirty]
  );

  // Missing-file placeholder actions. Retry re-reads the path; on success the
  // `open` action heals the placeholder tab in place. Remove dismisses it.
  const handleRetryMissing = useCallback(() => {
    if (tab?.path) openFileFromPath(tab.path);
  }, [tab?.path, openFileFromPath]);

  const handleRemoveMissing = useCallback(() => {
    if (tab) tabsActions.closeOrReplace(tab.id);
  }, [tab, tabsActions]);

  const [copiedNotice, setCopiedNotice] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  const handleCopyAsRichText = useCallback(async () => {
    if (!isTauri) return;
    try {
      const { writeHtml } = await import("@tauri-apps/plugin-clipboard-manager");
      const sanitized = DOMPurify.sanitize(html);
      await writeHtml(sanitized, content);
      setCopiedNotice(true);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopiedNotice(false);
        copiedTimerRef.current = null;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy as rich text:", err);
    }
  }, [html, content]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handlePrint = useCallback(async () => {
    // Clean any stale print root from a previous aborted print.
    document.getElementById("glyph-print-root")?.remove();

    const printRoot = document.createElement("div");
    printRoot.id = "glyph-print-root";
    printRoot.className = "glyph-preview";
    const fragment = DOMPurify.sanitize(html, {
      RETURN_DOM_FRAGMENT: true,
      ALLOW_DATA_ATTR: true,
    });
    // Pre-render any mermaid diagrams into inline SVG before the fragment
    // enters the DOM, so the print dialog captures rendered diagrams.
    await prerenderMermaidFragment(fragment, "print");
    printRoot.appendChild(fragment);
    document.body.appendChild(printRoot);

    // Force light mode for printing so Shiki code blocks render with their
    // light palette. Restored in afterprint.
    const htmlEl = document.documentElement;
    const wasDark = htmlEl.classList.contains("dark");
    if (wasDark) htmlEl.classList.remove("dark");

    document.body.classList.add("glyph-printing");

    const cleanup = () => {
      document.body.classList.remove("glyph-printing");
      document.getElementById("glyph-print-root")?.remove();
      if (wasDark) htmlEl.classList.add("dark");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }, [html]);

  const handleExportHtml = useCallback(async () => {
    if (!isTauri) return;
    try {
      const [{ save }, { invoke }] = await Promise.all([
        import("@tauri-apps/plugin-dialog"),
        import("@tauri-apps/api/core"),
      ]);
      const baseName = (fileName ?? "untitled").replace(/\.(md|markdown|mdown|mkd)$/i, "");
      const savePath = await save({
        defaultPath: `${baseName}.html`,
        filters: [{ name: "HTML", extensions: ["html"] }],
      });
      if (savePath === null) return;
      const sanitized = DOMPurify.sanitize(html, { ALLOW_DATA_ATTR: true });
      // Pre-render mermaid diagrams to inline SVG so the exported file is
      // self-contained (no JS, no CDN) and renders offline.
      const withDiagrams = await prerenderMermaid(sanitized, "export");
      // Inline the active user theme (if any) so exported files match
      // what the author saw in the preview pane.
      const activeTheme = findTheme(previewThemes, previewTheme);
      const doc = buildHtmlDocument(
        withDiagrams,
        baseName,
        resolvedTheme,
        activeTheme?.css ?? null,
      );
      await invoke("save_file", { path: savePath, content: doc });
    } catch (err) {
      console.error("Failed to export HTML:", err);
    }
  }, [fileName, html, resolvedTheme, previewThemes, previewTheme]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          saveFileAs(content).catch(() => {});
        } else {
          saveFile(content).catch(() => {});
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        handleOpenFile().catch(() => {});
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        e.preventDefault();
        setZenMode((z) => !z);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        handleExportHtml().catch(() => {});
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        handlePrint();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        handleCopyAsRichText().catch(() => {});
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((open) => !open);
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "\\") {
        e.preventDefault();
        setSidebarOpen((open) => !open);
      }
      // Command palette (plugin commands).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
      // Tab management shortcuts (Stage 6).
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "t") {
        e.preventDefault();
        tabsActions.newUntitled();
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "w") {
        e.preventDefault();
        const active = tabsState.tabs.find((t) => t.id === tabsState.activeId);
        if (!active) return;
        const proceed = active.isDirty ? confirmCloseDirty(active.fileName) : true;
        if (proceed) {
          tabsActions.closeOrReplace(active.id);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        tabsActions.reopenLastClosed();
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const target = tabsState.tabs[idx];
        if (target) {
          e.preventDefault();
          tabsActions.switchTo(target.id);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const currentIdx = tabsState.tabs.findIndex((t) => t.id === tabsState.activeId);
        if (currentIdx === -1) return;
        const delta = e.key === "ArrowRight" ? 1 : -1;
        const nextIdx = (currentIdx + delta + tabsState.tabs.length) % tabsState.tabs.length;
        tabsActions.switchTo(tabsState.tabs[nextIdx].id);
      }
      if (e.key === "Escape" && zenMode) {
        setZenMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    content,
    saveFile,
    saveFileAs,
    handleOpenFile,
    handleExportHtml,
    handlePrint,
    handleCopyAsRichText,
    zenMode,
    tabsActions,
    tabsState,
    confirmCloseDirty,
  ]);

  // Drag and drop (Tauri only)
  useEffect(() => {
    if (!isTauri) return;
    let cleanup: (() => void) | undefined;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
      const unlisten = getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          const paths = event.payload.paths;
          if (paths.length > 0) {
            const path = paths[0];
            if (
              path.endsWith(".md") ||
              path.endsWith(".markdown") ||
              path.endsWith(".mdown") ||
              path.endsWith(".mkd")
            ) {
              handleOpenFromPath(path);
            }
          }
        }
      });
      unlisten.then((fn) => {
        cleanup = fn;
      });
    });
    return () => {
      cleanup?.();
    };
  }, [handleOpenFromPath]);

  // File association — opened via double-click in Finder (Tauri only)
  useEffect(() => {
    if (!isTauri) return;
    let cleanup: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<string>("open-file", (event) => {
        handleOpenFromPath(event.payload);
      }).then((fn) => {
        cleanup = fn;
      });
    });
    return () => {
      cleanup?.();
    };
  }, [handleOpenFromPath]);

  // CLI export — `glyph export <file> --html` fires this event. The handler
  // runs the full GUI render pipeline, writes to disk, and quits the process.
  useEffect(() => {
    if (!isTauri) return;
    let cleanup: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ input: string; output: string; format: "html" | "pdf" }>("cli-export", (event) => {
        runCliExport(event.payload).catch((err) => {
          console.error("[glyph cli] export unhandled rejection:", err);
        });
      }).then((fn) => {
        cleanup = fn;
      });
    });
    return () => {
      cleanup?.();
    };
  }, []);

  // Confirm on close (Tauri only).
  //
  // Registered once on mount. The handler reads the live tab set through a
  // ref so it never needs to re-register on every dirty-state flip — the
  // previous version re-bound `onCloseRequested` on each `isDirty` change,
  // and because the unlisten handle is resolved asynchronously, a close
  // event arriving mid-rebind could hit a stale or missing handler and hang
  // the window. We also count *all* dirty tabs, not just the active one, so
  // background tabs with unsaved work aren't silently discarded.
  const dirtyTabsRef = useRef(0);
  dirtyTabsRef.current = tabsState.tabs.filter((t) => t.isDirty).length;
  useEffect(() => {
    if (!isTauri) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          const dirtyCount = dirtyTabsRef.current;
          if (dirtyCount === 0) return;

          const message =
            dirtyCount === 1
              ? "You have unsaved changes. Close anyway?"
              : `You have unsaved changes in ${dirtyCount} tabs. Close anyway?`;

          // Prevent the close up front, then decide. This guarantees the
          // window never closes while the prompt is still resolving.
          event.preventDefault();
          let confirmed = false;
          try {
            const { ask } = await import("@tauri-apps/plugin-dialog");
            confirmed = await ask(message, { title: "Glyph", kind: "warning" });
          } catch (err) {
            // If the native dialog fails to surface, fall back to the DOM
            // confirm so the user is never trapped behind an invisible prompt.
            console.error("Close-confirmation dialog failed, using fallback:", err);
            confirmed = window.confirm(message);
          }
          if (confirmed) {
            // The user chose to discard, so drop the crash-safe drafts for
            // those tabs — otherwise they'd resurrect on next launch. Wait
            // for the deletes before destroying so they actually land.
            await Promise.all(
              [...knownDraftKeysRef.current].map((key) => deleteDraft(key)),
            ).catch(() => undefined);
            // `destroy()` force-closes without re-firing onCloseRequested,
            // so there's no double-prompt.
            getCurrentWindow().destroy();
          }
        })
        .then((fn) => {
          if (cancelled) {
            fn();
          } else {
            cleanup = fn;
          }
        });
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className={`${styles.layout} ${zenMode ? styles.zen : ""}`}>
      {!zenMode && <TabBar confirmCloseDirty={confirmCloseDirty} />}
      {!zenMode && <Toolbar
        fileName={fileName}
        filePath={filePath}
        isDirty={isDirty}
        theme={theme}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
        wysiwygMode={wysiwygMode}
        onToggleWysiwyg={() => setWysiwygMode((m) => !m)}
        recentFiles={recentFiles}
        onOpenRecentFile={handleOpenFromPath}
        onClearRecentFiles={clearRecentFiles}
        onOpenSearch={() => editorRef.current?.openSearch()}
        onExportHtml={handleExportHtml}
        onPrint={handlePrint}
        onCopyAsRichText={handleCopyAsRichText}
        onOpenSettings={() => setSettingsOpen(true)}
      />}
      {zenMode && (
        <div className={styles.zenHint}>Press Esc to exit zen mode</div>
      )}
      <div className={styles.panes}>
        {!zenMode && sidebarOpen && (
          <div className={styles.sidebarPane}>
            <Outline headings={headings} onHeadingClick={handleHeadingClick} />
          </div>
        )}
        {tab?.missing ? (
          <div className={styles.editorFull}>
            <MissingFile
              path={tab.path ?? ""}
              onRetry={handleRetryMissing}
              onRemove={handleRemoveMissing}
            />
          </div>
        ) : (
          <>
            <div className={wysiwygMode ? styles.editorFull : styles.editorPane}>
              <Editor
                ref={editorRef}
                value={content}
                onChange={setContent}
                onCursorChange={setCursor}
                resolvedTheme={resolvedTheme}
                wysiwygMode={wysiwygMode}
                vimMode={vimMode}
              />
            </div>
            {!wysiwygMode && (
              <>
                <div className={styles.divider} />
                <div className={styles.previewPane}>
                  <Preview html={html} />
                </div>
              </>
            )}
          </>
        )}
        {!zenMode && <PluginPanels />}
      </div>
      {!zenMode && (
        <StatusBar
          cursorLine={cursor.line}
          cursorCol={cursor.col}
          wordCount={wordCount}
          isDirty={isDirty}
          autoSaveEnabled={autoSaveEnabled}
          onToggleAutoSave={toggleAutoSave}
          copiedNotice={copiedNotice}
        />
      )}
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        vimMode={vimMode}
        onToggleVimMode={handleToggleVimMode}
        themes={previewThemes}
        previewTheme={previewTheme}
        onPreviewThemeChange={handlePreviewThemeChange}
        themeHotReload={themeHotReload}
        onToggleThemeHotReload={handleToggleThemeHotReload}
        plugins={plugins}
        onTogglePlugin={handleTogglePlugin}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export default App;
