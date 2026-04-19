import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const cliBinUrl = new URL("../bin/dev.js", import.meta.url);
const cliRootUrl = new URL("../", import.meta.url);
const cliIndexSourceUrl = new URL("../src/index.ts", import.meta.url);
const taskCommandHelperSourceUrl = new URL(
  "../src/lib/task-command.ts",
  import.meta.url,
);

type RecordedRequest = {
  method: string;
  path: string;
  pathname: string;
  searchParams: Record<string, string>;
  json: unknown;
};

const runningServers = new Set<ReturnType<typeof createServer>>();

const getImportSpecifiers = (source: string) =>
  [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
    ([, specifier]) => specifier,
  );

afterEach(async () => {
  await Promise.all(
    [...runningServers].map(async (server) => {
      runningServers.delete(server);
      server.close();
      await once(server, "close");
    }),
  );
});

beforeAll(async () => {
  const child = spawn("pnpm", ["run", "build"], {
    cwd: cliRootUrl,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));

  const [exitCode] = (await once(child, "close")) as [number | null];

  expect({
    exitCode,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  }).toMatchObject({ exitCode: 0 });
});

const startTaskServer = async () => {
  const requests: RecordedRequest[] = [];
  const task = {
    task_id: "task-1",
    task_spec: "write spec",
    session_id: "session-1",
    worktree_path: null,
    pull_request_url: "https://example.test/pr/2",
    dependencies: ["task-a", "task-b"],
    done: false,
    status: "created",
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
  };

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    await once(request, "end");

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = `${url.pathname}${url.search}`;
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const json = bodyText ? JSON.parse(bodyText) : null;

    requests.push({
      method: request.method ?? "GET",
      path,
      pathname: url.pathname,
      searchParams: Object.fromEntries(url.searchParams),
      json,
    });

    if (request.method === "POST" && path === "/api/tasks") {
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify(task));
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/tasks" &&
      url.searchParams.get("status") === "running" &&
      url.searchParams.get("done") === "false" &&
      url.searchParams.get("session_id") === "session-1"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ items: [task] }));
      return;
    }

    if (request.method === "GET" && path === "/api/tasks/task-1") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(task));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: "UNAVAILABLE", message: "not found" }));
  });

  runningServers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("expected tcp server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
  };
};

const runCli = async (args: string[]) => {
  const child = spawn(process.execPath, [cliBinUrl.pathname, ...args], {
    cwd: cliRootUrl,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));

  const [exitCode] = (await once(child, "close")) as [number | null];

  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
};

describe("task cli command baseline", () => {
  it("registers task create with the expected request mapping", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "create",
      "--base-url",
      `${server.baseUrl}/api`,
      "--task-spec",
      "write spec",
      "--dependency",
      "task-a",
      "--dependency",
      "task-b",
      "--pull-request-url",
      "https://example.test/pr/1",
      "--pull-request-url",
      "https://example.test/pr/2",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "POST",
      path: "/api/tasks",
      json: {
        task_spec: "write spec",
        dependencies: ["task-a", "task-b"],
        pull_request_url: "https://example.test/pr/2",
      },
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        task_id: "task-1",
        task_spec: "write spec",
      },
    });
  });

  it("registers task list with the expected query mapping", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
      "--status",
      "running",
      "--done",
      "false",
      "--session-id",
      "session-1",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "GET",
      pathname: "/api/tasks",
      searchParams: {
        status: "running",
        done: "false",
        session_id: "session-1",
      },
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            task_id: "task-1",
          },
        ],
      },
    });
  });

  it("registers task get and prints the success envelope", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "get",
      "--base-url",
      `${server.baseUrl}/api`,
      "--task-id",
      "task-1",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]?.path).toBe("/api/tasks/task-1");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        task_id: "task-1",
        task_spec: "write spec",
      },
    });
  });

  it("returns a JSON usage error before making a request", async () => {
    const server = await startTaskServer();

    const result = await runCli(["task", "create", "--task-spec", "write spec"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      '{"ok":false,"error":{"code":"CLI_USAGE_ERROR","message":"missing required flag: --base-url"}}\n',
    );
    expect(server.requests).toEqual([]);
  });

  it("returns a JSON usage error when task create is missing --task-spec", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "create",
      "--base-url",
      `${server.baseUrl}/api`,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      '{"ok":false,"error":{"code":"CLI_USAGE_ERROR","message":"missing required flag: --task-spec"}}\n',
    );
    expect(server.requests).toEqual([]);
  });

  it("returns a JSON usage error when task get is missing --task-id", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "get",
      "--base-url",
      `${server.baseUrl}/api`,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      '{"ok":false,"error":{"code":"CLI_USAGE_ERROR","message":"missing required flag: --task-id"}}\n',
    );
    expect(server.requests).toEqual([]);
  });

  it("returns a JSON invalid base url error before creating a client", async () => {
    const result = await runCli([
      "task",
      "list",
      "--base-url",
      "not-a-url",
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_INVALID_BASE_URL",
        message: "invalid --base-url value: not-a-url",
      },
    });
  });

  it("returns a JSON invalid flag error for unsupported filter values", async () => {
    const result = await runCli([
      "task",
      "list",
      "--base-url",
      "http://127.0.0.1:9999",
      "--done",
      "maybe",
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_INVALID_FLAG_VALUE",
        message: "invalid --done value: expected true or false",
      },
    });
  });

  it("returns a JSON invalid flag error for unsupported status values", async () => {
    const result = await runCli([
      "task",
      "list",
      "--base-url",
      "http://127.0.0.1:9999",
      "--status",
      "unknown",
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_INVALID_FLAG_VALUE",
        message: "invalid --status value: unknown",
      },
    });
  });

  it("keeps task CLI sources on the contract root boundary", async () => {
    const [indexSource, helperSource] = await Promise.all([
      readFile(cliIndexSourceUrl, "utf8"),
      readFile(taskCommandHelperSourceUrl, "utf8"),
    ]);
    const importSpecifiers = getImportSpecifiers(indexSource);

    expect(indexSource).toContain('"task:create"');
    expect(indexSource).toContain('"task:list"');
    expect(indexSource).toContain('"task:get"');
    expect(indexSource).not.toContain("contract/generated");
    expect(helperSource).toContain("@aim-ai/contract");
    expect(helperSource).not.toContain("contract/generated");
    expect(
      importSpecifiers.some((specifier) =>
        specifier.includes("contract/generated"),
      ),
    ).toBe(false);
  });
});
