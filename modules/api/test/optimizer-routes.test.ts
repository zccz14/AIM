import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-optimizer-routes",
);
const jsonHeaders = { "content-type": "application/json" };
const opencodeSessionsPath = "/opencode/sessions";
const tasksPath = "/tasks";
const defaultBudgetWarning = {
  status: "not_configured",
  token_warning_threshold: null,
  cost_warning_threshold: null,
  message: null,
};
const defaultTokenBudget = {
  exhausted: false,
  limit: null,
  remaining: null,
  used: 0,
};

let previousOpenCodeBaseUrl: string | undefined;
let previousProjectRoot: string | undefined;

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

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;
  previousOpenCodeBaseUrl = process.env.OPENCODE_BASE_URL;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;
  process.env.OPENCODE_BASE_URL = "http://opencode.test/";
};

const createProject = async (
  app: ReturnType<typeof createApp>,
  optimizerEnabled: boolean,
) => {
  const response = await app.request("/projects", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      git_origin_url: `https://github.com/example/${String(optimizerEnabled)}.git`,
      global_model_id: "claude-sonnet-4-5",
      global_provider_id: "anthropic",
      name: optimizerEnabled ? "Optimizer enabled" : "Optimizer disabled",
      optimizer_enabled: optimizerEnabled,
    }),
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<{ id: string }>;
};

const createSession = async (
  app: ReturnType<typeof createApp>,
  projectId: string,
  sessionId: string,
) => {
  const response = await app.request(opencodeSessionsPath, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      project_id: projectId,
      session_id: sessionId,
      continue_prompt: `Continue ${sessionId}.`,
    }),
  });

  expect(response.status).toBe(201);
};

const createTask = async (
  app: ReturnType<typeof createApp>,
  input: { projectId: string; sessionId?: string; title: string },
) => {
  const response = await app.request(tasksPath, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      project_id: input.projectId,
      session_id: input.sessionId,
      task_spec: `# ${input.title}`,
      title: input.title,
    }),
  });

  expect(response.status).toBe(201);
};

