/**
 * Plugin panel dock (right side).
 *
 * v2.1. Renders every panel an enabled plugin registered through
 * `ctx.ui.registerPanel`. Each panel gets a container element; the plugin's
 * `mount(container)` populates it with DOM and may return a cleanup function
 * run when the panel unmounts. Hidden entirely when no panels are registered.
 */

import { useEffect, useRef, useState } from "react";
import { getPanels, onPluginRegistryChange, type PluginPanel } from "../state/plugins";
import styles from "./PluginPanels.module.css";

export default function PluginPanels() {
  const [panels, setPanels] = useState<PluginPanel[]>(() => getPanels());

  useEffect(() => onPluginRegistryChange(() => setPanels(getPanels())), []);

  if (panels.length === 0) return null;

  return (
    <div className={styles.dock} aria-label="Plugin panels">
      {panels.map((panel) => (
        <PanelHost key={panel.id} panel={panel} />
      ))}
    </div>
  );
}

function PanelHost({ panel }: { panel: PluginPanel }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.replaceChildren();
    let cleanup: void | (() => void);
    try {
      cleanup = panel.mount(el);
    } catch (err) {
      console.error(`[glyph plugins] panel "${panel.id}" mount threw:`, err);
    }
    return () => {
      try {
        if (typeof cleanup === "function") cleanup();
      } catch (err) {
        console.error(`[glyph plugins] panel "${panel.id}" cleanup threw:`, err);
      }
      el.replaceChildren();
    };
  }, [panel]);

  return (
    <section className={styles.panel}>
      <header className={styles.panelHeader}>{panel.title}</header>
      <div ref={containerRef} className={styles.panelBody} />
    </section>
  );
}
