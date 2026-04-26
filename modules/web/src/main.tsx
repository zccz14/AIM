import "./styles.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { ThemeProvider } from "./components/ui/theme-provider.js";
import { I18nProvider } from "./lib/i18n.js";
import { webQueryClient } from "./lib/query-client.js";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root container");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={webQueryClient}>
          <App />
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
