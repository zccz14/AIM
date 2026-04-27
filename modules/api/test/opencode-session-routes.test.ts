import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-opencode-session-routes",
);
const opencodeSessionsPath = "/opencode/sessions";
const opencodeSessionPath = (sessionId: string) =>
  `/opencode/sessions/${sessionId}`;
const opencodeSessionResolvePath = (sessionId: string) =>
  `/opencode/sessions/${sessionId}/resolve`;
const opencodeSessionRejectPath = (sessionId: string) =>
  `/opencode/sessions/${sessionId}/reject`;
const tasksPath = "/tasks";
const taskByIdPath = (taskId: string) => `/tasks/${taskId}`;

const mainProjectId = "00000000-0000-4000-8000-000000000001";
const ghMergedPullRequestOutput = JSON.stringify({
  mergedAt: "2026-04-26T10:00:00Z",
  state: "MERGED",
});

const createSupportedOpenCodeModelsAdapter = () => ({
  listSupportedModels: vi.fn().mockResolvedValue({
    items: [
      {
        model_id: "claude-sonnet-4-5",
        model_name: "Claude Sonnet 4.5",
        provider_id: "anthropic",
        provider_name: "Anthropic",
      },
    ],
  }),
});

const createRouteApp = () =>
  createApp({ openCodeModelsAdapter: createSupportedOpenCodeModelsAdapter() });

const insertProject = (projectRoot: string) => {
  const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      git_origin_url TEXT NOT NULL UNIQUE,
      global_provider_id TEXT NOT NULL,
      global_model_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  database
    .prepare(
      "INSERT INTO projects (id, name, git_origin_url, global_provider_id, global_model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      mainProjectId,
      "Project",
      "https://github.com/example/repo.git",
      "anthropic",
      "claude-sonnet-4-5",
      "2026-04-26T00:00:00.000Z",
      "2026-04-26T00:00:00.000Z",
    );
  database.close();
};

const mockGhPullRequestOutput = (stdout: string) => {
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string) => void,
    ) => {
      callback(null, stdout);
    },
  );
};

let previousProjectRoot: string | undefined;

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;

  return projectRoot;
};

