import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { webQueryClient } from "./lib/query-client.js";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root container");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={webQueryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
