import { createServer } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

const originalApiPort = process.env.API_PORT;
const originalWebPort = process.env.WEB_PORT;
const originalAimPort = process.env.AIM_PORT;
const originalAimPortRange = process.env.AIM_PORT_RANGE;

type PlaywrightConfig = {
  use?: {
    baseURL?: string;
  };
  webServer?: Array<{
    command?: string;
    port?: number;
    env?: Record<string, string | undefined>;
  }>;
};

async function loadPlaywrightConfig() {
  vi.resetModules();

  const configModule = (await import("../../playwright.config")) as {
    default: PlaywrightConfig;
  };

  return configModule.default;
}

async function getFreePort() {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  if (typeof address === "string" || address === null) {
    throw new Error("expected TCP address for test port");
  }

  return address.port;
}

afterEach(() => {
  if (originalApiPort === undefined) {
    delete process.env.API_PORT;
  } else {
    process.env.API_PORT = originalApiPort;
  }

  if (originalWebPort === undefined) {
    delete process.env.WEB_PORT;
  } else {
    process.env.WEB_PORT = originalWebPort;
  }

  if (originalAimPort === undefined) {
    delete process.env.AIM_PORT;
  } else {
    process.env.AIM_PORT = originalAimPort;
  }

  if (originalAimPortRange === undefined) {
    delete process.env.AIM_PORT_RANGE;
  } else {
    process.env.AIM_PORT_RANGE = originalAimPortRange;
  }

  vi.resetModules();
});

describe("Playwright port configuration", () => {
  it("uses AIM_PORT as the single Playwright preview port", async () => {
    delete process.env.API_PORT;
    delete process.env.WEB_PORT;
    process.env.AIM_PORT = "45273";
    delete process.env.AIM_PORT_RANGE;

    const config = await loadPlaywrightConfig();
    const [webServer] = config.webServer ?? [];

    expect(config.webServer).toHaveLength(1);
    expect(config.use?.baseURL).toBe("http://127.0.0.1:45273");
    expect(webServer?.port).toBe(45273);
    expect(webServer?.command).toContain("--port 45273");
    expect(webServer?.env?.PORT).toBe("45273");
    expect(webServer?.env?.AIM_PORT).toBe("45273");
    expect(webServer?.env?.VITE_API_PROXY_TARGET).toBeUndefined();
  });

  it("ignores legacy API_PORT and WEB_PORT in favor of AIM_PORT", async () => {
    process.env.API_PORT = "43100";
    process.env.WEB_PORT = "43173";
    process.env.AIM_PORT = "45274";
    delete process.env.AIM_PORT_RANGE;

    const config = await loadPlaywrightConfig();
    const [webServer] = config.webServer ?? [];

    expect(config.use?.baseURL).toBe("http://127.0.0.1:45274");
    expect(webServer?.port).toBe(45274);
    expect(webServer?.command).toContain("--port 45274");
  });

  it("uses AIM_PORT_RANGE when AIM_PORT is not set", async () => {
    const port = await getFreePort();
    delete process.env.API_PORT;
    delete process.env.WEB_PORT;
    delete process.env.AIM_PORT;
    process.env.AIM_PORT_RANGE = `${port}-${port}`;

    const config = await loadPlaywrightConfig();
    const [webServer] = config.webServer ?? [];

    expect(config.webServer).toHaveLength(1);
    expect(config.use?.baseURL).toBe(`http://127.0.0.1:${port}`);
    expect(webServer?.port).toBe(port);
    expect(webServer?.command).toContain(`--port ${port}`);
  });

  it("uses one random free port when no local preview port env is set", async () => {
    delete process.env.API_PORT;
    delete process.env.WEB_PORT;
    delete process.env.AIM_PORT;
    delete process.env.AIM_PORT_RANGE;

    const config = await loadPlaywrightConfig();
    const [webServer] = config.webServer ?? [];
    const port = webServer?.port;

    expect(config.webServer).toHaveLength(1);
    expect(typeof port).toBe("number");
    expect(port).toBeGreaterThan(0);
    expect(config.use?.baseURL).toBe(`http://127.0.0.1:${port}`);
    expect(webServer?.command).toContain(`--port ${port}`);
  });
});
