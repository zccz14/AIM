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
  pathname: string;
  searchParams: Record<string, string>;
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

const dimension = {
  id: "dimension-1",
  project_id: projectId,
  name: "Handoff Signal",
  goal: "Expose manager handoff status through stable read APIs.",
  evaluation_method: "Review current baseline evaluation history.",
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-04-20T00:00:00.000Z",
};

const evaluation = {
  id: "evaluation-1",
  dimension_id: dimension.id,
  project_id: projectId,
  commit_sha: "abc1234",
  evaluator_model: "anthropic/claude-sonnet-4-5",
  score: 81,
  evaluation: "Manager handoff signal is directly inspectable.",
  created_at: "2026-04-21T00:00:00.000Z",
};

const startDimensionServer = async ({
  dimensions = [dimension],
  evaluations = [evaluation],
  failDimensions = false,
  failEvaluations = false,
} = {}) => {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    request.resume();
    await once(request, "end");

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = `${url.pathname}${url.search}`;

    requests.push({
      method: request.method ?? "GET",
      path,
      pathname: url.pathname,
      searchParams: Object.fromEntries(url.searchParams),
    });

    if (request.method === "GET" && url.pathname === "/api/dimensions") {
      if (failDimensions) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            code: "DIMENSION_VALIDATION_ERROR",
            message: "project_id query parameter is required",
          }),
        );
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ items: dimensions }));
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/dimensions/dimension-1/evaluations"
    ) {
      if (failEvaluations) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            code: "DIMENSION_NOT_FOUND",
            message: "Dimension dimension-1 was not found",
          }),
        );
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ items: evaluations }));
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

describe("dimension cli commands", () => {
  it("prints project dimension summaries with latest evaluation metadata", async () => {
    const server = await startDimensionServer();

    const result = await runCli([
      "dimension",
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
    expect(
      server.requests.map(({ method, pathname, searchParams }) => ({
        method,
        pathname,
        searchParams,
      })),
    ).toEqual([
      {
        method: "GET",
        pathname: "/api/dimensions",
        searchParams: { project_id: projectId },
      },
      {
        method: "GET",
        pathname: "/api/dimensions/dimension-1/evaluations",
        searchParams: {},
      },
    ]);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        items: [
          {
            id: "dimension-1",
            name: "Handoff Signal",
            goal: "Expose manager handoff status through stable read APIs.",
            latest_score: 81,
            latest_commit: "abc1234",
            latest_created_at: "2026-04-21T00:00:00.000Z",
          },
        ],
      },
    });
  });

  it("prints an empty project dimension list without evaluation requests", async () => {
    const server = await startDimensionServer({ dimensions: [] });

    const result = await runCli([
      "dimension",
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
    expect(server.requests).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: { items: [] },
    });
  });

  it("preserves dimension API errors on stderr", async () => {
    const server = await startDimensionServer({ failDimensions: true });

    const result = await runCli([
      "dimension",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      projectId,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "DIMENSION_VALIDATION_ERROR",
        message: "project_id query parameter is required",
      },
    });
  });

  it("prints dimension evaluation history summaries", async () => {
    const server = await startDimensionServer();

    const result = await runCli([
      "dimension",
      "evaluations",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
      "--dimension-id",
      dimension.id,
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "GET",
      pathname: "/api/dimensions/dimension-1/evaluations",
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        items: [
          {
            commit: "abc1234",
            score: 81,
            summary: "Manager handoff signal is directly inspectable.",
          },
        ],
      },
    });
  });

  it("prints an empty dimension evaluation list", async () => {
    const server = await startDimensionServer({ evaluations: [] });

    const result = await runCli([
      "dimension",
      "evaluations",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
      "--dimension-id",
      dimension.id,
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: { items: [] },
    });
  });

  it("preserves dimension evaluation API errors on stderr", async () => {
    const server = await startDimensionServer({ failEvaluations: true });

    const result = await runCli([
      "dimension",
      "evaluations",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
      "--dimension-id",
      dimension.id,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "DIMENSION_NOT_FOUND",
        message: "Dimension dimension-1 was not found",
      },
    });
  });
});
