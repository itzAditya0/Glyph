import { useState, useEffect, useRef } from "react";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";
import katex from "@vscode/markdown-it-katex";
import { createHighlighter } from "shiki";
import { fromHighlighter } from "@shikijs/markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})
  .use(taskLists, { enabled: true })
  .use(footnote)
  .use(katex, { output: "html", throwOnError: false });

/**
 * Intercept ```mermaid fences and emit a placeholder that a post-mount effect
 * (in App.tsx) or the pre-render utility (src/utils/mermaidRender.ts) can
 * transform into SVG. Wraps whatever `fence` rule is currently installed and
 * delegates non-mermaid fences to it, so Shiki's highlighter keeps working.
 *
 * Must be invoked BOTH at module load (covers the pre-Shiki window) AND again
 * after Shiki's plugin attaches — because Shiki overwrites `renderer.rules.fence`.
 */
function installMermaidFence(mdInstance: MarkdownIt) {
  const downstream = mdInstance.renderer.rules.fence;
  mdInstance.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || "").trim().toLowerCase();
    if (info === "mermaid") {
      // Mermaid source contains `-->` (flowchart arrows), which DOMPurify
      // treats as an HTML-comment-terminator and strips from data-attrs.
      // URL-encode to keep the attribute a safe alphanumeric+%xx payload;
      // decode with decodeURIComponent when reading.
      const encoded = encodeURIComponent(token.content);
      const escaped = mdInstance.utils.escapeHtml(token.content);
      return `<pre class="mermaid" data-source="${encoded}">${escaped}</pre>`;
    }
    return downstream
      ? downstream(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };
}

installMermaidFence(md);

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
    // Shiki replaces the `fence` rule — re-install our override so it wraps Shiki's.
    installMermaidFence(md);
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
