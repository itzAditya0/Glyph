/**
 * Document outline / table-of-contents sidebar.
 *
 * v2.0 Stage 5. Takes the heading list from `useHeadings` and renders a
 * scrollable, nested list. Clicking a heading scrolls the editor to the
 * source line and the preview to the anchor id that `markdown-it-anchor`
 * attached. A passive IntersectionObserver on the preview's headings keeps
 * the currently-visible heading highlighted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HeadingEntry } from "../hooks/useHeadings";
import styles from "./Outline.module.css";

interface OutlineProps {
  headings: HeadingEntry[];
  /** Fires when the user clicks a heading. Receives the heading's source line + slug. */
  onHeadingClick: (heading: HeadingEntry) => void;
}

export default function Outline({ headings, onHeadingClick }: OutlineProps) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  // Track the topmost visible heading in the preview pane via
  // IntersectionObserver. `.glyph-preview-root` is the preview wrapper
  // added in Stage 4; we observe heading children inside it.
  useEffect(() => {
    const preview = document.querySelector<HTMLElement>(".glyph-preview-root");
    if (!preview) return;

    // Re-scan on every heading change so newly parsed headings get observed.
    const targets = Array.from(
      preview.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
    );
    if (targets.length === 0) return;

    const visibleIds = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleIds.add(entry.target.id);
          } else {
            visibleIds.delete(entry.target.id);
          }
        }
        // Pick the first heading (in document order) that is currently visible.
        const first = targets.find((el) => visibleIds.has(el.id));
        if (first) setActiveSlug(first.id);
      },
      // `rootMargin` biases toward the heading that just crossed the top edge.
      { root: preview, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    for (const t of targets) {
      if (t.id) observer.observe(t);
    }
    return () => observer.disconnect();
  }, [headings]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, heading: HeadingEntry) => {
      e.preventDefault();
      setActiveSlug(heading.slug);
      onHeadingClick(heading);
    },
    [onHeadingClick],
  );

  const items = useMemo(() => {
    if (headings.length === 0) {
      return <li className={styles.empty}>No headings</li>;
    }
    return headings.map((heading, i) => (
      <li
        key={`${heading.slug}-${i}`}
        className={styles.item}
        style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}
      >
        <button
          type="button"
          className={`${styles.link} ${activeSlug === heading.slug ? styles.active : ""}`}
          onClick={(e) => handleClick(e, heading)}
          title={heading.text}
        >
          {heading.text}
        </button>
      </li>
    ));
  }, [headings, activeSlug, handleClick]);

  return (
    <nav
      ref={containerRef}
      className={styles.outline}
      aria-label="Document outline"
    >
      <div className={styles.header}>Outline</div>
      <ul className={styles.list}>{items}</ul>
    </nav>
  );
}
