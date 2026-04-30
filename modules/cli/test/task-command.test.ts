import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const cliBinUrl = new URL("../bin/aim.js", import.meta.url);
const cliRootUrl = new URL("../", import.meta.url);
const cliEntryUrl = new URL("../dist/index.mjs", import.meta.url);
const cliIndexSourceUrl = new URL("../src/index.ts", import.meta.url);
const taskCommandHelperSourceUrl = new URL(
  "../src/lib/task-command.ts",
  import.meta.url,
);
const mainProjectId = "00000000-0000-4000-8000-000000000001";
const defaultBudgetWarning = {
  status: "not_configured",
  token_warning_threshold: null,
  cost_warning_threshold: null,
  message: null,
};
const defaultTokenBudget = {
  limit: null,
  used: 0,
  remaining: null,
  exhausted: false,
};
const optimizerStatus = {
  project_id: mainProjectId,
  optimizer_enabled: true,
  runtime_active: true,
  blocker_summary:
    "Manager lane active; recent scan at 2026-04-29T10:15:30.000Z",
  current_baseline_commit_sha: "abc123",
  token_usage: {
    availability: "partial",
    budget_warning: defaultBudgetWarning,
    token_budget: { ...defaultTokenBudget, used: 105 },
    failed_root_session_count: 1,
    failure_summary: "Token usage unavailable for 1 of 2 root sessions.",
    root_session_count: 2,
    totals: {
      cache: { read: 30, write: 40 },
      cost: 1.25,
      input: 10,
      messages: 1,
      output: 20,
      reasoning: 5,
      total: 105,
    },
  },
  recent_events: [
    {
      lane_name: "manager",
      event: "failure",
      timestamp: "2026-04-29T10:16:30.000Z",
      summary: "Manager lane failed: git fetch failed",
    },
    {
      lane_name: "coordinator",
      event: "success",
      timestamp: "2026-04-29T10:15:30.000Z",
      summary: "Coordinator lane created 2 tasks",
    },
  ],
};
const optimizerStatusWithoutEvents = {
  project_id: mainProjectId,
  optimizer_enabled: false,
  runtime_active: false,
  blocker_summary: "Optimizer disabled for project",
  current_baseline_commit_sha: null,
  token_usage: {
    availability: "no_sessions",
    budget_warning: defaultBudgetWarning,
    token_budget: defaultTokenBudget,
    failed_root_session_count: 0,
    failure_summary: null,
    root_session_count: 0,
    totals: {
      cache: { read: 0, write: 0 },
      cost: 0,
      input: 0,
      messages: 0,
      output: 0,
      reasoning: 0,
      total: 0,
    },
  },
  recent_events: [],
};
const projectTokenUsageFailureMessage =
  "OpenCode messages unavailable for root-session-2; retry after the session is accessible.";
