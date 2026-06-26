// Hello Glyph — a reference plugin demonstrating every v2.1 contribution type.
//
// Install: copy this folder into <app-data>/Glyph/plugins/, then enable
// "Hello Glyph" in Settings > Plugins. The host loads this file over the
// glyph-plugin:// protocol, so multi-file plugins may use relative imports.

export function activate(ctx) {
  // 1. A fenced-block renderer. ```callout ... ``` becomes a styled box.
  ctx.markdown.registerRenderer("callout", (source) => {
    const safe = source
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<aside style="border-left:4px solid #0969da;padding:8px 12px;background:#f0f6ff;border-radius:4px;">${safe}</aside>`;
  });

  // 2. A command, surfaced in the palette (Cmd/Ctrl+Shift+P).
  ctx.commands.register("insertDate", "Insert today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    // Plugins don't yet have editor write access in v2.1, so this demo
    // copies the date to the clipboard instead.
    navigator.clipboard?.writeText(today);
  });

  // 3. A side panel. `mount` receives a container to populate; the returned
  // function (optional) runs on deactivate.
  ctx.ui.registerPanel({
    id: "info",
    title: "Hello Glyph",
    mount(container) {
      const p = document.createElement("p");
      p.textContent = "This panel is contributed by the Hello Glyph plugin.";
      container.appendChild(p);
      return () => container.replaceChildren();
    },
  });
}

export function deactivate() {
  // Host tears down registered contributions automatically; nothing to do.
}
