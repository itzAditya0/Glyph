import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { EditorState, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

// --- Widget Types ---

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-wysiwyg-hr";
    return hr;
  }
}

class ImageWidget extends WidgetType {
  constructor(private src: string, private alt: string) {
    super();
  }

  eq(other: ImageWidget) {
    return this.src === other.src && this.alt === other.alt;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-wysiwyg-image-wrapper";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.className = "cm-wysiwyg-image";
    img.onerror = () => {
      img.style.display = "none";
      const fallback = document.createElement("span");
      fallback.className = "cm-wysiwyg-image-error";
      fallback.textContent = `[Image: ${this.alt || this.src}]`;
      wrapper.appendChild(fallback);
    };
    wrapper.appendChild(img);
    return wrapper;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(private checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked;
  }

  toDOM() {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = this.checked;
    cb.className = "cm-wysiwyg-checkbox";
    cb.disabled = true;
    return cb;
  }
}

// --- Helpers ---

function isCursorInRange(
  state: EditorState,
  from: number,
  to: number
): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) {
      return true;
    }
  }
  return false;
}

// --- Build Decorations ---

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter(node) {
      const { from, to } = node;

      // Skip if cursor is inside this node (reveal raw markdown)
      if (isCursorInRange(state, from, to)) {
        // For block-level nodes, only skip if cursor is specifically in this node
        // For inline nodes, always skip to reveal syntax
        const nodeType = node.name;
        if (
          nodeType === "Emphasis" ||
          nodeType === "StrongEmphasis" ||
          nodeType === "Strikethrough" ||
          nodeType === "InlineCode" ||
          nodeType === "Link" ||
          nodeType === "Image"
        ) {
          return false; // skip this subtree
        }
      }

      switch (node.name) {
        // --- Headings ---
        case "ATXHeading1":
        case "ATXHeading2":
        case "ATXHeading3":
        case "ATXHeading4":
        case "ATXHeading5":
        case "ATXHeading6": {
          const level = node.name.charAt(node.name.length - 1);
          decorations.push(
            Decoration.line({
              class: `cm-wysiwyg-h${level}`,
            }).range(state.doc.lineAt(from).from)
          );
          break;
        }

        // --- Hide heading markers (# ## ### etc.) ---
        case "HeaderMark": {
          // Check if cursor is on this line
          const line = state.doc.lineAt(from);
          if (!isCursorInRange(state, line.from, line.to)) {
            // Hide the marker and the space after it
            const endPos = Math.min(to + 1, state.doc.length);
            decorations.push(
              Decoration.replace({}).range(from, endPos)
            );
          }
          break;
        }

        // --- Bold ---
        case "StrongEmphasis": {
          decorations.push(
            Decoration.mark({ class: "cm-wysiwyg-strong" }).range(from, to)
          );
          break;
        }

        // --- Italic ---
        case "Emphasis": {
          decorations.push(
            Decoration.mark({ class: "cm-wysiwyg-em" }).range(from, to)
          );
          break;
        }

        // --- Strikethrough ---
        case "Strikethrough": {
          decorations.push(
            Decoration.mark({ class: "cm-wysiwyg-strikethrough" }).range(
              from,
              to
            )
          );
          break;
        }

        // --- Hide emphasis/strong/strikethrough markers ---
        case "EmphasisMark":
        case "StrikethroughMark": {
          // Find the parent node to check cursor
          const parent = node.node.parent;
          if (parent && !isCursorInRange(state, parent.from, parent.to)) {
            decorations.push(Decoration.replace({}).range(from, to));
          }
          break;
        }

        // --- Inline code ---
        case "InlineCode": {
          decorations.push(
            Decoration.mark({ class: "cm-wysiwyg-inline-code" }).range(
              from,
              to
            )
          );
          break;
        }

        // --- Hide code marks (backticks) ---
        case "CodeMark": {
          const parent = node.node.parent;
          if (parent && !isCursorInRange(state, parent.from, parent.to)) {
            decorations.push(Decoration.replace({}).range(from, to));
          }
          break;
        }

        // --- Code blocks ---
        case "FencedCode": {
          // Style each line in the code block
          const startLine = state.doc.lineAt(from).number;
          const endLine = state.doc.lineAt(to).number;
          for (let i = startLine; i <= endLine; i++) {
            const line = state.doc.line(i);
            decorations.push(
              Decoration.line({ class: "cm-wysiwyg-codeblock" }).range(
                line.from
              )
            );
          }
          break;
        }

        // --- Blockquotes ---
        case "Blockquote": {
          const startLine = state.doc.lineAt(from).number;
          const endLine = state.doc.lineAt(to).number;
          for (let i = startLine; i <= endLine; i++) {
            const line = state.doc.line(i);
            decorations.push(
              Decoration.line({ class: "cm-wysiwyg-blockquote" }).range(
                line.from
              )
            );
          }
          break;
        }

        // --- Hide blockquote markers (>) ---
        case "QuoteMark": {
          if (!isCursorInRange(state, from, to + 1)) {
            const endPos = Math.min(to + 1, state.doc.length);
            decorations.push(Decoration.replace({}).range(from, endPos));
          }
          break;
        }

        // --- Horizontal rules ---
        case "HorizontalRule": {
          if (!isCursorInRange(state, from, to)) {
            decorations.push(
              Decoration.replace({
                widget: new HorizontalRuleWidget(),
                block: true,
              }).range(from, to)
            );
          }
          break;
        }

        // --- Links ---
        case "Link": {
          const textContent = state.sliceDoc(from, to);
          const match = textContent.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
          if (match) {
            const linkTextStart = from + 1; // after [
            const linkTextEnd = linkTextStart + match[1].length;
            // Style the link text
            decorations.push(
              Decoration.mark({ class: "cm-wysiwyg-link" }).range(
                linkTextStart,
                linkTextEnd
              )
            );
            // Hide [ before text
            decorations.push(
              Decoration.replace({}).range(from, linkTextStart)
            );
            // Hide ](url) after text
            decorations.push(
              Decoration.replace({}).range(linkTextEnd, to)
            );
          }
          break;
        }

        // --- Images ---
        case "Image": {
          if (!isCursorInRange(state, from, to)) {
            const textContent = state.sliceDoc(from, to);
            const match = textContent.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
            if (match) {
              decorations.push(
                Decoration.replace({
                  widget: new ImageWidget(match[2], match[1]),
                  block: true,
                }).range(from, to)
              );
            }
          }
          break;
        }

        // --- Task list markers ---
        case "TaskMarker": {
          if (!isCursorInRange(state, from, to)) {
            const text = state.sliceDoc(from, to);
            const checked = text.includes("x") || text.includes("X");
            decorations.push(
              Decoration.replace({
                widget: new CheckboxWidget(checked),
              }).range(from, to)
            );
          }
          break;
        }
      }
    },
  });

  return Decoration.set(decorations, true);
}

