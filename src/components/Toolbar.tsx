import styles from "./Toolbar.module.css";

interface ToolbarProps {
  fileName: string | null;
  isDirty: boolean;
  theme: "light" | "dark" | "system";
  resolvedTheme: "light" | "dark";
  onToggleTheme: () => void;
  wysiwygMode: boolean;
  onToggleWysiwyg: () => void;
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="2.5" />
      <line x1="8" y1="13.5" x2="8" y2="15" />
      <line x1="1" y1="8" x2="2.5" y2="8" />
      <line x1="13.5" y1="8" x2="15" y2="8" />
      <line x1="3.05" y1="3.05" x2="4.1" y2="4.1" />
      <line x1="11.9" y1="11.9" x2="12.95" y2="12.95" />
      <line x1="3.05" y1="12.95" x2="4.1" y2="11.9" />
      <line x1="11.9" y1="4.1" x2="12.95" y2="3.05" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.5 8.5a5.5 5.5 0 1 1-7-7 4.5 4.5 0 0 0 7 7z" />
    </svg>
  );
}

function SplitPaneIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="2" width="14" height="12" rx="1" />
      <line x1="8" y1="2" x2="8" y2="14" />
    </svg>
  );
}

function WysiwygIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="2" width="14" height="12" rx="1" />
      <line x1="4" y1="5.5" x2="12" y2="5.5" />
      <line x1="4" y1="8" x2="10" y2="8" />
      <line x1="4" y1="10.5" x2="11" y2="10.5" />
    </svg>
  );
}

export default function Toolbar({
  fileName,
  isDirty,
  resolvedTheme,
  onToggleTheme,
  wysiwygMode,
  onToggleWysiwyg,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <svg
          className={styles.fileIcon}
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1z" />
          <polyline points="9 1 9 5 13 5" />
        </svg>
        <span className={styles.fileName}>{fileName ?? "Untitled"}</span>
        {isDirty && <span className={styles.dirtyDot} />}
      </div>
      <div className={styles.right}>
        <button
          className={`${styles.themeToggle} ${wysiwygMode ? styles.active : ""}`}
          onClick={onToggleWysiwyg}
          aria-label="Toggle WYSIWYG mode"
          title={wysiwygMode ? "Split pane view" : "WYSIWYG view"}
        >
          {wysiwygMode ? <SplitPaneIcon /> : <WysiwygIcon />}
        </button>
        <button
          className={styles.themeToggle}
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {resolvedTheme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    </div>
  );
}
