import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { wysiwyg } from "../extensions/wysiwyg";
import { imagePreview } from "../extensions/imagePreview";
import styles from "./Editor.module.css";

// Vim is ~130 KB; lazy-loaded on first enable so users who never toggle it
// pay nothing. Module-scoped cache means subsequent toggles reuse the import.
let vimExtensionPromise: Promise<Extension> | null = null;
function loadVimExtension(): Promise<Extension> {
  if (vimExtensionPromise === null) {
    vimExtensionPromise = import("@replit/codemirror-vim").then((mod) =>
      mod.vim(),
    );
  }
  return vimExtensionPromise;
}

interface CursorPosition {
  line: number;
  col: number;
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (pos: CursorPosition) => void;
  resolvedTheme?: "light" | "dark";
  wysiwygMode?: boolean;
  vimMode?: boolean;
}

const themeCompartment = new Compartment();
const wysiwygCompartment = new Compartment();
const imagePreviewCompartment = new Compartment();
// Vim wraps its own keymap + modal cursor; placed BEFORE the default keymaps
// so normal-mode `hjkl` etc. win over CodeMirror's defaults.
const vimCompartment = new Compartment();

function wrapSelection(view: EditorView, marker: string): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    // No selection — insert markers with cursor between
    const insert = marker + marker;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + marker.length },
    });
  } else {
    // Wrap selection
    const text = view.state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: marker + text + marker },
      selection: { anchor: from + marker.length, head: to + marker.length },
    });
  }
  return true;
}

export interface EditorHandle {
  openSearch: () => void;
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({
  value,
  onChange,
  onCursorChange,
  resolvedTheme,
  wysiwygMode = false,
  vimMode = false,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>(null);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);

  // Keep refs in sync
  onChangeRef.current = onChange;
  onCursorChangeRef.current = onCursorChange;

  useImperativeHandle(ref, () => ({
    openSearch: () => {
      if (viewRef.current) openSearchPanel(viewRef.current);
    },
  }));

  // Create editor on mount, destroy on unmount
  useEffect(() => {
    if (!containerRef.current) return;

    const markdownKeybindings = keymap.of([
      {
        key: "Mod-b",
        run: (view) => wrapSelection(view, "**"),
      },
      {
        key: "Mod-i",
        run: (view) => wrapSelection(view, "*"),
      },
      {
        key: "Mod-k",
        run: (view) => {
          const { from, to } = view.state.selection.main;
          const text = view.state.sliceDoc(from, to) || "text";
          const insert = `[${text}](url)`;
          view.dispatch({
            changes: { from, to, insert },
          });
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        // Vim is first so its keymap takes priority over the default keymaps
        // registered below. Populated lazily in the vimMode effect; the
        // initial extension slot is empty even when `vimMode` is true so
        // that the editor mount doesn't block on the dynamic import.
        vimCompartment.of([]),
        markdown({ codeLanguages: languages, extensions: GFM }),
        history(),
        markdownKeybindings,
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        search({ top: true }),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        themeCompartment.of(resolvedTheme === "dark" ? oneDark : []),
        wysiwygCompartment.of(wysiwygMode ? wysiwyg() : []),
        imagePreviewCompartment.of(wysiwygMode ? [] : imagePreview()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            onCursorChangeRef.current?.({
              line: line.number,
              col: pos - line.from + 1,
            });
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle external value updates (file open)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (value !== currentContent) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: value,
        },
      });
    }
  }, [value]);

  // Handle theme changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartment.reconfigure(
        resolvedTheme === "dark" ? oneDark : []
      ),
    });
  }, [resolvedTheme]);

  // Handle WYSIWYG mode changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: [
        wysiwygCompartment.reconfigure(wysiwygMode ? wysiwyg() : []),
        imagePreviewCompartment.reconfigure(wysiwygMode ? [] : imagePreview()),
      ],
    });
  }, [wysiwygMode]);

  // Handle Vim mode changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    let cancelled = false;
    if (vimMode) {
      loadVimExtension().then((extension) => {
        if (cancelled) return;
        const v = viewRef.current;
        if (!v) return;
        v.dispatch({ effects: vimCompartment.reconfigure(extension) });
      });
    } else {
      view.dispatch({ effects: vimCompartment.reconfigure([]) });
    }
    return () => {
      cancelled = true;
    };
  }, [vimMode]);

  return <div ref={containerRef} className={styles.editor} />;
});

export default Editor;
