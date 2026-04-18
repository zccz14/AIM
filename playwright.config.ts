import { defineConfig, devices } from "@playwright/test";

const apiPort = 43100;
const webPort = 43173;
export default defineConfig({
  testDir: "./modules/web/test",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter ./modules/api exec tsx src/server.ts",
      port: apiPort,
      reuseExistingServer: false,
      env: {
        ...process.env,
        PORT: `${apiPort}`,
      },
    },
    {
      command: `pnpm --filter ./modules/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      port: webPort,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
    },
  ],
});
