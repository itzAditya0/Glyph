# Contributing to Glyph

Thanks for taking a look. Issues and pull requests are welcome.

## Running locally

```bash
git clone https://github.com/itzAditya0/Glyph.git
cd Glyph
npm install

# Browser-only dev mode
npm run dev

# Native desktop dev mode
npm run tauri dev
```

You'll need Node.js v18+, Rust, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

## Building

```bash
npm run build        # Type-check and bundle the frontend
npm run tauri build  # Build the native release binary
```

## Reporting bugs

Open an [issue](https://github.com/itzAditya0/Glyph/issues/new/choose) using the bug report template. Include your OS, Glyph version, repro steps, and a screenshot or short recording where it helps.

## Pull requests

- Keep changes focused; one feature or fix per PR
- Make sure `npm run build` passes before submitting
- Match the existing code style — TypeScript is type-checked during `npm run build`
- Use the PR template to describe the change and how you tested it

## Feature ideas

Open a feature request issue before writing code for anything non-trivial, so we can agree on direction before you invest time.
