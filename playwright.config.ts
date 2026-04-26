import { execFileSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";

function resolveFreePort(portRange?: string) {
  const script = [
    'const { createServer } = require("node:net");',
    "void (async () => {",
    `const host = ${JSON.stringify(host)};`,
    "const portRange = process.env.AIM_PORT_RANGE?.trim();",
    "const canBindPort = async (port) => {",
    "  const server = createServer();",
    "  return await new Promise((resolve) => {",
    '    server.once("error", () => resolve(false));',
    "    server.listen(port, host, () => {",
    "      server.close(() => resolve(true));",
    "    });",
    "  });",
    "};",
    "const resolveRandomPort = async () => {",
    "  const server = createServer();",
    "  return await new Promise((resolve, reject) => {",
    '    server.once("error", reject);',
    "    server.listen(0, host, () => {",
    "      const address = server.address();",
    "      server.close((error) => {",
    "        if (error) { reject(error); return; }",
    '        if (typeof address === "string" || address === null) {',
    '          reject(new Error("Unable to resolve a local preview port."));',
    "          return;",
    "        }",
    "        resolve(address.port);",
    "      });",
    "    });",
    "  });",
    "};",
    "if (!portRange) { process.stdout.write(String(await resolveRandomPort())); process.exit(0); }",
    "const match = /^(\\d+)-(\\d+)$/.exec(portRange);",
    'if (!match) throw new Error("AIM_PORT_RANGE must use the format start-end.");',
    "const start = Number.parseInt(match[1], 10);",
    "const end = Number.parseInt(match[2], 10);",
    'if (start > end || start < 1 || end > 65_535) throw new Error("AIM_PORT_RANGE must contain valid TCP ports.");',
    "for (let port = start; port <= end; port += 1) {",
    "  if (await canBindPort(port)) { process.stdout.write(String(port)); process.exit(0); }",
    "}",
    'throw new Error("No free local preview port found in AIM_PORT_RANGE " + portRange + ".");',
    "})().catch((error) => { console.error(error); process.exit(1); });",
  ].join("\n");
  const output = execFileSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      AIM_PORT_RANGE: portRange ?? "",
    },
  });

  const port = Number.parseInt(output.trim(), 10);

  if (Number.isNaN(port)) {
    throw new Error("Unable to resolve a local preview port.");
  }

  return port;
}

function resolvePreviewPort() {
  const explicitPort = process.env.AIM_PORT?.trim();

  if (explicitPort) {
    const port = Number.parseInt(explicitPort, 10);

    if (`${port}` !== explicitPort || port < 1 || port > 65_535) {
      throw new Error("AIM_PORT must be a valid TCP port.");
    }

    return port;
  }

  const port = resolveFreePort(process.env.AIM_PORT_RANGE);
  process.env.AIM_PORT = `${port}`;

  return port;
}

const webPort = resolvePreviewPort();
const baseURL = `http://${host}:${webPort}`;

export default defineConfig({
  testDir: "./modules/web/test",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        baseURL,
      },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter ./modules/web exec vite --host ${host} --port ${webPort} --strictPort`,
      port: webPort,
      reuseExistingServer: false,
      env: {
        ...process.env,
        AIM_PORT: `${webPort}`,
        PORT: `${webPort}`,
      },
    },
  ],
});
