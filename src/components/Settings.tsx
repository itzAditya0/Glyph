/**
 * Glyph settings modal.
 *
 * Stage 2 introduces this shell with a single Editor > Vim mode toggle
 * so it also serves as the UI pattern for later stages that add rows
 * (theme picker in Stage 4, sidebar width in Stage 5, plugin enable
 * list in Stage 7). Settings apply live — no "Apply" button, no form
 * submit — and each change is persisted to `<app-data>/Glyph/config.json`
 * via `saveConfig`.
 */

import { useCallback, useEffect, useRef } from "react";
import styles from "./Settings.module.css";

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  vimMode: boolean;
  onToggleVimMode: () => void;
}

export default function Settings({
  open,
  onClose,
  vimMode,
  onToggleVimMode,
}: SettingsProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  // Remember the element that had focus when the modal opened so we can
  // restore it on close (keyboard users should not land on the page root).
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Close on Escape. Registered while open so other shortcuts keep firing otherwise.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus management via explicit open-transition tracking (StrictMode-safe).
  // On open: remember the element that was focused before, move focus into
  // the dialog. On close: restore focus. An open→open render never repeats
  // either branch, so React 19 StrictMode's double-effect invocation can't
  // accidentally re-capture an already-focused close button as the return target.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
    } else if (!open && wasOpenRef.current) {
      returnFocusRef.current?.focus?.();
      returnFocusRef.current = null;
    }
    wasOpenRef.current = open;
  }, [open]);

  const stopPropagation = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    [],
  );

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="glyph-settings-title"
        onClick={stopPropagation}
      >
        <header className={styles.header}>
          <h2 id="glyph-settings-title" className={styles.title}>
            Settings
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close settings"
            title="Close (Esc)"
          >
            ×
          </button>
        </header>

        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Editor</h3>
            <SettingRow
              id="glyph-vim-mode"
              label="Vim mode"
              description="Enable modal Vim keybindings in the editor."
              checked={vimMode}
              onChange={onToggleVimMode}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

interface SettingRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}

function SettingRow({ id, label, description, checked, onChange }: SettingRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <label htmlFor={id} className={styles.rowLabel}>
          {label}
        </label>
        {description && <p className={styles.rowDescription}>{description}</p>}
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={styles.toggle}
      />
    </div>
  );
}