afterEach(async () => {
  execFileMock.mockReset();

  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  previousProjectRoot = undefined;

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("opencode session routes", () => {
  it("creates a pending OpenCode session record and reads the persisted prompt", async () => {
    const projectRoot = await useProjectRoot("creates-and-reads-session");
    const app = createApp();

    const createResponse = await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-1",
        continue_prompt: "Continue the standalone AIM-controlled session.",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdSession = await createResponse.json();

    expect(createdSession).toMatchObject({
      session_id: "session-1",
      state: "pending",
      value: null,
      reason: null,
      continue_prompt: "Continue the standalone AIM-controlled session.",
    });
    expect(Date.parse(createdSession.created_at)).not.toBeNaN();
    expect(Date.parse(createdSession.updated_at)).not.toBeNaN();

    const detailResponse = await app.request(opencodeSessionPath("session-1"));

    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toEqual(createdSession);

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const columns = database
      .prepare("PRAGMA table_info(opencode_sessions)")
      .all();
    const persisted = database
      .prepare(
        "SELECT session_id, state, value, reason, continue_prompt FROM opencode_sessions WHERE session_id = ?",
      )
      .get("session-1");
    database.close();

    expect(columns.map((column) => (column as { name: string }).name)).toEqual(
      expect.arrayContaining([
        "session_id",
        "state",
        "value",
        "reason",
        "continue_prompt",
        "created_at",
        "updated_at",
      ]),
    );
    expect(persisted).toEqual({
      session_id: "session-1",
      state: "pending",
      value: null,
      reason: null,
      continue_prompt: "Continue the standalone AIM-controlled session.",
    });
  });

  it("settles pending OpenCode sessions through resolve and reject endpoints", async () => {
    await useProjectRoot("settles-sessions");
    const app = createApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-resolved",
        continue_prompt: "Continue until resolved.",
      }),
    });
    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-rejected",
        continue_prompt: "Continue until rejected.",
      }),
    });

    const resolveResponse = await app.request(
      opencodeSessionResolvePath("session-resolved"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "finished" }),
      },
    );
    const rejectResponse = await app.request(
      opencodeSessionRejectPath("session-rejected"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "blocked" }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    expect(rejectResponse.status).toBe(204);

    await expect(
      (await app.request(opencodeSessionPath("session-resolved"))).json(),
    ).resolves.toMatchObject({
      session_id: "session-resolved",
      state: "resolved",
      value: "finished",
      reason: null,
    });
    await expect(
      (await app.request(opencodeSessionPath("session-rejected"))).json(),
    ).resolves.toMatchObject({
      session_id: "session-rejected",
      state: "rejected",
      value: null,
      reason: "blocked",
    });
  });

  it("rejecting a session also rejects the task bound through tasks.session_id", async () => {
    const projectRoot = await useProjectRoot("rejects-bound-task");
    insertProject(projectRoot);
    const app = createRouteApp();

    const taskResponse = await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        session_id: "session-task-rejected",
        status: "processing",
        task_spec: "Reject this task from the session API.",
        title: "Reject bound task",
      }),
    });
    const createdTask = await taskResponse.json();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-rejected",
        continue_prompt: "Continue until rejected.",
      }),
    });

    const rejectResponse = await app.request(
      opencodeSessionRejectPath("session-task-rejected"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "cannot proceed" }),
      },
    );

    expect(rejectResponse.status).toBe(204);
    await expect(
      (await app.request(taskByIdPath(createdTask.task_id))).json(),
    ).resolves.toMatchObject({
      done: true,
      result: "cannot proceed",
      session_id: "session-task-rejected",
      status: "rejected",
    });
  });

  it("resolving a bound task session keeps task resolve pull request validation", async () => {
    const projectRoot = await useProjectRoot("resolve-bound-task-requires-pr");
    insertProject(projectRoot);
    const app = createRouteApp();

    await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        session_id: "session-task-resolve-no-pr",
        status: "processing",
        task_spec: "Resolve this task from the session API.",
        title: "Resolve bound task",
      }),
    });
    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-resolve-no-pr",
        continue_prompt: "Continue until resolved.",
      }),
    });

    const resolveResponse = await app.request(
      opencodeSessionResolvePath("session-task-resolve-no-pr"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "ship it" }),
      },
    );

    expect(resolveResponse.status).toBe(400);
    await expect(resolveResponse.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message: expect.stringContaining("pull_request_url"),
    });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("settling a bound task session keeps the task result payload requirement", async () => {
    const projectRoot = await useProjectRoot(
      "settle-bound-task-requires-result",
    );
    insertProject(projectRoot);
    const app = createRouteApp();

    await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        session_id: "session-task-missing-result",
        status: "processing",
        task_spec: "Settle this task from the session API.",
        title: "Settle bound task",
      }),
    });
    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-missing-result",
        continue_prompt: "Continue until settled.",
      }),
    });

    const rejectResponse = await app.request(
      opencodeSessionRejectPath("session-task-missing-result"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    expect(rejectResponse.status).toBe(400);
    await expect(rejectResponse.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message: expect.stringContaining("result"),
    });
  });

  it("resolving a session also resolves the bound task when task resolve rules pass", async () => {
    const projectRoot = await useProjectRoot("resolves-bound-task");
    insertProject(projectRoot);
    mockGhPullRequestOutput(ghMergedPullRequestOutput);
    const app = createRouteApp();

    const taskResponse = await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        session_id: "session-task-resolved",
        status: "processing",
        task_spec: "Resolve this task from the session API.",
        title: "Resolve bound task",
      }),
    });
    const createdTask = await taskResponse.json();
    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-resolved",
        continue_prompt: "Continue until resolved.",
      }),
    });

    const resolveResponse = await app.request(
      opencodeSessionResolvePath("session-task-resolved"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "ship it" }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    await expect(
      (await app.request(taskByIdPath(createdTask.task_id))).json(),
    ).resolves.toMatchObject({
      done: true,
      result: "ship it",
      session_id: "session-task-resolved",
      status: "resolved",
    });
  });
});
