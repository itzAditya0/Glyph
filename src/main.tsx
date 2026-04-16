import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TabsProvider } from "./state/tabs";
import { DEFAULT_MARKDOWN } from "./defaultMarkdown";
import "./styles/main.css";
import "./styles/print.css";
import "katex/dist/katex.min.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TabsProvider initialContent={DEFAULT_MARKDOWN}>
      <App />
    </TabsProvider>
  </React.StrictMode>,
);
