import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { beforeAll, describe, expect, it } from "vitest";

const cliBinUrl = new URL("../bin/aim.js", import.meta.url);
const cliRootUrl = new URL("../", import.meta.url);
const cliEntryUrl = new URL("../dist/index.mjs", import.meta.url);
const apiServerEntryUrl = new URL("../../api/dist/server.mjs", import.meta.url);
const serverStartSourceUrl = new URL(
  "../src/commands/server/start.ts",
  import.meta.url,
);

beforeAll(async () => {
  for (const entryUrl of [cliEntryUrl, apiServerEntryUrl]) {
    try {
      await access(entryUrl);
    } catch {
      throw new Error(
        "Expected CLI and API dist entries to exist before running CLI server tests. Run pnpm --filter ./modules/api run build:dist && pnpm --filter ./modules/cli run build:dist first.",
      );
    }
  }
});

const getFreePort = async () => {
  const server = createServer();

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("expected tcp server address");
  }

  const { port } = address;

  server.close();
  await once(server, "close");

  return port;
};

const waitForHealth = async (port: number) => {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);

      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`server did not become healthy: ${String(lastError)}`);
};

const rejectOnEarlyExit = async (
  child: ReturnType<typeof spawn>,
  stderr: Buffer[],
) => {
  const [code, signal] = (await once(child, "close")) as [
    number | null,
    NodeJS.Signals | null,
  ];

  throw new Error(
    `server command exited before becoming healthy: code=${String(code)} signal=${String(signal)} stderr=${Buffer.concat(stderr).toString("utf8")}`,
  );
};

const stopChild = async (child: ReturnType<typeof spawn>) => {
  child.kill("SIGTERM");

  const closed = await Promise.race([
    once(child, "close").then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 1_000)),
  ]);

  if (!closed) {
    child.kill("SIGKILL");
    await once(child, "close");
  }
};

describe("server cli command", () => {
  it("prints actionable optimizer setup guidance before rethrowing startup errors", async () => {
    const source = await readFile(serverStartSourceUrl, "utf8");

    expect(source).toContain("logToStderr(");
    expect(source).toContain("AIM server failed during optimizer setup");
    expect(source).toContain("Project configuration");
    expect(source).toContain("OpenCode base URL");
    expect(source).toContain("workspace/bootstrap");
    expect(source).toContain("repository initialization");
    expect(source).toContain("throw error;");
  });

  it("starts the API server on the requested port", async () => {
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      [cliBinUrl.pathname, "server", "start", "--port", String(port)],
      {
        cwd: cliRootUrl,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stderr: Buffer[] = [];
    let closed = false;

    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("close", () => {
      closed = true;
    });

    try {
      await expect(
        Promise.race([waitForHealth(port), rejectOnEarlyExit(child, stderr)]),
      ).resolves.toEqual({ status: "ok" });
    } finally {
      if (!closed) {
        await stopChild(child);
      }
    }
  }, 10_000);
});
