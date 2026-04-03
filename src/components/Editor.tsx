import { useRef, useEffect } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { wysiwyg } from "../extensions/wysiwyg";
import styles from "./Editor.module.css";

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
}

const themeCompartment = new Compartment();
const wysiwygCompartment = new Compartment();

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

export default function Editor({
  value,
  onChange,
  onCursorChange,
  resolvedTheme,
  wysiwygMode = false,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);

  // Keep refs in sync
  onChangeRef.current = onChange;
  onCursorChangeRef.current = onCursorChange;

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
        markdown({ codeLanguages: languages }),
        history(),
        markdownKeybindings,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        themeCompartment.of(resolvedTheme === "dark" ? oneDark : []),
        wysiwygCompartment.of(wysiwygMode ? wysiwyg() : []),
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

    const ext = wysiwygMode ? wysiwyg() : [];
    console.log("WYSIWYG reconfigure:", wysiwygMode, ext);
    view.dispatch({
      effects: wysiwygCompartment.reconfigure(ext),
    });
  }, [wysiwygMode]);

  return <div ref={containerRef} className={styles.editor} />;
}
