/**
 * Placeholder shown when the active tab points at a file that could no
 * longer be read on session restore (moved or deleted). Replaces the
 * editor/preview so the user understands what happened and can dismiss
 * the tab or try reopening if the file has since returned.
 *
 * v2.1.
 */

import styles from "./MissingFile.module.css";

interface MissingFileProps {
  path: string;
  onRemove: () => void;
  onRetry: () => void;
}

export default function MissingFile({ path, onRemove, onRetry }: MissingFileProps) {
  return (
    <div className={styles.wrapper} role="alert">
      <svg
        className={styles.icon}
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <path d="M14 2v6h6" />
        <line x1="9" y1="13" x2="15" y2="19" />
        <line x1="15" y1="13" x2="9" y2="19" />
      </svg>
      <h2 className={styles.title}>File not found</h2>
      <p className={styles.path}>{path}</p>
      <p className={styles.hint}>
        This file was open in a previous session but can no longer be read.
        It may have been moved, renamed, or deleted.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          Try again
        </button>
        <button type="button" className={styles.removeButton} onClick={onRemove}>
          Remove tab
        </button>
      </div>
    </div>
  );
}
