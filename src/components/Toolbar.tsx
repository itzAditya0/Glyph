import { useState } from "react";
import RecentFiles from "./RecentFiles";
import styles from "./Toolbar.module.css";

interface RecentFile {
  path: string;
  openedAt: number;
}

interface ToolbarProps {
  fileName: string | null;
  filePath: string | null;
  isDirty: boolean;
  theme: "light" | "dark" | "system";
  resolvedTheme: "light" | "dark";
  onToggleTheme: () => void;
  wysiwygMode: boolean;
  onToggleWysiwyg: () => void;
  recentFiles: RecentFile[];
  onOpenRecentFile: (path: string) => void;
  onClearRecentFiles: () => void;
  onOpenSearch: () => void;
  onExportHtml: () => void;
  onPrint: () => void;
  onCopyAsRichText: () => void;
  onOpenSettings: () => void;
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

function SearchIcon() {
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
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.2" y1="10.2" x2="14" y2="14" />
    </svg>
  );
}

function SettingsIcon() {
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
      <circle cx="8" cy="8" r="2.5" />
      <path d="M13.6 9.6a1 1 0 0 0 .2 1.1l.05.05a1.25 1.25 0 1 1-1.77 1.77l-.05-.05a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.92V13.5a1.25 1.25 0 1 1-2.5 0v-.05a1 1 0 0 0-.65-.92 1 1 0 0 0-1.1.2l-.05.05a1.25 1.25 0 1 1-1.77-1.77l.05-.05a1 1 0 0 0 .2-1.1 1 1 0 0 0-.92-.6H2.5a1.25 1.25 0 1 1 0-2.5h.05a1 1 0 0 0 .92-.65 1 1 0 0 0-.2-1.1l-.05-.05a1.25 1.25 0 1 1 1.77-1.77l.05.05a1 1 0 0 0 1.1.2h.04a1 1 0 0 0 .6-.92V2.5a1.25 1.25 0 1 1 2.5 0v.05a1 1 0 0 0 .6.92 1 1 0 0 0 1.1-.2l.05-.05a1.25 1.25 0 1 1 1.77 1.77l-.05.05a1 1 0 0 0-.2 1.1v.04a1 1 0 0 0 .92.6H13.5a1.25 1.25 0 1 1 0 2.5h-.05a1 1 0 0 0-.92.6z" />
    </svg>
  );
}

function CopyIcon() {
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
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
    </svg>
  );
}

function PrintIcon() {
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
      <polyline points="4 5 4 2 12 2 12 5" />
      <rect x="2" y="5" width="12" height="7" rx="1" />
      <rect x="4" y="9" width="8" height="5" rx="0.5" />
    </svg>
  );
}

function ExportIcon() {
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
      <path d="M8 2v8" />
      <polyline points="5 5 8 2 11 5" />
      <path d="M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" />
    </svg>
  );
}

function ClockIcon() {
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
      <circle cx="8" cy="8" r="6.5" />
      <polyline points="8 4 8 8 11 9.5" />
    </svg>
  );
}

export default function Toolbar({
  fileName,
  filePath,
  isDirty,
  resolvedTheme,
  onToggleTheme,
  wysiwygMode,
  onToggleWysiwyg,
  recentFiles,
  onOpenRecentFile,
  onClearRecentFiles,
  onOpenSearch,
  onExportHtml,
  onPrint,
  onCopyAsRichText,
  onOpenSettings,
}: ToolbarProps) {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const [showRecent, setShowRecent] = useState(false);

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
        <span className={styles.fileName} title={filePath ?? "Untitled"}>{fileName ?? "Untitled"}</span>
        {isDirty && <span className={styles.dirtyDot} />}
        <div className={styles.recentWrapper}>
          <button
            className={styles.themeToggle}
            onClick={() => setShowRecent((s) => !s)}
            aria-label="Recent files"
            aria-expanded={showRecent}
            title="Recent files"
          >
            <ClockIcon />
          </button>
          {showRecent && (
            <RecentFiles
              files={recentFiles}
              onOpenFile={onOpenRecentFile}
              onClear={onClearRecentFiles}
              onClose={() => setShowRecent(false)}
            />
          )}
        </div>
      </div>
      <div className={styles.right}>
        <button
          className={styles.themeToggle}
          onClick={onOpenSearch}
          aria-label="Find & Replace"
          title={isMac ? "Find & Replace (⌘F)" : "Find & Replace (Ctrl+F)"}
        >
          <SearchIcon />
        </button>
        <button
          className={styles.themeToggle}
          onClick={onExportHtml}
          aria-label="Export as HTML"
          title={isMac ? "Export as HTML (⌘⇧E)" : "Export as HTML (Ctrl+Shift+E)"}
        >
          <ExportIcon />
        </button>
        <button
          className={styles.themeToggle}
          onClick={onPrint}
          aria-label="Print / Save as PDF"
          title={isMac ? "Print / Save as PDF (⌘P)" : "Print / Save as PDF (Ctrl+P)"}
        >
          <PrintIcon />
        </button>
        <button
          className={styles.themeToggle}
          onClick={onCopyAsRichText}
          aria-label="Copy as rich text"
          title={isMac ? "Copy as rich text (⌘⇧C)" : "Copy as rich text (Ctrl+Shift+C)"}
        >
          <CopyIcon />
        </button>
        <button
          className={`${styles.themeToggle} ${wysiwygMode ? styles.active : ""}`}
          onClick={onToggleWysiwyg}
          aria-pressed={wysiwygMode}
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
        <button
          className={styles.themeToggle}
          onClick={onOpenSettings}
          aria-label="Settings"
          title={isMac ? "Settings (⌘,)" : "Settings (Ctrl+,)"}
        >
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}
