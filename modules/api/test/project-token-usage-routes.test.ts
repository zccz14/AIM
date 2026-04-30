import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-project-token-usage-routes",
);
const projectsPath = "/projects";
const projectByIdPath = (projectId: string) => `/projects/${projectId}`;
const opencodeSessionsPath = "/opencode/sessions";
const tasksPath = "/tasks";
const projectTokenUsagePath = (projectId: string) =>
  `/projects/${projectId}/token-usage`;

const missingProjectId = "00000000-0000-4000-8000-000000000001";

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

let previousOpenCodeBaseUrl: string | undefined;
let previousProjectRoot: string | undefined;

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
  name: string,
) => {
  const response = await app.request(projectsPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      git_origin_url: `https://github.com/example/${name}.git`,
      global_provider_id: "anthropic",
      global_model_id: "claude-sonnet-4-5",
    }),
  });

  expect(response.status).toBe(201);

  return (await response.json()) as { id: string };
};

const createSession = async (
  app: ReturnType<typeof createApp>,
  sessionId: string,
) => {
  const response = await app.request(opencodeSessionsPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      continue_prompt: `Continue ${sessionId}.`,
    }),
  });

  expect(response.status).toBe(201);
};

const createTask = async (
  app: ReturnType<typeof createApp>,
  input: {
    projectId: string;
    sessionId?: string;
    title: string;
  },
) => {
  const response = await app.request(tasksPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project_id: input.projectId,
      session_id: input.sessionId,
      task_spec: `# ${input.title}`,
      title: input.title,
    }),
  });

  expect(response.status).toBe(201);

  return (await response.json()) as { task_id: string };
};