// --- ViewPlugin ---

const wysiwygPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// --- Theme ---

const wysiwygTheme = EditorView.baseTheme({
  // Headings
  ".cm-wysiwyg-h1": {
    fontSize: "2em",
    fontWeight: "700",
    lineHeight: "1.3",
    paddingBottom: "4px",
    borderBottom: "1px solid var(--color-border, #e1e4e8)",
  },
  ".cm-wysiwyg-h2": {
    fontSize: "1.5em",
    fontWeight: "600",
    lineHeight: "1.3",
    paddingBottom: "4px",
    borderBottom: "1px solid var(--color-border, #e1e4e8)",
  },
  ".cm-wysiwyg-h3": {
    fontSize: "1.25em",
    fontWeight: "600",
    lineHeight: "1.3",
  },
  ".cm-wysiwyg-h4": {
    fontSize: "1.1em",
    fontWeight: "600",
    lineHeight: "1.3",
  },
  ".cm-wysiwyg-h5": {
    fontSize: "1em",
    fontWeight: "600",
    lineHeight: "1.3",
  },
  ".cm-wysiwyg-h6": {
    fontSize: "0.9em",
    fontWeight: "600",
    lineHeight: "1.3",
    color: "var(--color-text-secondary, #656d76)",
  },

  // Bold
  ".cm-wysiwyg-strong": {
    fontWeight: "700",
  },

  // Italic
  ".cm-wysiwyg-em": {
    fontStyle: "italic",
  },

  // Strikethrough
  ".cm-wysiwyg-strikethrough": {
    textDecoration: "line-through",
    color: "var(--color-text-muted, #8b949e)",
  },

  // Inline code
  ".cm-wysiwyg-inline-code": {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "0.9em",
    padding: "1px 4px",
    borderRadius: "3px",
    background: "var(--color-bg-tertiary, #f0f1f3)",
  },

  // Code blocks
  ".cm-wysiwyg-codeblock": {
    background: "var(--color-bg-secondary, #f8f9fa)",
    borderLeft: "3px solid var(--color-accent, #0969da)",
    paddingLeft: "12px !important",
  },

  // Blockquotes
  ".cm-wysiwyg-blockquote": {
    borderLeft: "4px solid var(--color-accent, #0969da)",
    paddingLeft: "12px !important",
    color: "var(--color-text-secondary, #656d76)",
    fontStyle: "italic",
  },

  // Links
  ".cm-wysiwyg-link": {
    color: "var(--color-accent, #0969da)",
    textDecoration: "underline",
    cursor: "pointer",
  },

  // Horizontal rule
  ".cm-wysiwyg-hr": {
    border: "none",
    borderTop: "2px solid var(--color-border, #e1e4e8)",
    margin: "8px 0",
  },

  // Images
  ".cm-wysiwyg-image-wrapper": {
    padding: "8px 0",
  },
  ".cm-wysiwyg-image": {
    maxWidth: "100%",
    borderRadius: "6px",
    display: "block",
  },
  ".cm-wysiwyg-image-error": {
    color: "var(--color-text-muted, #8b949e)",
    fontStyle: "italic",
  },

  // Checkboxes
  ".cm-wysiwyg-checkbox": {
    marginRight: "4px",
    verticalAlign: "middle",
    accentColor: "var(--color-accent, #0969da)",
  },
});

// --- Export ---

export function wysiwyg() {
  return [wysiwygPlugin, wysiwygTheme];
}
