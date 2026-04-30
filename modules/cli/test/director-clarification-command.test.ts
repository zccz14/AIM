import { spawn } from "node:child_process";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { createServer } from "node:http";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const cliBinUrl = new URL("../bin/aim.js", import.meta.url);
const cliRootUrl = new URL("../", import.meta.url);
const cliEntryUrl = new URL("../dist/index.mjs", import.meta.url);
const projectId = "00000000-0000-4000-8000-000000000001";

type RecordedRequest = {
  method: string;
  path: string;
  json: unknown;
};

const runningServers = new Set<ReturnType<typeof createServer>>();

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
  try {
    await access(cliEntryUrl);
  } catch {
    throw new Error(
      "Expected modules/cli/dist/index.mjs to exist before running CLI tests. Run pnpm --filter ./modules/cli run build:dist first.",
    );
  }
});

const startDirectorClarificationServer = async () => {
  const requests: RecordedRequest[] = [];
  const clarification = {
    id: "clarification-1",
    project_id: projectId,
    dimension_id: null,
    kind: "clarification",
    message: "Should this be split into separate tasks?",
    status: "open",
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
      json,
    });

    if (
      request.method === "GET" &&
      path === `/api/projects/${projectId}/director/clarifications`
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ items: [clarification] }));
      return;
    }

    if (
      request.method === "POST" &&
      path === `/api/projects/${projectId}/director/clarifications`
    ) {
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ ...clarification, ...json }));
      return;
    }

    if (
      request.method === "PATCH" &&
      path ===
        `/api/projects/${projectId}/director/clarifications/${clarification.id}`
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ...clarification, ...json }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        code: "DIRECTOR_CLARIFICATION_NOT_FOUND",
        message: "missing clarification",
      }),
    );
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

describe("director clarification cli commands", () => {
  it("lists readable Director clarification summaries for a project", async () => {
    const server = await startDirectorClarificationServer();

    const result = await runCli([
      "director",
      "clarifications",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      projectId,
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "GET",
      path: `/api/projects/${projectId}/director/clarifications`,
      json: null,
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        items: [
          {
            id: "clarification-1",
            kind: "clarification",
            status: "open",
            prompt: "Should this be split into separate tasks?",
            created_at: "2026-04-20T00:00:00.000Z",
          },
        ],
      },
    });
  });

  it("creates a Director adjustment request with prompt, context, and dimension id", async () => {
    const server = await startDirectorClarificationServer();

    const result = await runCli([
      "director:clarifications:create",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      projectId,
      "--dimension-id",
      "dimension-1",
      "--kind",
      "adjustment",
      "--prompt",
      "Adjust this success criterion.",
      "--context",
      "Reviewer noted the criterion is too broad.",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "POST",
      path: `/api/projects/${projectId}/director/clarifications`,
      json: {
        project_id: projectId,
        dimension_id: "dimension-1",
        kind: "adjustment",
        message:
          "Adjust this success criterion.\n\nContext:\nReviewer noted the criterion is too broad.",
      },
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        id: "clarification-1",
        kind: "adjustment",
        message:
          "Adjust this success criterion.\n\nContext:\nReviewer noted the criterion is too broad.",
      },
    });
  });

  it("updates a Director clarification status and prints the returned record", async () => {
    const server = await startDirectorClarificationServer();

    const result = await runCli([
      "director",
      "clarifications",
      "status",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      projectId,
      "--clarification-id",
      "clarification-1",
      "--status",
      "addressed",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "PATCH",
      path: `/api/projects/${projectId}/director/clarifications/clarification-1`,
      json: { status: "addressed" },
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        id: "clarification-1",
        project_id: projectId,
        dimension_id: null,
        kind: "clarification",
        message: "Should this be split into separate tasks?",
        status: "addressed",
        created_at: "2026-04-20T00:00:00.000Z",
        updated_at: "2026-04-20T00:00:00.000Z",
      },
    });
  });

  it("preserves Director clarification API errors on stderr", async () => {
    const server = await startDirectorClarificationServer();

    const result = await runCli([
      "director",
      "clarifications",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      "missing",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "DIRECTOR_CLARIFICATION_NOT_FOUND",
        message: "missing clarification",
      },
    });
  });

  it("preserves Director clarification status API errors on stderr", async () => {
    const server = await startDirectorClarificationServer();

    const result = await runCli([
      "director:clarifications:status",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      "missing",
      "--clarification-id",
      "clarification-1",
      "--status",
      "dismissed",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "DIRECTOR_CLARIFICATION_NOT_FOUND",
        message: "missing clarification",
      },
    });
  });

  it("rejects unsupported Director clarification kinds before any request", async () => {
    const server = await startDirectorClarificationServer();

    const result = await runCli([
      "director",
      "clarifications",
      "create",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      projectId,
      "--kind",
      "question",
      "--prompt",
      "What should change?",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_INVALID_FLAG_VALUE",
        message: "invalid --kind value: question",
      },
    });
    expect(server.requests).toEqual([]);
  });

  it("rejects unsupported Director clarification statuses before any request", async () => {
    const server = await startDirectorClarificationServer();

    const result = await runCli([
      "director",
      "clarifications",
      "status",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      projectId,
      "--clarification-id",
      "clarification-1",
      "--status",
      "closed",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_INVALID_FLAG_VALUE",
        message: "invalid --status value: closed",
      },
    });
    expect(server.requests).toEqual([]);
  });
});
