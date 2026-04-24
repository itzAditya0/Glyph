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

import { useCallback, useEffect, useRef } from "react";
import { useTabs } from "../state/tabs";
import styles from "./TabBar.module.css";

interface TabBarProps {
  /** Returns true to proceed with closing a dirty tab, false to cancel. */
  confirmCloseDirty: (fileName: string) => boolean;
}

export default function TabBar({ confirmCloseDirty }: TabBarProps) {
  const { state, actions } = useTabs();
  const activeRef = useRef<HTMLDivElement | null>(null);

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
              className={`${styles.tab} ${isActive ? styles.active : ""}`}
              onClick={() => actions.switchTo(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
              title={tab.path ?? tab.fileName}
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
