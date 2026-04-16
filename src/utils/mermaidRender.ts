/**
 * Mermaid pre-rendering utilities for Glyph export/print flows.
 *
 * The live preview calls `mermaid.run()` in a useEffect to rewrite
 * `<pre class="mermaid">` nodes into SVG on-screen. For HTML export and
 * printing, diagrams must already be inline SVG *before* the markup
 * leaves the app, so the exported artifact is self-contained.
 *
 * - `prerenderMermaid(htmlString, idPrefix)` — HTML export path (string
 *   in, string out). Parses via DOMParser, renders off-DOM, returns
 *   `doc.body.innerHTML`.
 * - `prerenderMermaidFragment(fragment, idPrefix)` — print path, mutates
 *   a live DocumentFragment in place before it is appended to the DOM.
 *
 * Both use light theme + strict security (matches print force-light).
 * Mermaid is dynamic-imported so fenceless documents pay no cost. Per-
 * block errors use `console.warn` and leave the `<pre>` untouched — one
 * bad diagram never breaks a whole export. SVG injection via innerHTML
 * is intentional: mermaid.render returns trusted SVG and the textarea
 * entity-decode trick does not execute scripts.
 */

interface MermaidModule {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
}

const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
} as const;

async function loadMermaid(): Promise<MermaidModule> {
  const mod = await import("mermaid");
  const mermaid = mod.default as unknown as MermaidModule;
  mermaid.initialize({ ...MERMAID_CONFIG });
  return mermaid;
}

/**
 * Fence rule URL-encodes `data-source` (raw mermaid text contains `-->`
 * which DOMPurify strips from data-attrs). textContent is HTML-escaped
 * markdown-it output which decodes naturally via textarea round-trip.
 */
function decodeSource(raw: string, fromDataSource: boolean, doc: Document): string {
  if (fromDataSource) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  const ta = doc.createElement("textarea");
  ta.innerHTML = raw;
  return ta.value;
}

function makeId(idPrefix: string, index: number): string {
  return `glyph-${idPrefix}-${Date.now()}-${index}`;
}

/**
 * Render all `<pre class="mermaid">` blocks in an HTML string into inline
 * SVG wrappers, returning the transformed body HTML.
 */
export async function prerenderMermaid(
  htmlString: string,
  idPrefix: string,
): Promise<string> {
  const doc = new DOMParser().parseFromString(htmlString, "text/html");
  const blocks = doc.querySelectorAll("pre.mermaid");
  if (blocks.length === 0) return htmlString;

  const mermaid = await loadMermaid();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as HTMLElement;
    const fromDataSource = block.dataset.source !== undefined;
    const raw = block.dataset.source ?? block.textContent ?? "";
    const source = decodeSource(raw, fromDataSource, doc);
    const id = makeId(idPrefix, i);
    try {
      const { svg } = await mermaid.render(id, source);
      const wrapper = doc.createElement("div");
      wrapper.className = "mermaid-rendered";
      wrapper.innerHTML = svg;
      block.replaceWith(wrapper);
    } catch (err) {
      console.warn(`mermaid prerender failed for block ${i}:`, err);
      continue;
    }
  }

  return doc.body.innerHTML;
}

/**
 * Render all `<pre class="mermaid">` blocks inside a live DocumentFragment
 * into inline SVG wrappers, mutating the fragment in place.
 */
export async function prerenderMermaidFragment(
  fragment: DocumentFragment,
  idPrefix: string,
): Promise<void> {
  const blocks = fragment.querySelectorAll("pre.mermaid");
  if (blocks.length === 0) return;

  const mermaid = await loadMermaid();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as HTMLElement;
    const fromDataSource = block.dataset.source !== undefined;
    const raw = block.dataset.source ?? block.textContent ?? "";
    const source = decodeSource(raw, fromDataSource, document);
    const id = makeId(idPrefix, i);
    try {
      const { svg } = await mermaid.render(id, source);
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-rendered";
      wrapper.innerHTML = svg;
      block.replaceWith(wrapper);
    } catch (err) {
      console.warn(`mermaid prerender failed for block ${i}:`, err);
      continue;
    }
  }
}
