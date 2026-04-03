import DOMPurify from "dompurify";
import styles from "./Preview.module.css";

interface PreviewProps {
  html: string;
}

export function Preview({ html }: PreviewProps) {
  const sanitized = DOMPurify.sanitize(html);
  const isEmpty = sanitized.trim() === "";

  if (isEmpty) {
    return (
      <div className={styles.preview}>
        <div className={styles.empty}>
          Start typing or open a file (Cmd+O)
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.preview}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
