# Glyph

A lightweight, fast Markdown editor built with [Tauri v2](https://v2.tauri.app), React, and CodeMirror 6. Native desktop app with a ~8MB binary.

![Glyph Editor](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Split-pane editing** — Write markdown on the left, see the rendered preview on the right
- **WYSIWYG inline mode** — Typora-style editing where markdown syntax is visually rendered in-place with cursor-reveal
- **Syntax highlighting** — Powered by Shiki with support for 9+ languages
- **LaTeX math** — Inline `$…$` and block `$$…$$` rendered via KaTeX
- **Light & dark themes** — System-aware with manual toggle (system / light / dark)
- **GFM support** — Tables, task lists, footnotes, strikethrough
- **Keyboard shortcuts** — `Cmd+B` bold, `Cmd+I` italic, `Cmd+K` link, `Cmd+S` save, `Cmd+O` open
- **File associations** — Double-click `.md` files to open in Glyph
- **Drag & drop** — Drop markdown files onto the editor to open them
- **Unsaved changes protection** — Confirm dialog before closing with unsaved work

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Backend  | Tauri v2 (Rust)                     |
| Frontend | React 19 + Vite 7                   |
| Editor   | CodeMirror 6                        |
| Markdown | markdown-it + Shiki                 |
| Styling  | Vanilla CSS with CSS Modules        |

## Recommended IDE Setup

- [Zed](https://zed.dev/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Development

```bash
# Install dependencies
npm install

# Run in development mode (browser only)
npm run dev

# Run as native desktop app
npm run tauri dev
```

### Build

```bash
# Build the native app
npm run tauri build
```

The built app will be in `src-tauri/target/release/bundle/`.

## Project Structure

```
src/
  components/     # React components (Editor, Preview, Toolbar, StatusBar)
  extensions/     # CodeMirror extensions (WYSIWYG inline rendering)
  hooks/          # React hooks (useFile, useMarkdown, useTheme)
  styles/         # Global CSS and design tokens
src-tauri/
  src/            # Rust backend (file I/O commands)
```

## License

MIT
