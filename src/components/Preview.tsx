import DOMPurify from "dompurify";
import styles from "./Preview.module.css";

interface PreviewProps {
  html: string;
}

export function Preview({ html }: PreviewProps) {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  // `data-source` preserves the original diagram text on mermaid placeholders
  // so theme re-renders can restore it after mermaid.run replaces innerHTML.
  // DOMPurify v3 defaults ALLOW_DATA_ATTR to false; we re-enable because
  // markdown-it has `html: false` (no user-supplied HTML reaches sanitize).
  const sanitized = DOMPurify.sanitize(html, { ALLOW_DATA_ATTR: true });
  const isEmpty = sanitized.trim() === "";

  // `glyph-preview-root` is the stable, non-CSS-Modules class that user
  // themes under `<app-data>/Glyph/themes/*.css` target. Keep the name
  // stable across releases.
  const rootClassName = `${styles.preview} glyph-preview-root`;

  if (isEmpty) {
    return (
      <div className={rootClassName}>
        <div className={styles.empty}>
          Start typing or open a file ({isMac ? "⌘" : "Ctrl+"}O)
        </div>
      </div>
    );
  }

  return (
    <div
      className={rootClassName}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