const projectTokenUsage = {
  project_id: mainProjectId,
  budget_warning: defaultBudgetWarning,
  token_budget: { ...defaultTokenBudget, used: 190 },
  totals: {
    input: 100,
    output: 50,
    reasoning: 25,
    cache: { read: 10, write: 5 },
    total: 190,
    cost: 3.75,
    messages: 4,
  },
  tasks: [
    {
      task_id: "task-1",
      title: "Write spec",
      session_id: "session-1",
      totals: {
        input: 80,
        output: 40,
        reasoning: 20,
        cache: { read: 8, write: 4 },
        total: 152,
        cost: 3,
        messages: 3,
      },
      failures: [],
    },
    {
      task_id: "task-2",
      title: "Handle partial usage",
      session_id: "session-2",
      totals: {
        input: 20,
        output: 10,
        reasoning: 5,
        cache: { read: 2, write: 1 },
        total: 38,
        cost: 0.75,
        messages: 1,
      },
      failures: [
        {
          code: "OPENCODE_MESSAGES_UNAVAILABLE",
          message: projectTokenUsageFailureMessage,
          root_session_id: "root-session-2",
          task_id: "task-2",
        },
      ],
    },
  ],
  sessions: [
    {
      root_session_id: "root-session-1",
      task_id: "task-1",
      title: "Write spec",
      totals: {
        input: 80,
        output: 40,
        reasoning: 20,
        cache: { read: 8, write: 4 },
        total: 152,
        cost: 3,
        messages: 3,
      },
      failure: null,
    },
    {
      root_session_id: "root-session-2",
      task_id: "task-2",
      title: "Handle partial usage",
      totals: {
        input: 20,
        output: 10,
        reasoning: 5,
        cache: { read: 2, write: 1 },
        total: 38,
        cost: 0.75,
        messages: 1,
      },
      failure: {
        code: "OPENCODE_MESSAGES_UNAVAILABLE",
        message: projectTokenUsageFailureMessage,
        root_session_id: "root-session-2",
        task_id: "task-2",
      },
    },
  ],
  failures: [
    {
      code: "OPENCODE_MESSAGES_UNAVAILABLE",
      message: projectTokenUsageFailureMessage,
      root_session_id: "root-session-2",
      task_id: "task-2",
    },
  ],
};
const emptyProjectTokenUsage = {
  project_id: "00000000-0000-4000-8000-000000000002",
  budget_warning: defaultBudgetWarning,
  token_budget: defaultTokenBudget,
  totals: {
    input: 0,
    output: 0,
    reasoning: 0,
    cache: { read: 0, write: 0 },
    total: 0,
    cost: 0,
    messages: 0,
  },
  tasks: [],
  sessions: [],
  failures: [],
};
const projects = [
  {
    id: mainProjectId,
    name: "Main project",
    git_origin_url: "https://github.com/example/main.git",
    global_provider_id: "anthropic",
    global_model_id: "claude-sonnet-4-5",
    optimizer_enabled: true,
    token_budget_limit: null,
    token_warning_threshold: null,
    cost_warning_threshold: null,
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Secondary project",
    git_origin_url: "https://github.com/example/secondary.git",
    global_provider_id: "ntnl-openai",
    global_model_id: "gpt-5.5",
    optimizer_enabled: false,
    token_budget_limit: null,
    token_warning_threshold: null,
    cost_warning_threshold: null,
    created_at: "2026-04-21T00:00:00.000Z",
    updated_at: "2026-04-21T00:00:00.000Z",
  },
];

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
  try {
    await access(cliEntryUrl);
  } catch {
    throw new Error(
      "Expected modules/cli/dist/index.mjs to exist before running CLI tests. Run pnpm --filter ./modules/cli run build:dist first.",
    );
  }
});