afterEach(async () => {
  vi.useRealTimers();
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

describe("project token usage route", () => {
  it("aggregates token usage by project, task, and session while preserving recursive child-session attribution and project isolation", async () => {
    await useProjectRoot("aggregates-project-usage");
    const app = createRouteApp();

    const mainProject = await createProject(app, "main-project");
    const isolatedProject = await createProject(app, "isolated-project");
    await createSession(app, "root-session");
    await createSession(app, "other-session");
    const mainTask = await createTask(app, {
      projectId: mainProject.id,
      sessionId: "root-session",
      title: "Main task",
    });
    await createTask(app, {
      projectId: isolatedProject.id,
      sessionId: "other-session",
      title: "Other project task",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url === "http://opencode.test/session/root-session/message") {
          return Response.json([
            {
              info: {
                cost: 1.25,
                id: "root-assistant-message",
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
              parts: [
                {
                  state: { metadata: { sessionId: "child-session" } },
                  tool: "task",
                  type: "tool",
                },
              ],
            },
          ]);
        }

        if (url === "http://opencode.test/session/child-session/message") {
          return Response.json([
            {
              info: {
                cost: 2.5,
                id: "child-assistant-message",
                role: "assistant",
                sessionID: "child-session",
                tokens: {
                  cache: { read: 300, write: 400 },
                  input: 100,
                  output: 200,
                  reasoning: 50,
                  total: 1050,
                },
              },
              parts: [],
            },
          ]);
        }

        if (url === "http://opencode.test/session/other-session/message") {
          return Response.json([
            {
              info: {
                cost: 999,
                id: "other-message",
                role: "assistant",
                sessionID: "other-session",
                tokens: { input: 999, output: 999, total: 1998 },
              },
              parts: [],
            },
          ]);
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const response = await app.request(projectTokenUsagePath(mainProject.id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      project_id: mainProject.id,
      totals: {
        cache: { read: 330, write: 440 },
        cost: 3.75,
        input: 110,
        messages: 2,
        output: 220,
        reasoning: 55,
        total: 1155,
      },
      budget_warning: {
        status: "not_configured",
        token_warning_threshold: null,
        cost_warning_threshold: null,
        message: null,
      },
      tasks: [
        {
          failures: [],
          session_id: "root-session",
          task_id: mainTask.task_id,
          title: "Main task",
          totals: {
            cache: { read: 330, write: 440 },
            cost: 3.75,
            input: 110,
            messages: 2,
            output: 220,
            reasoning: 55,
            total: 1155,
          },
        },
      ],
      sessions: [
        {
          failure: null,
          root_session_id: "root-session",
          task_id: mainTask.task_id,
          title: "Main task",
          totals: {
            cache: { read: 330, write: 440 },
            cost: 3.75,
            input: 110,
            messages: 2,
            output: 220,
            reasoning: 55,
            total: 1155,
          },
        },
      ],
      failures: [],
    });
  });

  it("returns an empty usage state for projects with no sessions or usage", async () => {
    await useProjectRoot("empty-project-usage");
    const app = createRouteApp();

    const project = await createProject(app, "empty-project");
    await createTask(app, {
      projectId: project.id,
      title: "No session task",
    });

    const response = await app.request(projectTokenUsagePath(project.id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project_id: project.id,
      totals: {
        cache: { read: 0, write: 0 },
        cost: 0,
        input: 0,
        messages: 0,
        output: 0,
        reasoning: 0,
        total: 0,
      },
      sessions: [],
      failures: [],
    });
  });

  it("persists optional project token budget thresholds and warns when usage exceeds them", async () => {
    await useProjectRoot("project-budget-warning");
    const app = createRouteApp();

    const project = await createProject(app, "budget-project");
    const patchResponse = await app.request(projectByIdPath(project.id), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token_warning_threshold: 1000,
        cost_warning_threshold: 10,
      }),
    });
    await createSession(app, "budget-session");
    await createTask(app, {
      projectId: project.id,
      sessionId: "budget-session",
      title: "Budgeted task",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            info: {
              cost: 3.75,
              id: "budget-message",
              role: "assistant",
              sessionID: "budget-session",
              tokens: {
                cache: { read: 0, write: 0 },
                input: 600,
                output: 500,
                reasoning: 100,
                total: 1200,
              },
            },
            parts: [],
          },
        ]),
      ),
    );

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      token_warning_threshold: 1000,
      cost_warning_threshold: 10,
    });

    const response = await app.request(projectTokenUsagePath(project.id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project_id: project.id,
      totals: { cost: 3.75, total: 1200 },
      budget_warning: {
        status: "exceeded",
        token_warning_threshold: 1000,
        cost_warning_threshold: 10,
        message:
          "Project token usage exceeds the configured token warning threshold.",
      },
    });
  });

  it("marks OpenCode message fetch failures without leaking sensitive detail", async () => {
    await useProjectRoot("opencode-fetch-failure");
    const app = createRouteApp();

    const project = await createProject(app, "failure-project");
    await createSession(app, "failing-session");
    const task = await createTask(app, {
      projectId: project.id,
      sessionId: "failing-session",
      title: "Failing task",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("ghp_secret_token_12345678901234567890", {
            status: 503,
          }),
      ),
    );

    const response = await app.request(projectTokenUsagePath(project.id));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      project_id: project.id,
      totals: {
        cache: { read: 0, write: 0 },
        cost: 0,
        input: 0,
        messages: 0,
        output: 0,
        reasoning: 0,
        total: 0,
      },
      sessions: [
        {
          failure: {
            code: "OPENCODE_MESSAGES_UNAVAILABLE",
            message: expect.stringContaining("failing-session"),
          },
          root_session_id: "failing-session",
          task_id: task.task_id,
          title: "Failing task",
        },
      ],
      failures: [
        {
          code: "OPENCODE_MESSAGES_UNAVAILABLE",
          message: expect.stringContaining("failing-session"),
          root_session_id: "failing-session",
          task_id: task.task_id,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("ghp_");
  });

  it("returns partial token usage when an OpenCode root session fetch exceeds the collection timeout", async () => {
    vi.useFakeTimers();
    await useProjectRoot("opencode-fetch-timeout");
    const app = createRouteApp();

    const project = await createProject(app, "timeout-project");
    await createSession(app, "slow-session");
    await createSession(app, "fast-session");
    const slowTask = await createTask(app, {
      projectId: project.id,
      sessionId: "slow-session",
      title: "Slow task",
    });
    const fastTask = await createTask(app, {
      projectId: project.id,
      sessionId: "fast-session",
      title: "Fast task",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url === "http://opencode.test/session/slow-session/message") {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("collection timed out", "AbortError"));
            });
          });
        }

        if (url === "http://opencode.test/session/fast-session/message") {
          return Response.json([
            {
              info: {
                cost: 1,
                id: "fast-message",
                role: "assistant",
                sessionID: "fast-session",
                tokens: { input: 2, output: 3, total: 5 },
              },
              parts: [],
            },
          ]);
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const responsePromise = app.request(projectTokenUsagePath(project.id));
    await vi.runAllTimersAsync();
    const response = await Promise.race([
      responsePromise,
      Promise.resolve("request still pending"),
    ]);

    expect(response).not.toBe("request still pending");
    expect((response as Response).status).toBe(200);
    const body = await (response as Response).json();
    expect(body).toMatchObject({
      project_id: project.id,
      totals: {
        cache: { read: 0, write: 0 },
        cost: 1,
        input: 2,
        messages: 1,
        output: 3,
        reasoning: 0,
        total: 5,
      },
      sessions: [
        {
          failure: {
            code: "OPENCODE_MESSAGES_UNAVAILABLE",
            message: expect.stringContaining("slow-session"),
          },
          root_session_id: "slow-session",
          task_id: slowTask.task_id,
          title: "Slow task",
        },
        {
          failure: null,
          root_session_id: "fast-session",
          task_id: fastTask.task_id,
          title: "Fast task",
        },
      ],
      failures: [
        {
          code: "OPENCODE_MESSAGES_UNAVAILABLE",
          message: expect.stringContaining("slow-session"),
          root_session_id: "slow-session",
          task_id: slowTask.task_id,
        },
      ],
    });
  });

  it("returns a project-scoped not found error for unknown projects", async () => {
    await useProjectRoot("missing-project-usage");
    const app = createRouteApp();

    const response = await app.request(projectTokenUsagePath(missingProjectId));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "PROJECT_NOT_FOUND",
      message: `Project ${missingProjectId} was not found`,
    });
  });
});
