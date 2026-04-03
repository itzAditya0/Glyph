import { useState, useEffect, useRef } from "react";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";
import { createHighlighter } from "shiki";
import { fromHighlighter } from "@shikijs/markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})
  .use(taskLists, { enabled: true })
  .use(footnote);

let shikiInitialized = false;
let shikiInitPromise: Promise<void> | null = null;

function initShiki(): Promise<void> {
  if (shikiInitialized) return Promise.resolve();
  if (shikiInitPromise) return shikiInitPromise;

  shikiInitPromise = createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: [
      "javascript",
      "typescript",
      "python",
      "rust",
      "bash",
      "json",
      "html",
      "css",
      "markdown",
    ],
  }).then((highlighter) => {
    md.use(
      fromHighlighter(highlighter, {
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
      })
    );
    shikiInitialized = true;
  });

  return shikiInitPromise;
}

export function useMarkdown(content: string): string {
  const [html, setHtml] = useState(() => md.render(content));
  const [shikiReady, setShikiReady] = useState(shikiInitialized);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!shikiReady) {
      initShiki().then(() => {
        if (mountedRef.current) {
          setShikiReady(true);
        }
      });
    }
  }, [shikiReady]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHtml(md.render(content));
    }, 100);

    return () => clearTimeout(timer);
  }, [content, shikiReady]);

  return html;
}
