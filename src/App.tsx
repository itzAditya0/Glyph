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
import styles from "./App.module.css";

const isTauri = "__TAURI_INTERNALS__" in window;

const DEFAULT_MARKDOWN = `# Welcome to Glyph

A lightweight Markdown editor that gets out of your way.

## Features

- **Live preview** as you type
- *Italic*, **bold**, and ~~strikethrough~~ support
- GFM tables, task lists, and footnotes

## Try it out

Here's a list of things to try:

- [ ] Type some markdown on the left
- [ ] Watch it render on the right
- [x] Enjoy the clean, distraction-free editing

## Code Blocks

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Glyph"))
\`\`\`

Inline code works too: \`const x = 42;\`

## Tables

| Feature       | Status |
|---------------|--------|
| Live Preview  | ✓      |
| WYSIWYG Mode  | ✓      |
| Dark Theme    | ✓      |
| Find & Replace| ✓      |
| Auto-save     | ✓      |

## Blockquote

> "Simplicity is the ultimate sophistication."
> — Leonardo da Vinci

---

This is a footnote reference[^1].

[^1]: And here is the footnote content.
`;

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const [content, setContent] = useState(DEFAULT_MARKDOWN);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [wysiwygMode, setWysiwygMode] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const html = useMarkdown(content);
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const {
    filePath,
    isDirty,
    openFile,
    saveFile,
    saveFileAs,
    openFileFromPath,
    setSavedContent,
  } = useFile(content);

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

  const fileName = filePath ? filePath.replace(/\\/g, "/").split("/").pop() ?? null : null;

  // Set initial savedContent to match default markdown
  useEffect(() => {
    setSavedContent(DEFAULT_MARKDOWN);
  }, [setSavedContent]);

  // Dynamic window title (Tauri only)
  useEffect(() => {
    if (!isTauri) return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const name = fileName ?? "Untitled";
      const prefix = isDirty ? "\u25cf " : "";
      getCurrentWindow().setTitle(`${prefix}${name} \u2014 Glyph`);
    });
  }, [fileName, isDirty]);

  const handleOpenFile = useCallback(async () => {
    if (isDirty) {
      const ok = window.confirm("You have unsaved changes. Open a new file anyway?");
      if (!ok) return;
    }
    const fileContent = await openFile();
    if (fileContent !== null) {
      setContent(fileContent);
    }
  }, [openFile, isDirty]);

  const handleOpenFromPath = useCallback(
    async (path: string) => {
      if (isDirty) {
        const ok = window.confirm("You have unsaved changes. Open a new file anyway?");
        if (!ok) return;
      }
      const fileContent = await openFileFromPath(path);
      setContent(fileContent);
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

  const handlePrint = useCallback(() => {
    // Clean any stale print root from a previous aborted print.
    document.getElementById("glyph-print-root")?.remove();

    const printRoot = document.createElement("div");
    printRoot.id = "glyph-print-root";
    printRoot.className = "glyph-preview";
    const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
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
      const sanitized = DOMPurify.sanitize(html);
      const doc = buildHtmlDocument(sanitized, baseName, resolvedTheme);
      await invoke("save_file", { path: savePath, content: doc });
    } catch (err) {
      console.error("Failed to export HTML:", err);
    }
  }, [fileName, html, resolvedTheme]);

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
      />}
      {zenMode && (
        <div className={styles.zenHint}>Press Esc to exit zen mode</div>
      )}
      <div className={styles.panes}>
        <div className={wysiwygMode ? styles.editorFull : styles.editorPane}>
          <Editor
            ref={editorRef}
            value={content}
            onChange={setContent}
            onCursorChange={setCursor}
            resolvedTheme={resolvedTheme}
            wysiwygMode={wysiwygMode}
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
    </div>
  );
}

export default App;
