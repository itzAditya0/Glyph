/**
 * Extracts the heading outline of the active document for the TOC sidebar.
 *
 * v2.0 Stage 5. Shares the `md` instance exported from `useMarkdown.ts`
 * (no second markdown parse), reads markdown-it tokens directly, and
 * produces a flat list of headings with source lines and anchor slugs
 * that match the `markdown-it-anchor` plugin's output.
 *
 * Debounced the same 200 ms as the preview render so typing doesn't
 * thrash the sidebar.
 */

import { useEffect, useState } from "react";
import { md } from "./useMarkdown";

export interface HeadingEntry {
  /** 1..6 — matches the h-tag level. */
  level: number;
  /** Plain text shown in the sidebar. */
  text: string;
  /** Anchor slug — matches the `id` `markdown-it-anchor` attaches to each heading. */
  slug: string;
  /** 0-based line number in the source, used to scroll the editor. */
  line: number;
}

/**
 * GitHub-style slug: lowercase, strip non-word characters, collapse runs of
 * whitespace/hyphens, and dedupe repeats with `-1`, `-2`, … suffixes.
 * Must match the default slugify in markdown-it-anchor so the ids line up.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/[^\w\u00c0-\uffff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Walk the token stream once and emit a heading for each `heading_open` node. */
function extractHeadings(source: string): HeadingEntry[] {
  const tokens = md.parse(source, {});
  const result: HeadingEntry[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open.type !== "heading_open") continue;
    const inline = tokens[i + 1];
    if (!inline || inline.type !== "inline") continue;

    const level = parseInt(open.tag.slice(1), 10);
    const text = (inline.content ?? "").trim();
    if (!text) continue;

    const base = slugify(text);
    let slug = base;
    const count = seen.get(base) ?? 0;
    if (count > 0) slug = `${base}-${count}`;
    seen.set(base, count + 1);

    const line = open.map ? open.map[0] : 0;
    result.push({ level, text, slug, line });
  }

  return result;
}

export function useHeadings(content: string): HeadingEntry[] {
  const [headings, setHeadings] = useState<HeadingEntry[]>(() => extractHeadings(content));

  useEffect(() => {
    const timer = setTimeout(() => {
      setHeadings(extractHeadings(content));
    }, 200);
    return () => clearTimeout(timer);
  }, [content]);

  return headings;
}
