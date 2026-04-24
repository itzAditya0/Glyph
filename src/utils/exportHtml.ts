/**
 * Builds a standalone, self-contained HTML document from sanitized preview HTML.
 *
 * The exported file carries an inline stylesheet derived from the app's
 * design tokens (src/styles/main.css) and preview rules
 * (src/components/Preview.module.css), remapped to a non-modularized
 * `.glyph-preview` container selector so the file renders identically
 * outside the app.
 *
 * Shiki code blocks already carry inline `style=` attributes on their
 * spans/pre, so no Shiki theme CSS needs to be embedded here.
 *
 * KaTeX math: we link the KaTeX stylesheet from jsDelivr (pinned version)
 * rather than inlining it, because the KaTeX CSS references woff2 fonts
 * via relative URLs — inlining the CSS without also bundling fonts as
 * base64 would leave math unstyled. The exported file needs internet to
 * render math; plain text/markdown still works offline.
 */

const KATEX_CDN_VERSION = "0.16.22";

const EXPORT_STYLES = `
:root {
  --color-bg: #ffffff;
  --color-bg-secondary: #f8f9fa;
  --color-bg-tertiary: #f0f1f3;
  --color-border: #e1e4e8;
  --color-text: #1f2328;
  --color-text-secondary: #656d76;
  --color-text-muted: #8b949e;
  --color-accent: #0969da;
  --color-accent-hover: #0550ae;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  --font-mono: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", Menlo, Consolas, monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --border-radius: 6px;
  --border-radius-sm: 4px;
}

html.dark {
  --color-bg: #0d1117;
  --color-bg-secondary: #161b22;
  --color-bg-tertiary: #1c2128;
  --color-border: #30363d;
  --color-text: #e6edf3;
  --color-text-secondary: #8b949e;
  --color-text-muted: #6e7681;
  --color-accent: #58a6ff;
  --color-accent-hover: #79c0ff;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.glyph-preview {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
  line-height: 1.6;
  font-size: 16px;
}

.glyph-preview h1,
.glyph-preview h2,
.glyph-preview h3,
.glyph-preview h4,
.glyph-preview h5,
.glyph-preview h6 {
  margin-top: var(--space-6);
  margin-bottom: var(--space-4);
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-text);
}
.glyph-preview h1 { font-size: 2em; padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); }
.glyph-preview h2 { font-size: 1.5em; padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); }
.glyph-preview h3 { font-size: 1.25em; }
.glyph-preview h4 { font-size: 1em; }
.glyph-preview h5 { font-size: 0.875em; }
.glyph-preview h6 { font-size: 0.85em; color: var(--color-text-secondary); }
.glyph-preview h1:first-child,
.glyph-preview h2:first-child,
.glyph-preview h3:first-child,
.glyph-preview h4:first-child,
.glyph-preview h5:first-child,
.glyph-preview h6:first-child { margin-top: 0; }

.glyph-preview p { margin: 0 0 var(--space-4); }

.glyph-preview a { color: var(--color-accent); text-decoration: none; }
.glyph-preview a:hover { color: var(--color-accent-hover); text-decoration: underline; }

.glyph-preview strong { font-weight: 600; }
.glyph-preview em { font-style: italic; }
.glyph-preview del { text-decoration: line-through; color: var(--color-text-muted); }

.glyph-preview blockquote {
  margin: 0 0 var(--space-4);
  padding: var(--space-2) var(--space-4);
  border-left: 4px solid var(--color-accent);
  background: var(--color-bg-secondary);
  border-radius: 0 var(--border-radius-sm) var(--border-radius-sm) 0;
  color: var(--color-text-secondary);
}
.glyph-preview blockquote p:last-child { margin-bottom: 0; }

.glyph-preview ul, .glyph-preview ol {
  margin: 0 0 var(--space-4);
  padding-left: var(--space-6);
}
.glyph-preview ul ul, .glyph-preview ul ol,
.glyph-preview ol ul, .glyph-preview ol ol { margin-bottom: 0; }
.glyph-preview li { margin-bottom: var(--space-1); }
.glyph-preview li > p { margin-bottom: var(--space-2); }

.glyph-preview ul.contains-task-list { list-style: none; padding-left: var(--space-4); }
.glyph-preview li.task-list-item { position: relative; padding-left: var(--space-2); }
.glyph-preview li.task-list-item input[type="checkbox"] {
  margin-right: var(--space-2);
  vertical-align: middle;
  accent-color: var(--color-accent);
}

.glyph-preview table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
}
.glyph-preview table th {
  font-weight: 600;
  background: var(--color-bg-tertiary);
}
.glyph-preview table th,
.glyph-preview table td {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  text-align: left;
}
.glyph-preview table tr:nth-child(even) { background: var(--color-bg-secondary); }

.glyph-preview code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  padding: 0.15em 0.4em;
  background: var(--color-bg-tertiary);
  border-radius: var(--border-radius-sm);
}
.glyph-preview pre {
  margin: 0 0 var(--space-4);
  padding: var(--space-4);
  background: var(--color-bg-secondary);
  border-radius: var(--border-radius);
  overflow-x: auto;
  border: 1px solid var(--color-border);
}
.glyph-preview pre code {
  padding: 0;
  background: none;
  border-radius: 0;
  font-size: 0.875em;
  line-height: 1.5;
}

.glyph-preview hr {
  height: 1px;
  margin: var(--space-6) 0;
  border: none;
  background: var(--color-border);
}

.glyph-preview img {
  max-width: 100%;
  height: auto;
  border-radius: var(--border-radius);
  display: block;
  margin: var(--space-4) 0;
}

.glyph-preview section.footnotes {
  margin-top: var(--space-8);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
  font-size: 0.875em;
  color: var(--color-text-secondary);
}
.glyph-preview section.footnotes ol { padding-left: var(--space-4); }
.glyph-preview section.footnotes li { margin-bottom: var(--space-2); }

.glyph-preview dt { font-weight: 600; margin-top: var(--space-3); }
.glyph-preview dd { margin-left: var(--space-4); margin-bottom: var(--space-2); }
`.trim();

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wraps sanitized inner HTML in a standalone HTML document.
 * The resulting string can be written directly to disk and opened in any browser.
 *
 * Pass `userThemeCss` to inline a user-supplied preview theme — rules there
 * typically target `.glyph-preview-root`, so the article element also
 * carries that class alongside the default `.glyph-preview` class.
 */
export function buildHtmlDocument(
  innerHtml: string,
  title: string,
  theme: "light" | "dark",
  userThemeCss: string | null = null,
): string {
  const htmlClass = theme === "dark" ? "dark" : "";
  const safeTitle = escapeHtml(title);
  const userThemeBlock = userThemeCss ? `<style id="glyph-user-theme">\n${userThemeCss}\n</style>\n` : "";
  return `<!DOCTYPE html>
<html lang="en"${htmlClass ? ` class="${htmlClass}"` : ""}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Glyph">
<title>${safeTitle}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${KATEX_CDN_VERSION}/dist/katex.min.css" crossorigin="anonymous">
<style>
${EXPORT_STYLES}
</style>
${userThemeBlock}</head>
<body>
<article class="glyph-preview glyph-preview-root">
${innerHtml}
</article>
</body>
</html>
`;
}
