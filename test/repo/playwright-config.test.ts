import { afterEach, describe, expect, it, vi } from "vitest";

const originalApiPort = process.env.API_PORT;
const originalWebPort = process.env.WEB_PORT;

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

  vi.resetModules();
});

describe("Playwright port configuration", () => {
  it("uses the existing default API and web ports when no env override is set", async () => {
    delete process.env.API_PORT;
    delete process.env.WEB_PORT;

    const config = await loadPlaywrightConfig();
    const [apiServer, webServer] = config.webServer ?? [];

    expect(config.use?.baseURL).toBe("http://127.0.0.1:43173");
    expect(apiServer?.port).toBe(43100);
    expect(apiServer?.env?.PORT).toBe("43100");
    expect(webServer?.port).toBe(43173);
    expect(webServer?.command).toContain("--port 43173");
    expect(webServer?.env?.VITE_API_PROXY_TARGET).toBe(
      "http://127.0.0.1:43100",
    );
  });

  it("uses API_PORT and WEB_PORT consistently across Playwright servers and URLs", async () => {
    process.env.API_PORT = "45210";
    process.env.WEB_PORT = "45273";

    const config = await loadPlaywrightConfig();
    const [apiServer, webServer] = config.webServer ?? [];

    expect(config.use?.baseURL).toBe("http://127.0.0.1:45273");
    expect(apiServer?.port).toBe(45210);
    expect(apiServer?.env?.PORT).toBe("45210");
    expect(webServer?.port).toBe(45273);
    expect(webServer?.command).toContain("--port 45273");
    expect(webServer?.env?.VITE_API_PROXY_TARGET).toBe(
      "http://127.0.0.1:45210",
    );
  });
});
