import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
      if (e.key === "Escape" && zenMode) {
        setZenMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [content, saveFile, saveFileAs, handleOpenFile, zenMode]);

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
        />
      )}
    </div>
  );
}

export default App;
