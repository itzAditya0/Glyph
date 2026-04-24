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
import { useActiveTab } from "./state/tabs";
import { loadConfig, saveConfig } from "./state/config";
import { applyTheme, findTheme, listThemes, type PreviewTheme } from "./state/themes";
import { useHeadings, type HeadingEntry } from "./hooks/useHeadings";
import Settings from "./components/Settings";
import Outline from "./components/Outline";
import styles from "./App.module.css";

type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void;
  run: (options: { querySelector: string; suppressErrors?: boolean }) => Promise<unknown>;
};

const isTauri = "__TAURI_INTERNALS__" in window;

function App() {
  const editorRef = useRef<EditorHandle>(null);
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
  const settingsHydratedRef = useRef(false);
  const headings = useHeadings(content);

  // Hydrate user settings on mount. Missing/corrupt config falls back to
  // defaults. Themes are discovered in parallel; their list is cached in
  // state for the lifetime of the session (re-scans require a restart).
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadConfig(), listThemes()]).then(([cfg, themes]) => {
      if (cancelled) return;
      setVimMode(cfg.vimMode);
      setPreviewThemes(themes);
      setPreviewTheme(cfg.previewTheme);
      setSidebarOpen(cfg.sidebarOpen);
      settingsHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist vimMode whenever it changes — but not on the initial hydrate,
  // or we'd overwrite disk with the default before `loadConfig` returns.
  useEffect(() => {
    if (!settingsHydratedRef.current) return;
    saveConfig({ vimMode }).catch((err) => {
      console.error("Failed to persist vimMode setting:", err);
    });
  }, [vimMode]);

  // Apply the active preview theme and persist its name. `applyTheme`
  // swaps the text of a single managed `<style>` tag in document.head so
  // users never see an unstyled flash between selections.
  useEffect(() => {
    applyTheme(findTheme(previewThemes, previewTheme));
    if (!settingsHydratedRef.current) return;
    saveConfig({ previewTheme }).catch((err) => {
      console.error("Failed to persist previewTheme setting:", err);
    });
  }, [previewTheme, previewThemes]);

  const handleToggleVimMode = useCallback(() => {
    setVimMode((current) => !current);
  }, []);

  const handlePreviewThemeChange = useCallback((name: string | null) => {
    setPreviewTheme(name);
  }, []);

  // Persist sidebarOpen across launches; skip the initial hydrate.
  useEffect(() => {
    if (!settingsHydratedRef.current) return;
    saveConfig({ sidebarOpen }).catch((err) => {
      console.error("Failed to persist sidebarOpen setting:", err);
    });
  }, [sidebarOpen]);

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
      if (e.key === "Escape" && zenMode) {
        setZenMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [content, saveFile, saveFileAs, handleOpenFile, handleExportHtml, handlePrint, handleCopyAsRichText, zenMode]);

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

  // Confirm on close (Tauri only)
  useEffect(() => {
    if (!isTauri) return;
    let cleanup: (() => void) | undefined;
    Promise.all([
      import("@tauri-apps/api/window"),
      import("@tauri-apps/plugin-dialog"),
    ]).then(([{ getCurrentWindow }, { ask }]) => {
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (isDirty) {
            const confirmed = await ask(
              "You have unsaved changes. Are you sure you want to close?",
              { title: "Glyph", kind: "warning" }
            );
            if (!confirmed) {
              event.preventDefault();
            }
          }
        })
        .then((fn) => {
          cleanup = fn;
        });
    });
    return () => {
      cleanup?.();
    };
  }, [isDirty]);

  return (
    <div className={`${styles.layout} ${zenMode ? styles.zen : ""}`}>
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
      />
    </div>
  );
}

export default App;
