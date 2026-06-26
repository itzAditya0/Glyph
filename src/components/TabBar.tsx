/**
 * Tab strip above the toolbar.
 *
 * v2.0 Stage 6. Renders each open tab with filename, optional dirty dot,
 * and a close button. A trailing `+` button creates a new Untitled tab.
 * Overflow scrolls horizontally.
 *
 * Each tab uses a `<div role="tab">` rather than a `<button>` so the
 * close affordance can be a real, focusable `<button>` sibling instead
 * of a nested focusable — the latter is invalid interactive-content
 * nesting and breaks Tab-key navigation for keyboard users.
 *
 * The tab bar reads its state from `TabsContext` (via `useTabs`); it
 * does not own any state itself.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTabs } from "../state/tabs";
import styles from "./TabBar.module.css";

interface TabBarProps {
  /** Returns true to proceed with closing a dirty tab, false to cancel. */
  confirmCloseDirty: (fileName: string) => boolean;
}

export default function TabBar({ confirmCloseDirty }: TabBarProps) {
  const { state, actions } = useTabs();
  const activeRef = useRef<HTMLDivElement | null>(null);

  // Drag-to-reorder state. `dragId` is the tab being dragged; `dropTargetId`
  // is the tab currently hovered as a drop position (for the insertion cue).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = "move";
      // Firefox requires data to be set for the drag to initiate.
      e.dataTransfer.setData("text/plain", id);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      if (dragId === null || dragId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTargetId(id);
    },
    [dragId],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      if (dragId === null || dragId === targetId) {
        setDragId(null);
        setDropTargetId(null);
        return;
      }
      // Build the new id order: pull the dragged id out, reinsert it before
      // the drop target (preserving left-to-right intent).
      const order = state.tabs.map((t) => t.id).filter((id) => id !== dragId);
      const targetIdx = order.indexOf(targetId);
      order.splice(targetIdx, 0, dragId);
      actions.reorder(order);
      setDragId(null);
      setDropTargetId(null);
    },
    [dragId, state.tabs, actions],
  );

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTargetId(null);
  }, []);

  // Keep the active tab scrolled into view when it changes (e.g. via Cmd+1..9
  // or after opening a file that was off-screen in the overflow).
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [state.activeId]);

  const handleClose = useCallback(
    (
      e: React.MouseEvent<HTMLElement>,
      id: string,
      isDirty: boolean,
      fileName: string,
    ) => {
      e.stopPropagation();
      if (isDirty && !confirmCloseDirty(fileName)) return;
      actions.closeOrReplace(id);
    },
    [actions, confirmCloseDirty],
  );

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, id: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        actions.switchTo(id);
      }
    },
    [actions],
  );

  return (
    <div className={styles.tabBar} role="tablist" aria-label="Open documents">
      <div className={styles.scrollRegion}>
        {state.tabs.map((tab) => {
          const isActive = tab.id === state.activeId;
          return (
            <div
              key={tab.id}
              ref={isActive ? activeRef : undefined}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              draggable
              className={[
                styles.tab,
                isActive ? styles.active : "",
                tab.missing ? styles.missing : "",
                dragId === tab.id ? styles.dragging : "",
                dropTargetId === tab.id ? styles.dropTarget : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => actions.switchTo(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
              title={tab.missing ? `${tab.path} (not found)` : tab.path ?? tab.fileName}
            >
              <span className={styles.tabLabel}>{tab.fileName}</span>
              {tab.isDirty && <span className={styles.dirtyDot} aria-label="Unsaved changes" />}
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Close ${tab.fileName}`}
                className={styles.closeButton}
                onClick={(e) => handleClose(e, tab.id, tab.isDirty, tab.fileName)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className={styles.newTabButton}
        onClick={() => actions.newUntitled()}
        aria-label="New tab"
        title="New tab (⌘T)"
      >
        +
      </button>
    </div>
  );
}
