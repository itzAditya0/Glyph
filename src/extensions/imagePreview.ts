import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

class ImagePreviewWidget extends WidgetType {
  constructor(private src: string, private alt: string) {
    super();
  }

  eq(other: ImagePreviewWidget) {
    return this.src === other.src && this.alt === other.alt;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-image-preview";

    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.className = "cm-image-preview-img";
    img.onerror = () => {
      wrapper.style.display = "none";
    };

    wrapper.appendChild(img);
    return wrapper;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);

  tree.iterate({
    enter(node) {
      if (node.name === "Image") {
        const text = view.state.sliceDoc(node.from, node.to);
        const match = text.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
        if (match) {
          const line = view.state.doc.lineAt(node.to);
          decorations.push(
            Decoration.widget({
              widget: new ImagePreviewWidget(match[2], match[1]),
              block: true,
            }).range(line.to)
          );
        }
      }
    },
  });

  return Decoration.set(decorations, true);
}

const imagePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

const imagePreviewTheme = EditorView.baseTheme({
  ".cm-image-preview": {
    padding: "4px 0",
    maxWidth: "100%",
  },
  ".cm-image-preview-img": {
    maxWidth: "300px",
    maxHeight: "200px",
    borderRadius: "4px",
    border: "1px solid var(--color-border, #e1e4e8)",
    display: "block",
    objectFit: "contain",
  },
});

export function imagePreview() {
  return [imagePreviewPlugin, imagePreviewTheme];
}