const startTaskServer = async (
  options: { projects?: typeof projects } = {},
) => {
  const requests: RecordedRequest[] = [];
  const task = {
    task_id: "task-1",
    title: "Write spec",
    task_spec: "write spec",
    project_id: mainProjectId,
    git_origin_url: "https://github.com/example/main.git",
    global_provider_id: "anthropic",
    global_model_id: "claude-sonnet-4-5",
    session_id: "session-1",
    worktree_path: null,
    pull_request_url: "https://example.test/pr/2",
    dependencies: ["task-a", "task-b"],
    result: "",
    source_metadata: {},
    source_baseline_freshness: {
      status: "unknown",
      source_commit: null,
      current_commit: null,
      summary:
        "Task source baseline metadata is missing latest_origin_main_commit",
    },
    done: false,
    status: "pending",
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
  };
  const taskPullRequestStatus = {
    category: "waiting_checks",
    summary: "Pull request checks are still running.",
    recovery_action: "Wait for checks to complete.",
    task_status: "pending",
    task_done: false,
    pull_request_url: "https://example.test/pr/2",
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

    if (request.method === "GET" && url.pathname === "/api/tasks") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          items:
            url.searchParams.get("status") === "pending" &&
            url.searchParams.get("done") === "false" &&
            url.searchParams.get("project_id") === mainProjectId &&
            url.searchParams.get("session_id") === "session-1"
              ? [task]
              : [],
        }),
      );
      return;
    }

    if (request.method === "GET" && path === "/api/projects") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ items: options.projects ?? projects }));
      return;
    }

    if (
      request.method === "PATCH" &&
      path === `/api/projects/${mainProjectId}`
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ...projects[0], ...json }));
      return;
    }

    if (
      request.method === "PATCH" &&
      path === "/api/projects/00000000-0000-4000-8000-000000000003"
    ) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          code: "PROJECT_NOT_FOUND",
          message: "missing project",
        }),
      );
      return;
    }

    if (request.method === "GET" && path === "/api/tasks/task-1") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(task));
      return;
    }

    if (
      request.method === "GET" &&
      path === "/api/tasks/task-1/pull_request_status"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(taskPullRequestStatus));
      return;
    }

    if (
      request.method === "GET" &&
      path === `/api/projects/${mainProjectId}/optimizer/status`
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(optimizerStatus));
      return;
    }

    if (
      request.method === "GET" &&
      path === `/api/projects/${mainProjectId}/token-usage`
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(projectTokenUsage));
      return;
    }

    if (
      request.method === "GET" &&
      path === "/api/projects/00000000-0000-4000-8000-000000000002/token-usage"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(emptyProjectTokenUsage));
      return;
    }

    if (
      request.method === "GET" &&
      path === "/api/projects/00000000-0000-4000-8000-000000000003/token-usage"
    ) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          code: "PROJECT_NOT_FOUND",
          message: "missing project",
        }),
      );
      return;
    }

    if (
      request.method === "GET" &&
      path ===
        "/api/projects/00000000-0000-4000-8000-000000000002/optimizer/status"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ...optimizerStatusWithoutEvents,
          project_id: "00000000-0000-4000-8000-000000000002",
        }),
      );
      return;
    }

    if (
      request.method === "GET" &&
      path ===
        "/api/projects/00000000-0000-4000-8000-000000000003/optimizer/status"
    ) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          code: "PROJECT_NOT_FOUND",
          message: "missing project",
        }),
      );
      return;
    }

    if (request.method === "GET" && path === "/api/tasks/missing") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ code: "TASK_NOT_FOUND", message: "missing task" }),
      );
      return;
    }

    if (request.method === "PATCH" && path === "/api/tasks/task-1") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ...task, ...json }));
      return;
    }

    if (request.method === "DELETE" && path === "/api/tasks/task-1") {
      response.writeHead(204);
      response.end();
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
      "--title",
      "Write spec",
      "--task-spec",
      "write spec",
      "--project-id",
      mainProjectId,
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
        title: "Write spec",
        task_spec: "write spec",
        project_id: mainProjectId,
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
      "pending",
      "--done",
      "false",
      "--project-id",
      mainProjectId,
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
        status: "pending",
        done: "false",
        project_id: mainProjectId,
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

  it("boots task list from the published bin and prints JSON only", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: { items: expect.any(Array) },
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

  it("registers task pr-status and prints follow-up status", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "pr-status",
      "--base-url",
      `${server.baseUrl}/api`,
      "--task-id",
      "task-1",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]?.path).toBe(
      "/api/tasks/task-1/pull_request_status",
    );
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        category: "waiting_checks",
        summary: "Pull request checks are still running.",
        recovery_action: "Wait for checks to complete.",
        task_status: "pending",
        task_done: false,
        pull_request_url: "https://example.test/pr/2",
      },
    });
  });

  it("registers project optimizer status and prints runtime details", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "optimizer",
      "status",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      mainProjectId,
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]?.path).toBe(
      `/api/projects/${mainProjectId}/optimizer/status`,
    );
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        project_id: mainProjectId,
        optimizer_enabled: true,
        runtime_status: "active",
        blocker_summary:
          "Manager lane active; recent scan at 2026-04-29T10:15:30.000Z",
        token_usage: {
          availability: "partial",
          failed_root_session_count: 1,
          failure_summary: "Token usage unavailable for 1 of 2 root sessions.",
          root_session_count: 2,
          totals: {
            cache: { read: 30, write: 40 },
            cost: 1.25,
            input: 10,
            messages: 1,
            output: 20,
            reasoning: 5,
            total: 105,
          },
        },
        lane_summaries: [
          {
            lane_name: "manager",
            status: "failure",
            summary: "Manager lane failed: git fetch failed",
          },
          {
            lane_name: "coordinator",
            status: "success",
            summary: "Coordinator lane created 2 tasks",
          },
          {
            lane_name: "developer",
            status: "unknown",
            summary: "No recent events",
          },
        ],
        recent_events: [
          {
            timestamp: "2026-04-29T10:16:30.000Z",
            level: "error",
            summary: "Manager lane failed: git fetch failed",
          },
          {
            timestamp: "2026-04-29T10:15:30.000Z",
            level: "info",
            summary: "Coordinator lane created 2 tasks",
          },
        ],
      },
    });
  });

  it("prints empty optimizer events when the API reports no events", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "optimizer",
      "status",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      "00000000-0000-4000-8000-000000000002",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        project_id: "00000000-0000-4000-8000-000000000002",
        optimizer_enabled: false,
        runtime_status: "inactive",
        blocker_summary: "Optimizer disabled for project",
        token_usage: {
          availability: "no_sessions",
          failed_root_session_count: 0,
          failure_summary: null,
          root_session_count: 0,
          totals: {
            cache: { read: 0, write: 0 },
            cost: 0,
            input: 0,
            messages: 0,
            output: 0,
            reasoning: 0,
            total: 0,
          },
        },
        recent_events: [],
      },
    });
  });

  it("updates project optimizer config to enabled and prints persisted project fields", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "optimizer",
      "update",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      mainProjectId,
      "--enable",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "PATCH",
      path: `/api/projects/${mainProjectId}`,
      json: { optimizer_enabled: true },
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        project_id: mainProjectId,
        name: "Main project",
        git_origin_url: "https://github.com/example/main.git",
        global_provider_id: "anthropic",
        global_model_id: "claude-sonnet-4-5",
        optimizer_enabled: true,
        update_type: "persisted_configuration",
      },
    });
  });

  it("updates project optimizer config to disabled", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "optimizer",
      "update",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      mainProjectId,
      "--disable",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "PATCH",
      path: `/api/projects/${mainProjectId}`,
      json: { optimizer_enabled: false },
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        project_id: mainProjectId,
        optimizer_enabled: false,
        update_type: "persisted_configuration",
      },
    });
  });

  it("rejects project optimizer update without an explicit enable or disable flag", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "optimizer",
      "update",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      mainProjectId,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_USAGE_ERROR",
        message: "project optimizer update requires --enable or --disable",
      },
    });
    expect(server.requests).toEqual([]);
  });

  it("rejects mutually exclusive project optimizer update flags before any HTTP request", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "optimizer",
      "update",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      mainProjectId,
      "--enable",
      "--disable",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_INVALID_FLAG_VALUE",
        message: "cannot combine --enable with --disable",
      },
    });
    expect(server.requests).toEqual([]);
  });

  it("preserves server project optimizer update errors on stderr", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "optimizer",
      "update",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      "00000000-0000-4000-8000-000000000003",
      "--enable",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "missing project" },
    });
  });

  it("registers project list and prints stable project discovery fields", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "GET",
      path: "/api/projects",
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        items: [
          {
            project_id: mainProjectId,
            name: "Main project",
            git_origin_url: "https://github.com/example/main.git",
            global_provider_id: "anthropic",
            global_model_id: "claude-sonnet-4-5",
            optimizer_enabled: true,
          },
          {
            project_id: "00000000-0000-4000-8000-000000000002",
            name: "Secondary project",
            git_origin_url: "https://github.com/example/secondary.git",
            global_provider_id: "ntnl-openai",
            global_model_id: "gpt-5.5",
            optimizer_enabled: false,
          },
        ],
      },
    });
  });

  it("prints an empty project list when no projects exist", async () => {
    const server = await startTaskServer({ projects: [] });

    const result = await runCli([
      "project",
      "list",
      "--base-url",
      `${server.baseUrl}/api`,
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "GET",
      path: "/api/projects",
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: { items: [] },
    });
  });

  it("registers project token-usage and prints totals with task and session attribution", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "token-usage",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      mainProjectId,
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "GET",
      path: `/api/projects/${mainProjectId}/token-usage`,
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        project_id: mainProjectId,
        availability: "partial",
        totals: projectTokenUsage.totals,
        task_totals: [
          {
            task_id: "task-1",
            title: "Write spec",
            session_id: "session-1",
            totals: projectTokenUsage.tasks[0]?.totals,
            failure_count: 0,
          },
          {
            task_id: "task-2",
            title: "Handle partial usage",
            session_id: "session-2",
            totals: projectTokenUsage.tasks[1]?.totals,
            failure_count: 1,
          },
        ],
        sessions: [
          {
            root_session_id: "root-session-1",
            task_id: "task-1",
            title: "Write spec",
            totals: projectTokenUsage.sessions[0]?.totals,
            failure: null,
          },
          {
            root_session_id: "root-session-2",
            task_id: "task-2",
            title: "Handle partial usage",
            totals: projectTokenUsage.sessions[1]?.totals,
            failure: {
              code: "OPENCODE_MESSAGES_UNAVAILABLE",
              message: projectTokenUsageFailureMessage,
              root_session_id: "root-session-2",
              task_id: "task-2",
            },
          },
        ],
        failures: [
          {
            code: "OPENCODE_MESSAGES_UNAVAILABLE",
            message: projectTokenUsageFailureMessage,
            root_session_id: "root-session-2",
            task_id: "task-2",
          },
        ],
      },
    });
  });

  it("prints no_usage for an empty project token usage response", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "token-usage",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      "00000000-0000-4000-8000-000000000002",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "GET",
      path: "/api/projects/00000000-0000-4000-8000-000000000002/token-usage",
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        project_id: "00000000-0000-4000-8000-000000000002",
        availability: "no_usage",
        totals: emptyProjectTokenUsage.totals,
        task_totals: [],
        sessions: [],
        failures: [],
      },
    });
  });

  it("does not print prompt text, API tokens, or provider secrets from usage failures", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "token-usage",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      mainProjectId,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("prompt text");
    expect(result.stdout).not.toContain("sk-ant-secret");
    expect(result.stdout).not.toContain("api_token");
    expect(result.stdout).not.toContain("provider_secret");
  });

  it("preserves server project token-usage errors on stderr", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "token-usage",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      "00000000-0000-4000-8000-000000000003",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "missing project" },
    });
  });

  it("preserves server project optimizer errors on stderr", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "project",
      "optimizer",
      "status",
      "--base-url",
      `${server.baseUrl}/api`,
      "--project-id",
      "00000000-0000-4000-8000-000000000003",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "missing project" },
    });
  });

  it("maps task update flags to the expected patch request", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "update",
      "--base-url",
      `${server.baseUrl}/api`,
      "--task-id",
      "task-1",
      "--task-spec",
      "rewrite spec",
      "--clear-session-id",
      "--clear-worktree-path",
      "--clear-pull-request-url",
      "--clear-dependencies",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "PATCH",
      path: "/api/tasks/task-1",
      json: {
        task_spec: "rewrite spec",
        session_id: null,
        worktree_path: null,
        pull_request_url: null,
        dependencies: [],
      },
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        task_id: "task-1",
        task_spec: "rewrite spec",
        status: "pending",
        session_id: null,
        worktree_path: null,
        pull_request_url: null,
        dependencies: [],
      },
    });
  });

  it("returns a JSON usage error when task update has no patch flags", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "update",
      "--base-url",
      `${server.baseUrl}/api`,
      "--task-id",
      "task-1",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      '{"ok":false,"error":{"code":"CLI_USAGE_ERROR","message":"task update requires at least one patch flag"}}\n',
    );
    expect(server.requests).toEqual([]);
  });

  it("rejects conflicting update flags before any HTTP request", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "update",
      "--base-url",
      `${server.baseUrl}/api`,
      "--task-id",
      "task-1",
      "--session-id",
      "session-1",
      "--clear-session-id",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_INVALID_FLAG_VALUE",
        message: "cannot combine --session-id with --clear-session-id",
      },
    });
    expect(server.requests).toEqual([]);
  });

  it("preserves server task errors on stderr", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "get",
      "--base-url",
      `${server.baseUrl}/api`,
      "--task-id",
      "missing",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: { code: "TASK_NOT_FOUND", message: "missing task" },
    });
  });

  it("falls back to UNAVAILABLE when the server cannot be reached", async () => {
    const result = await runCli([
      "task",
      "list",
      "--base-url",
      "http://127.0.0.1:1",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: "unexpected error" },
    });
  });

  it("prints the delete success envelope without inventing extra fields", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "delete",
      "--base-url",
      `${server.baseUrl}/api`,
      "--task-id",
      "task-1",
    ]);

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests[0]).toMatchObject({
      method: "DELETE",
      path: "/api/tasks/task-1",
      json: null,
    });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: { deleted: true, task_id: "task-1" },
    });
  });

  it("returns a JSON usage error before making a request", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "create",
      "--task-spec",
      "write spec",
    ]);

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
      "--title",
      "Write spec",
      "--project-id",
      mainProjectId,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      '{"ok":false,"error":{"code":"CLI_USAGE_ERROR","message":"missing required flag: --task-spec"}}\n',
    );
    expect(server.requests).toEqual([]);
  });

  it("returns a JSON usage error when task create is missing --project-id", async () => {
    const server = await startTaskServer();

    const result = await runCli([
      "task",
      "create",
      "--base-url",
      `${server.baseUrl}/api`,
      "--title",
      "Write spec",
      "--task-spec",
      "write spec",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      '{"ok":false,"error":{"code":"CLI_USAGE_ERROR","message":"missing required flag: --project-id"}}\n',
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
    const result = await runCli(["task", "list", "--base-url", "not-a-url"]);

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
    expect(indexSource).toContain('"task:update"');
    expect(indexSource).toContain('"task:delete"');
    expect(indexSource).toContain('"task:pr-status"');
    expect(indexSource).toContain('"project:optimizer:status"');
    expect(indexSource).toContain('"project:optimizer:update"');
    expect(indexSource).not.toContain("manager-report");
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
