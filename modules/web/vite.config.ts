import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const apiProxyTarget = process.env.VITE_API_PROXY_TARGET;
  const base = process.env.VITE_BASE_PATH ?? "/";

  return {
    base,
    plugins: [react(), tailwindcss()],
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
