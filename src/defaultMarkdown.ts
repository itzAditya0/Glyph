/** Welcome document shown in the first untitled tab on fresh launches. */
export const DEFAULT_MARKDOWN = `# Welcome to Glyph

A lightweight Markdown editor that gets out of your way.

## Features

- **Live preview** as you type
- *Italic*, **bold**, and ~~strikethrough~~ support
- GFM tables, task lists, and footnotes

## Try it out

Here's a list of things to try:

- [ ] Type some markdown on the left
- [ ] Watch it render on the right
- [x] Enjoy the clean, distraction-free editing

## Code Blocks

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Glyph"))
\`\`\`

Inline code works too: \`const x = 42;\`

## Tables

| Feature       | Status |
|---------------|--------|
| Live Preview  | ✓      |
| WYSIWYG Mode  | ✓      |
| Dark Theme    | ✓      |
| Find & Replace| ✓      |
| Auto-save     | ✓      |

## Math

Inline: $E = mc^2$ and $\\alpha + \\beta = \\gamma$.

Block:

$$ \\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2} $$

## Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|yes| C[Do it]
    B -->|no| D[Stop]
\`\`\`

## Blockquote

> "Simplicity is the ultimate sophistication."
> — Leonardo da Vinci

---

This is a footnote reference[^1].

[^1]: And here is the footnote content.
`;
