import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const contractSourcePath = fileURLToPath(
  new URL("../contract/src/index.ts", import.meta.url),
);

export default defineConfig(() => {
  const apiProxyTarget = process.env.VITE_API_PROXY_TARGET;
  const base = process.env.VITE_BASE_PATH ?? "/";

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@aim-ai/contract": contractSourcePath,
      },
    },
    server: apiProxyTarget
      ? {
          proxy: {
            "/api": {
              target: apiProxyTarget,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ""),
            },
          },
        }
      : undefined,
  };
});
