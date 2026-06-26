/**
 * Command palette (Cmd/Ctrl+Shift+P).
 *
 * v2.1. Lists every command contributed by an enabled plugin and runs the
 * chosen one. Filter as you type; arrow keys move the selection; Enter
 * runs; Escape closes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCommands,
  onPluginRegistryChange,
  runCommand,
  type PluginCommand,
} from "../state/plugins";
import styles from "./CommandPalette.module.css";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [commands, setCommands] = useState<PluginCommand[]>(() => getCommands());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep the command list in sync with plugin activation/deactivation.
  useEffect(() => onPluginRegistryChange(() => setCommands(getCommands())), []);

  // Reset query/selection and focus the input each time the palette opens.
  useEffect(() => {
    if (open) {
      setCommands(getCommands());
      setQuery("");
      setSelected(0);
      // Defer focus until after the element is in the DOM.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.title.toLowerCase().includes(q));
  }, [commands, query]);

  const runSelected = useCallback(
    (command: PluginCommand | undefined) => {
      if (!command) return;
      onClose();
      runCommand(command.id);
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        runSelected(filtered[selected]);
      }
    },
    [filtered, selected, onClose, runSelected],
  );

  if (!open) return null;

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder="Run a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <ul className={styles.list} role="listbox">
          {filtered.length === 0 ? (
            <li className={styles.empty}>
              {commands.length === 0
                ? "No commands. Enable a plugin that contributes commands."
                : "No matching commands"}
            </li>
          ) : (
            filtered.map((command, i) => (
              <li
                key={command.id}
                role="option"
                aria-selected={i === selected}
                className={`${styles.item} ${i === selected ? styles.active : ""}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => runSelected(command)}
              >
                {command.title}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
