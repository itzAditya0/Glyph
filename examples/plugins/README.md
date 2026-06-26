# Glyph plugins

Glyph plugins are folders dropped into the app's plugin directory:

- **macOS:** `~/Library/Application Support/Glyph/plugins/`
- **Linux:** `~/.local/share/Glyph/plugins/`
- **Windows:** `%APPDATA%\Glyph\plugins\`

Each plugin folder has a `manifest.json` and a JavaScript entry file. After
adding a plugin, restart Glyph and enable it under **Settings → Plugins**.

## Manifest

```jsonc
{
  "id": "com.example.my-plugin",   // reverse-DNS, unique
  "name": "My Plugin",
  "version": "1.0.0",
  "glyphApi": "1.0",               // host rejects a higher major than it supports
  "entry": "index.js",             // entry, relative to the folder
  "declaredCapabilities": [],      // informational only
  "contributes": {
    "markdownRenderers": ["mylang"],
    "commands": [{ "id": "doThing", "title": "Do the thing" }],
    "panels": [{ "id": "side", "location": "right", "title": "My Panel" }]
  }
}
```

## Entry

The entry exports `activate(ctx)` and optionally `deactivate()`:

```js
export function activate(ctx) {
  ctx.markdown.registerRenderer("mylang", (source) => `<pre>${source}</pre>`);
  ctx.commands.register("doThing", "Do the thing", () => { /* ... */ });
  ctx.ui.registerPanel({ id: "side", title: "My Panel", mount: (el) => { /* ... */ } });
}
```

Entries load over the `glyph-plugin://<id>/<path>` protocol, so multi-file
plugins can use relative `import` statements.

### Trust model

If a plugin is installed and enabled, it is trusted — it runs with the same
access the app's webview has. Disabling a plugin in Settings is the trust
control. `declaredCapabilities` is shown for information only and is not
enforced. Only enable plugins you trust.

See [`hello-glyph/`](hello-glyph/) for a working example of all three
contribution types.
