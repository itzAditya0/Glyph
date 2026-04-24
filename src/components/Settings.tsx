/**
 * Glyph settings modal.
 *
 * Introduced in Stage 2 for the Vim toggle; now also hosts Stage 4's
 * Appearance section for custom preview themes and is shaped to accept
 * the Stage 5 sidebar-width slider and Stage 7 plugin list.
 *
 * `SettingRow` is a layout-only primitive: caller provides the input via
 * the `control` prop so checkboxes, selects, sliders, and future custom
 * controls all share the same row chrome and accessibility wiring.
 * Settings apply live — no "Apply" button, no form submit — and each
 * change is persisted to `<app-data>/Glyph/config.json` via `saveConfig`.
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { PreviewTheme } from "../state/themes";
import styles from "./Settings.module.css";

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  vimMode: boolean;
  onToggleVimMode: () => void;
  themes: PreviewTheme[];
  previewTheme: string | null;
  onPreviewThemeChange: (name: string | null) => void;
}

export default function Settings({
  open,
  onClose,
  vimMode,
  onToggleVimMode,
  themes,
  previewTheme,
  onPreviewThemeChange,
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

  const handleThemeSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onPreviewThemeChange(value === "" ? null : value);
    },
    [onPreviewThemeChange],
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
              control={
                <input
                  id="glyph-vim-mode"
                  type="checkbox"
                  checked={vimMode}
                  onChange={onToggleVimMode}
                  className={styles.toggle}
                />
              }
            />
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Appearance</h3>
            <SettingRow
              id="glyph-preview-theme"
              label="Preview theme"
              description={
                themes.length === 0
                  ? "Drop .css files into the Glyph/themes folder in your app-data directory to add themes."
                  : "Choose a user-supplied stylesheet for the preview pane."
              }
              control={
                <select
                  id="glyph-preview-theme"
                  className={styles.select}
                  value={previewTheme ?? ""}
                  onChange={handleThemeSelect}
                  disabled={themes.length === 0}
                >
                  <option value="">Default</option>
                  {themes.map((theme) => (
                    <option key={theme.name} value={theme.name}>
                      {theme.name}
                    </option>
                  ))}
                </select>
              }
            />
          </section>
        </div>
      </div>
    </div>
  );
}

interface SettingRowProps {
  /** Label `htmlFor` target — should match the control's `id`. */
  id: string;
  label: string;
  description?: string;
  control: ReactNode;
}

function SettingRow({ id, label, description, control }: SettingRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <label htmlFor={id} className={styles.rowLabel}>
          {label}
        </label>
        {description && <p className={styles.rowDescription}>{description}</p>}
      </div>
      {control}
    </div>
  );
}