afterEach(async () => {
  vi.unstubAllGlobals();

  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  if (previousOpenCodeBaseUrl === undefined) {
    delete process.env.OPENCODE_BASE_URL;
  } else {
    process.env.OPENCODE_BASE_URL = previousOpenCodeBaseUrl;
  }

  previousProjectRoot = undefined;
  previousOpenCodeBaseUrl = undefined;

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("optimizer routes", () => {
  it("does not expose global optimizer runtime controls", async () => {
    const app = createApp();

    await expect(app.request("/optimizer/status")).resolves.toHaveProperty(
      "status",
      404,
    );
    await expect(
      app.request("/optimizer/start", { method: "POST" }),
    ).resolves.toHaveProperty("status", 404);
    await expect(
      app.request("/optimizer/stop", { method: "POST" }),
    ).resolves.toHaveProperty("status", 404);
  });

  it("reports disabled project optimizer config separately from runtime activity", async () => {
    await useProjectRoot("disabled-project");

    const app = createApp({
      openCodeModelsAdapter: createSupportedOpenCodeModelsAdapter(),
      optimizerSystem: { [Symbol.asyncDispose]: async () => undefined },
    });
    const project = await createProject(app, false);

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      project_id: project.id,
      optimizer_enabled: false,
      runtime_active: false,
      current_baseline_commit_sha: null,
      blocker_summary: "Optimizer disabled for project",
      recent_events: [],
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
    });
  });

  it("reports enabled project config without system presence as inactive", async () => {
    await useProjectRoot("enabled-inactive-project");

    const app = createApp();
    const project = await createProject(app, true);

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      project_id: project.id,
      optimizer_enabled: true,
      runtime_active: false,
      current_baseline_commit_sha: null,
      blocker_summary: "Optimizer runtime inactive",
      recent_events: [],
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
    });
  });

  it("reports enabled project config with optimizer system presence as active", async () => {
    await useProjectRoot("enabled-active-project");

    const app = createApp({
      openCodeModelsAdapter: createSupportedOpenCodeModelsAdapter(),
      optimizerSystem: { [Symbol.asyncDispose]: async () => undefined },
    });
    const project = await createProject(app, true);

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      project_id: project.id,
      optimizer_enabled: true,
      runtime_active: true,
      current_baseline_commit_sha: null,
      blocker_summary: null,
      recent_events: [],
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
    });
  });

  it("summarizes project token usage on optimizer status without exposing message content", async () => {
    await useProjectRoot("enabled-active-project-with-token-usage");

    const app = createApp({
      openCodeModelsAdapter: createSupportedOpenCodeModelsAdapter(),
      optimizerSystem: { [Symbol.asyncDispose]: async () => undefined },
    });
    const project = await createProject(app, true);
    await createSession(app, project.id, "root-session");
    await createTask(app, {
      projectId: project.id,
      sessionId: "root-session",
      title: "Token task",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (
          String(input) === "http://opencode.test/session/root-session/message"
        ) {
          return Response.json([
            {
              info: {
                cost: 1.25,
                id: "assistant-message",
                role: "assistant",
                sessionID: "root-session",
                tokens: {
                  cache: { read: 30, write: 40 },
                  input: 10,
                  output: 20,
                  reasoning: 5,
                  total: 105,
                },
              },
              parts: [{ text: "do not expose this prompt", type: "text" }],
            },
          ]);
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      project_id: project.id,
      token_usage: {
        availability: "available",
        failed_root_session_count: 0,
        failure_summary: null,
        root_session_count: 1,
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
    });
    expect(JSON.stringify(body)).not.toContain("do not expose this prompt");
  });

  it("marks optimizer status token usage partial when some root sessions fail", async () => {
    await useProjectRoot("enabled-active-project-with-partial-token-usage");

    const app = createApp({
      openCodeModelsAdapter: createSupportedOpenCodeModelsAdapter(),
      optimizerSystem: { [Symbol.asyncDispose]: async () => undefined },
    });
    const project = await createProject(app, true);
    await createSession(app, project.id, "successful-session");
    await createSession(app, project.id, "failing-session");
    await createTask(app, {
      projectId: project.id,
      sessionId: "successful-session",
      title: "Successful task",
    });
    await createTask(app, {
      projectId: project.id,
      sessionId: "failing-session",
      title: "Failing task",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (
          String(input) ===
          "http://opencode.test/session/successful-session/message"
        ) {
          return Response.json([
            {
              info: {
                cost: 2,
                id: "assistant-message",
                role: "assistant",
                sessionID: "successful-session",
                tokens: { input: 11, output: 13, total: 24 },
              },
              parts: [],
            },
          ]);
        }

        return new Response("ghp_secret_token_12345678901234567890", {
          status: 503,
        });
      }),
    );

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      token_usage: {
        availability: "partial",
        failed_root_session_count: 1,
        failure_summary: "Token usage unavailable for 1 of 2 root sessions.",
        root_session_count: 2,
        totals: {
          cache: { read: 0, write: 0 },
          cost: 2,
          input: 11,
          messages: 1,
          output: 13,
          reasoning: 0,
          total: 24,
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("ghp_");
  });

  it("reports optimizer lane status for an enabled active project", async () => {
    await useProjectRoot("enabled-active-project-with-lane-signals");

    const blockerSummary =
      "Manager lane active; recent scan at 2026-04-29T10:15:30.000Z";
    const app = createApp({
      optimizerSystem: {
        [Symbol.asyncDispose]: async () => undefined,
        getProjectStatus: () => ({
          blocker_summary: blockerSummary,
          recent_events: [
            {
              event: "failure",
              lane_name: "manager",
              project_id: project.id,
              summary:
                "Manager lane failed: git fetch failed. Check workspace access and retry after clearing the blocker.",
              timestamp: "2026-04-29T10:16:30.000Z",
            },
          ],
        }),
      },
    });
    const project = await createProject(app, true);

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project_id: project.id,
      optimizer_enabled: true,
      runtime_active: true,
      blocker_summary: blockerSummary,
      recent_events: [
        expect.objectContaining({
          event: "failure",
          lane_name: "manager",
          summary: expect.stringContaining("clearing the blocker"),
        }),
      ],
    });
  });
});
