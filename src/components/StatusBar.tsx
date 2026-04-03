import styles from "./StatusBar.module.css";

interface StatusBarProps {
  cursorLine: number;
  cursorCol: number;
  wordCount: number;
  isDirty: boolean;
}

export default function StatusBar({
  cursorLine,
  cursorCol,
  wordCount,
  isDirty,
}: StatusBarProps) {
  return (
    <div className={styles.statusBar}>
      <span className={styles.item}>
        Ln {cursorLine}, Col {cursorCol}
      </span>
      <span className={styles.separator} />
      <span className={styles.item}>Words: {wordCount}</span>
      <span className={styles.separator} />
      <span className={styles.item}>UTF-8</span>
      <span className={styles.separator} />
      <span className={isDirty ? styles.unsaved : styles.saved}>
        {isDirty ? "Unsaved" : "Saved \u2713"}
      </span>
    </div>
  );
}
