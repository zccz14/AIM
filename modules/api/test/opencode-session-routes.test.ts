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
const opencodeSessionTokenUsageRefreshPath = (sessionId: string) =>
  `/opencode/sessions/${sessionId}/token-usage/refresh`;
const opencodeSessionContinuePath = (sessionId: string) =>
  `/opencode/sessions/${sessionId}/continue`;
const opencodeSessionsContinuePendingPath =
  "/opencode/sessions/continue_pending";
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
  createApp({
    currentBaselineFactsProvider: vi.fn().mockResolvedValue({ commit: null }),
    openCodeModelsAdapter: createSupportedOpenCodeModelsAdapter(),
  });

const createRouteAppWithSessionPromptSender = (
  sendPrompt = vi.fn().mockResolvedValue(undefined),
) => ({
  app: createApp({
    currentBaselineFactsProvider: vi.fn().mockResolvedValue({ commit: null }),
    openCodeModelsAdapter: createSupportedOpenCodeModelsAdapter(),
  }),
  sendPrompt,
});

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
  it("lists OpenCode session promises and filters them by state", async () => {
    await useProjectRoot("lists-and-filters-sessions");
    const app = createApp();

    for (const sessionId of [
      "session-pending",
      "session-resolved",
      "session-rejected",
    ]) {
      const createResponse = await app.request(opencodeSessionsPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          continue_prompt: `Continue ${sessionId}.`,
        }),
      });

      expect(createResponse.status).toBe(201);
    }

    expect(
      await app.request(opencodeSessionResolvePath("session-resolved"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "finished" }),
      }),
    ).toMatchObject({ status: 204 });
    expect(
      await app.request(opencodeSessionRejectPath("session-rejected"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "blocked" }),
      }),
    ).toMatchObject({ status: 204 });

    const listResponse = await app.request(opencodeSessionsPath);

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          session_id: "session-pending",
          state: "pending",
          value: null,
          reason: null,
        }),
        expect.objectContaining({
          session_id: "session-resolved",
          state: "resolved",
          value: "finished",
          reason: null,
        }),
        expect.objectContaining({
          session_id: "session-rejected",
          state: "rejected",
          value: null,
          reason: "blocked",
        }),
      ]),
    });

    const filteredResponse = await app.request(
      `${opencodeSessionsPath}?state=resolved`,
    );

    expect(filteredResponse.status).toBe(200);
    await expect(filteredResponse.json()).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          session_id: "session-resolved",
          state: "resolved",
          value: "finished",
        }),
      ],
    });
  });

  it("updates continue_prompt only while an OpenCode session is pending", async () => {
    await useProjectRoot("patches-pending-session-prompt");
    const app = createApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-prompt",
        continue_prompt: "Continue with stale instructions.",
      }),
    });

    const patchResponse = await app.request(
      opencodeSessionPath("session-prompt"),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          continue_prompt: "Continue with recovered instructions.",
        }),
      },
    );

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      session_id: "session-prompt",
      state: "pending",
      continue_prompt: "Continue with recovered instructions.",
    });

    await app.request(opencodeSessionResolvePath("session-prompt"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "done" }),
    });

    const settledPatchResponse = await app.request(
      opencodeSessionPath("session-prompt"),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ continue_prompt: "Retry after settlement." }),
      },
    );

    expect(settledPatchResponse.status).toBe(409);
    await expect(settledPatchResponse.json()).resolves.toMatchObject({
      code: "TASK_CONFLICT",
      message: expect.stringContaining("pending"),
    });
  });

  it("validates continue_prompt patch payloads and missing sessions", async () => {
    await useProjectRoot("validates-patch-session-prompt");
    const app = createApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "session-invalid-patch" }),
    });

    const invalidResponse = await app.request(
      opencodeSessionPath("session-invalid-patch"),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ continue_prompt: 42 }),
      },
    );

    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message: expect.stringContaining("Invalid OpenCode session"),
    });

    const missingResponse = await app.request(opencodeSessionPath("missing"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ continue_prompt: "Recover missing session." }),
    });

    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toMatchObject({
      code: "TASK_NOT_FOUND",
      message: expect.stringContaining("missing"),
    });
  });

  it("does not expose a single-session external continue endpoint", async () => {
    await useProjectRoot("single-session-continue-not-exposed");
    const { app, sendPrompt } = createRouteAppWithSessionPromptSender();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-pending",
        continue_prompt: "Continue the AIM-controlled session.",
        provider_id: "anthropic",
        model_id: "claude-sonnet-4-5",
      }),
    });

    const response = await app.request(
      opencodeSessionContinuePath("session-pending"),
      { method: "POST" },
    );

    expect(response.status).toBe(404);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  it("does not expose a bulk external continue endpoint", async () => {
    await useProjectRoot("bulk-continue-not-exposed");
    const { app, sendPrompt } = createRouteAppWithSessionPromptSender();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-pending",
        continue_prompt: "Continue the AIM-controlled session.",
      }),
    });

    const response = await app.request(opencodeSessionsContinuePendingPath, {
      method: "POST",
    });

    expect(response.status).toBe(404);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

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
      model_id: null,
      provider_id: null,
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
        "SELECT session_id, state, value, reason, continue_prompt, provider_id, model_id, input_tokens, cached_tokens, cache_write_tokens, output_tokens, reasoning_tokens FROM opencode_sessions WHERE session_id = ?",
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
        "provider_id",
        "model_id",
        "input_tokens",
        "cached_tokens",
        "cache_write_tokens",
        "output_tokens",
        "reasoning_tokens",
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
      provider_id: null,
      model_id: null,
      input_tokens: 0,
      cached_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 0,
      reasoning_tokens: 0,
    });
  });

  it("migrates existing OpenCode session tables to the documented session schema", async () => {
    const projectRoot = await useProjectRoot(
      "migrates-opencode-session-schema",
    );
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        git_origin_url TEXT NOT NULL UNIQUE,
        global_provider_id TEXT NOT NULL,
        global_model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    database.exec(`
      CREATE TABLE opencode_sessions (
        session_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        value TEXT,
        reason TEXT,
        continue_prompt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    database
      .prepare(
        "INSERT INTO opencode_sessions (session_id, state, value, reason, continue_prompt, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?, ?)",
      )
      .run(
        "legacy-session",
        "pending",
        "Continue the legacy session.",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );
    database.close();

    const app = createApp();
    const response = await app.request(opencodeSessionPath("legacy-session"));

    expect(response.status).toBe(200);

    const migratedDatabase = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const columns = migratedDatabase
      .prepare("PRAGMA table_info(opencode_sessions)")
      .all()
      .map((column) => (column as { name: string }).name);
    const foreignKeys = migratedDatabase
      .prepare("PRAGMA foreign_key_list(opencode_sessions)")
      .all();
    const persisted = migratedDatabase
      .prepare(
        "SELECT session_id, title, project_id, continue_prompt, provider_id, model_id, state, input_tokens, cached_tokens, cache_write_tokens, output_tokens, reasoning_tokens FROM opencode_sessions WHERE session_id = ?",
      )
      .get("legacy-session");
    migratedDatabase.exec("PRAGMA foreign_keys = ON");
    migratedDatabase
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
    migratedDatabase
      .prepare(
        "INSERT INTO opencode_sessions (session_id, project_id, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "project-session",
        mainProjectId,
        "pending",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );
    expect(() =>
      migratedDatabase
        .prepare(
          "INSERT INTO opencode_sessions (session_id, state, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run(
          "invalid-state-session",
          "archived",
          "2026-04-26T00:00:00.000Z",
          "2026-04-26T00:00:00.000Z",
        ),
    ).toThrow();
    migratedDatabase
      .prepare("DELETE FROM projects WHERE id = ?")
      .run(mainProjectId);
    const cascadedSession = migratedDatabase
      .prepare("SELECT session_id FROM opencode_sessions WHERE session_id = ?")
      .get("project-session");
    migratedDatabase.close();

    expect(columns).toEqual(
      expect.arrayContaining([
        "session_id",
        "title",
        "project_id",
        "continue_prompt",
        "provider_id",
        "model_id",
        "state",
        "value",
        "reason",
        "created_at",
        "updated_at",
        "input_tokens",
        "cached_tokens",
        "cache_write_tokens",
        "output_tokens",
        "reasoning_tokens",
      ]),
    );
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "project_id",
          on_delete: "CASCADE",
          table: "projects",
          to: "id",
        }),
      ]),
    );
    expect(persisted).toEqual({
      session_id: "legacy-session",
      title: null,
      project_id: null,
      continue_prompt: "Continue the legacy session.",
      provider_id: null,
      model_id: null,
      state: "pending",
      input_tokens: 0,
      cached_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 0,
      reasoning_tokens: 0,
    });
    expect(cascadedSession).toBeUndefined();
  });

  it("does not bootstrap legacy optimizer lane state storage", async () => {
    const projectRoot = await useProjectRoot("skips-lane-state-schema");
    const app = createApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-schema",
        continue_prompt: "Continue through the plugin-owned session queue.",
      }),
    });

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const opencodeColumns = database
      .prepare("PRAGMA table_info(opencode_sessions)")
      .all()
      .map((column) => (column as { name: string }).name);
    const laneStateTables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .all("optimizer_lane_states");
    database.close();

    expect(opencodeColumns).not.toEqual(
      expect.arrayContaining(["owner_id", "owner_type"]),
    );
    expect(laneStateTables).toEqual([]);
  });

  it("preserves an existing legacy optimizer lane state table", async () => {
    const projectRoot = await useProjectRoot("preserves-lane-state-table");
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database.exec(
      "CREATE TABLE optimizer_lane_states (legacy_value TEXT NOT NULL)",
    );
    database
      .prepare("INSERT INTO optimizer_lane_states (legacy_value) VALUES (?)")
      .run("keep me");
    database.close();

    const app = createApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-preserve-schema",
        continue_prompt: "Continue without touching the legacy table.",
      }),
    });

    const migratedDatabase = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const laneStateRows = migratedDatabase
      .prepare("SELECT legacy_value FROM optimizer_lane_states")
      .all();
    migratedDatabase.close();

    expect(laneStateRows).toEqual([{ legacy_value: "keep me" }]);
  });

  it("exposes stale visibility for old pending sessions without changing their state", async () => {
    const projectRoot = await useProjectRoot("shows-stale-pending-session");
    const app = createApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-stale",
        continue_prompt: "Continue stale work.",
      }),
    });

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    database
      .prepare(
        "UPDATE opencode_sessions SET created_at = ?, updated_at = ? WHERE session_id = ?",
      )
      .run(
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
        "session-stale",
      );
    database.close();

    const detailResponse = await app.request(
      opencodeSessionPath("session-stale"),
    );
    const listResponse = await app.request(opencodeSessionsPath);

    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      session_id: "session-stale",
      stale: true,
      state: "pending",
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          session_id: "session-stale",
          stale: true,
          state: "pending",
        }),
      ],
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

  it("records recomputed OpenCode token usage when resolving a session", async () => {
    await useProjectRoot("resolve-records-token-usage");
    const app = createApp();
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (
        url === "http://localhost:4096/session/session-token-resolved/message"
      ) {
        return Response.json([
          {
            info: {
              id: "user-message",
              role: "user",
              sessionID: "session-token-resolved",
            },
          },
          {
            info: {
              id: "assistant-message",
              role: "assistant",
              sessionID: "session-token-resolved",
              tokens: {
                cache: { read: 30, write: 40 },
                input: 10,
                output: 20,
                reasoning: 5,
              },
            },
          },
        ]);
      }

      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetch);

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-token-resolved",
        continue_prompt: "Continue until resolved.",
      }),
    });

    const resolveResponse = await app.request(
      opencodeSessionResolvePath("session-token-resolved"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "finished" }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    await expect(
      (await app.request(opencodeSessionPath("session-token-resolved"))).json(),
    ).resolves.toMatchObject({
      cached_tokens: 30,
      cache_write_tokens: 40,
      input_tokens: 10,
      output_tokens: 20,
      reasoning_tokens: 5,
      session_id: "session-token-resolved",
      state: "resolved",
    });
  });

  it("recomputes and overwrites OpenCode token usage when rejecting a settled session again", async () => {
    await useProjectRoot("reject-overwrites-token-usage");
    const app = createApp();
    const tokenSnapshots = [
      {
        cacheRead: 300,
        cacheWrite: 400,
        input: 100,
        output: 200,
        reasoning: 50,
      },
      { cacheRead: 3, cacheWrite: 4, input: 1, output: 2, reasoning: 5 },
    ];
    const fetch = vi.fn(async () => {
      const snapshot = tokenSnapshots[Math.min(fetch.mock.calls.length - 1, 1)];

      return Response.json([
        {
          info: {
            id: `assistant-message-${fetch.mock.calls.length}`,
            role: "assistant",
            sessionID: "session-token-rejected",
            tokens: {
              cache: { read: snapshot.cacheRead, write: snapshot.cacheWrite },
              input: snapshot.input,
              output: snapshot.output,
              reasoning: snapshot.reasoning,
            },
          },
        },
      ]);
    });
    vi.stubGlobal("fetch", fetch);

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-token-rejected",
        continue_prompt: "Continue until rejected.",
      }),
    });

    expect(
      await app.request(opencodeSessionRejectPath("session-token-rejected"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "blocked" }),
      }),
    ).toMatchObject({ status: 204 });
    expect(
      await app.request(opencodeSessionRejectPath("session-token-rejected"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "still blocked" }),
      }),
    ).toMatchObject({ status: 204 });

    await expect(
      (await app.request(opencodeSessionPath("session-token-rejected"))).json(),
    ).resolves.toMatchObject({
      cached_tokens: 3,
      cache_write_tokens: 4,
      input_tokens: 1,
      output_tokens: 2,
      reasoning_tokens: 5,
      reason: "blocked",
      session_id: "session-token-rejected",
      state: "rejected",
    });
  });

  it("manually refreshes one OpenCode session token usage without settling the session", async () => {
    await useProjectRoot("refresh-token-usage");
    const app = createApp();
    const tokenSnapshots = [
      {
        cacheRead: 300,
        cacheWrite: 400,
        input: 100,
        output: 200,
        reasoning: 50,
      },
      { cacheRead: 3, cacheWrite: 4, input: 1, output: 2, reasoning: 5 },
    ];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe(
        "http://localhost:4096/session/session-refresh/message",
      );
      const snapshot = tokenSnapshots[Math.min(fetch.mock.calls.length - 1, 1)];

      return Response.json([
        {
          info: {
            id: `assistant-message-${fetch.mock.calls.length}`,
            role: "assistant",
            sessionID: "session-refresh",
            tokens: {
              cache: { read: snapshot.cacheRead, write: snapshot.cacheWrite },
              input: snapshot.input,
              output: snapshot.output,
              reasoning: snapshot.reasoning,
            },
          },
        },
      ]);
    });
    vi.stubGlobal("fetch", fetch);

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-refresh",
        continue_prompt: "Continue until refreshed.",
      }),
    });

    const firstRefreshResponse = await app.request(
      opencodeSessionTokenUsageRefreshPath("session-refresh"),
      { method: "POST" },
    );
    const secondRefreshResponse = await app.request(
      opencodeSessionTokenUsageRefreshPath("session-refresh"),
      { method: "POST" },
    );

    expect(firstRefreshResponse.status).toBe(200);
    await expect(firstRefreshResponse.json()).resolves.toMatchObject({
      cached_tokens: 300,
      cache_write_tokens: 400,
      input_tokens: 100,
      output_tokens: 200,
      reasoning_tokens: 50,
      reason: null,
      session_id: "session-refresh",
      state: "pending",
      value: null,
    });
    expect(secondRefreshResponse.status).toBe(200);
    await expect(secondRefreshResponse.json()).resolves.toMatchObject({
      cached_tokens: 3,
      cache_write_tokens: 4,
      input_tokens: 1,
      output_tokens: 2,
      reasoning_tokens: 5,
      reason: null,
      session_id: "session-refresh",
      state: "pending",
      value: null,
    });
    await expect(
      (await app.request(opencodeSessionPath("session-refresh"))).json(),
    ).resolves.toMatchObject({
      cached_tokens: 3,
      cache_write_tokens: 4,
      input_tokens: 1,
      output_tokens: 2,
      reasoning_tokens: 5,
      reason: null,
      session_id: "session-refresh",
      state: "pending",
      value: null,
    });
  });

  it("returns not found when refreshing token usage for a missing OpenCode session", async () => {
    await useProjectRoot("refresh-token-usage-missing-session");
    const app = createApp();

    const response = await app.request(
      opencodeSessionTokenUsageRefreshPath("session-missing"),
      { method: "POST" },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "TASK_NOT_FOUND",
      message: "OpenCode session session-missing was not found",
    });
  });

  it("rejecting a session also rejects the task bound through tasks.session_id", async () => {
    const projectRoot = await useProjectRoot("rejects-bound-task");
    insertProject(projectRoot);
    const app = createRouteApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-rejected",
        continue_prompt: "Continue until rejected.",
      }),
    });
    const taskResponse = await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        session_id: "session-task-rejected",
        status: "pending",
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

  it("settling an already settled bound session is idempotent and leaves the task unchanged", async () => {
    const projectRoot = await useProjectRoot("idempotent-bound-task-settle");
    insertProject(projectRoot);
    const app = createRouteApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-idempotent",
        continue_prompt: "Continue until rejected once.",
      }),
    });
    const taskResponse = await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        session_id: "session-task-idempotent",
        status: "pending",
        task_spec: "Reject this task once from the session API.",
        title: "Reject bound task once",
      }),
    });
    const createdTask = await taskResponse.json();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-idempotent",
        continue_prompt: "Continue until rejected once.",
      }),
    });

    expect(
      await app.request(opencodeSessionRejectPath("session-task-idempotent"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "first terminal result" }),
      }),
    ).toMatchObject({ status: 204 });

    const taskAfterFirstSettle = await (
      await app.request(taskByIdPath(createdTask.task_id))
    ).json();

    expect(
      await app.request(opencodeSessionRejectPath("session-task-idempotent"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "second terminal result" }),
      }),
    ).toMatchObject({ status: 204 });
    await expect(
      (
        await app.request(opencodeSessionPath("session-task-idempotent"))
      ).json(),
    ).resolves.toMatchObject({
      reason: "first terminal result",
      state: "rejected",
    });
    await expect(
      (await app.request(taskByIdPath(createdTask.task_id))).json(),
    ).resolves.toMatchObject({
      result: taskAfterFirstSettle.result,
      status: taskAfterFirstSettle.status,
      updated_at: taskAfterFirstSettle.updated_at,
    });
  });

  it("resolving a bound task session keeps task resolve pull request validation", async () => {
    const projectRoot = await useProjectRoot("resolve-bound-task-requires-pr");
    insertProject(projectRoot);
    const app = createRouteApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-resolve-no-pr",
        continue_prompt: "Continue until resolved.",
      }),
    });
    await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        session_id: "session-task-resolve-no-pr",
        status: "pending",
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

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-missing-result",
        continue_prompt: "Continue until settled.",
      }),
    });
    await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        session_id: "session-task-missing-result",
        status: "pending",
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

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-task-resolved",
        continue_prompt: "Continue until resolved.",
      }),
    });
    const taskResponse = await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        session_id: "session-task-resolved",
        status: "pending",
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

  it("runs the developer session API lifecycle from registered prompt to terminal task settlement", async () => {
    const projectRoot = await useProjectRoot("developer-session-lifecycle");
    insertProject(projectRoot);
    mockGhPullRequestOutput(ghMergedPullRequestOutput);
    const app = createRouteApp();

    const createSessionResponse = await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "developer-session-1",
        continue_prompt: "Continue the registered Developer task.",
      }),
    });
    const taskResponse = await app.request(tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        session_id: "developer-session-1",
        status: "pending",
        task_spec: "Complete this developer session.",
        title: "Developer session lifecycle",
      }),
    });
    const createdTask = await taskResponse.json();

    expect(createSessionResponse.status).toBe(201);
    await expect(
      (await app.request(opencodeSessionPath("developer-session-1"))).json(),
    ).resolves.toMatchObject({
      continue_prompt: "Continue the registered Developer task.",
      session_id: "developer-session-1",
      stale: false,
      state: "pending",
    });

    const resolveResponse = await app.request(
      opencodeSessionResolvePath("developer-session-1"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "completed through plugin tool" }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    await expect(
      (await app.request(opencodeSessionPath("developer-session-1"))).json(),
    ).resolves.toMatchObject({
      session_id: "developer-session-1",
      stale: false,
      state: "resolved",
      value: "completed through plugin tool",
    });
    await expect(
      (await app.request(taskByIdPath(createdTask.task_id))).json(),
    ).resolves.toMatchObject({
      done: true,
      result: "completed through plugin tool",
      session_id: "developer-session-1",
      status: "resolved",
    });
  });
});
