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

let previousProjectRoot: string | undefined;

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;
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

afterEach(async () => {
  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  previousProjectRoot = undefined;

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("optimizer routes", () => {
  it("does not expose global optimizer runtime controls", async () => {
    const optimizerRuntime = {
      getStatus: vi.fn().mockReturnValue({
        enabled_triggers: ["task_resolved"],
        lanes: {
          coordinator_task_pool: {
            last_error: null,
            last_scan_at: null,
            running: false,
          },
          developer_follow_up: {
            last_error: null,
            last_scan_at: null,
            running: false,
          },
          manager_evaluation: {
            last_error: null,
            last_scan_at: null,
            running: false,
          },
        },
        last_event: null,
        last_scan_at: null,
        running: false,
      }),
      handleEvent: vi.fn(),
      start: vi.fn(),
      disable: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ optimizerRuntime });

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

    expect(optimizerRuntime.getStatus).not.toHaveBeenCalled();
    expect(optimizerRuntime.start).not.toHaveBeenCalled();
    expect(optimizerRuntime.disable).not.toHaveBeenCalled();
  });

  it("reports disabled project optimizer config separately from runtime activity", async () => {
    await useProjectRoot("disabled-project");

    const optimizerRuntime = {
      getStatus: vi.fn().mockReturnValue({
        enabled_triggers: ["task_resolved"],
        lanes: {
          coordinator_task_pool: {
            last_error: null,
            last_scan_at: null,
            running: true,
          },
          developer_follow_up: {
            last_error: null,
            last_scan_at: null,
            running: true,
          },
          manager_evaluation: {
            last_error: null,
            last_scan_at: null,
            running: true,
          },
        },
        last_event: null,
        last_scan_at: null,
        running: true,
      }),
      handleEvent: vi.fn(),
      start: vi.fn(),
      disable: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ optimizerRuntime });
    const project = await createProject(app, false);

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project_id: project.id,
      optimizer_enabled: false,
      runtime_active: false,
      enabled_triggers: [],
      recent_event: null,
      recent_scan_at: null,
      blocker_summary: "Optimizer disabled for project",
    });
  });

  it("reports enabled project config with inactive runtime as a blocker", async () => {
    await useProjectRoot("enabled-inactive-project");

    const optimizerRuntime = {
      getStatus: vi.fn().mockReturnValue({
        enabled_triggers: ["task_resolved"],
        lanes: {
          coordinator_task_pool: {
            last_error: null,
            last_scan_at: null,
            running: false,
          },
          developer_follow_up: {
            last_error: null,
            last_scan_at: null,
            running: false,
          },
          manager_evaluation: {
            last_error: null,
            last_scan_at: null,
            running: false,
          },
        },
        last_event: null,
        last_scan_at: null,
        running: false,
      }),
      handleEvent: vi.fn(),
      start: vi.fn(),
      disable: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ optimizerRuntime });
    const project = await createProject(app, true);

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project_id: project.id,
      optimizer_enabled: true,
      runtime_active: false,
      enabled_triggers: ["task_resolved"],
      recent_event: null,
      recent_scan_at: null,
      blocker_summary: "Optimizer runtime inactive",
    });
  });

  it("exposes recent optimizer event updates for an active project runtime", async () => {
    await useProjectRoot("enabled-active-project");

    const optimizerRuntime = {
      getStatus: vi.fn().mockReturnValue({
        enabled_triggers: ["task_resolved"],
        lanes: {
          coordinator_task_pool: {
            last_error: null,
            last_scan_at: null,
            running: true,
          },
          developer_follow_up: {
            last_error: null,
            last_scan_at: "2026-04-27T10:00:00.000Z",
            running: true,
          },
          manager_evaluation: {
            last_error: null,
            last_scan_at: null,
            running: true,
          },
        },
        last_event: {
          task_id: "task-1",
          triggered_scan: true,
          type: "task_resolved",
        },
        last_scan_at: "2026-04-27T10:00:00.000Z",
        running: true,
      }),
      handleEvent: vi.fn(),
      start: vi.fn(),
      disable: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ optimizerRuntime });
    const project = await createProject(app, true);

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project_id: project.id,
      optimizer_enabled: true,
      runtime_active: true,
      enabled_triggers: ["task_resolved"],
      recent_event: {
        task_id: "task-1",
        triggered_scan: true,
        type: "task_resolved",
      },
      recent_scan_at: "2026-04-27T10:00:00.000Z",
      blocker_summary: null,
    });
  });

  it("summarizes optimizer lane errors with redacted recovery context", async () => {
    await useProjectRoot("enabled-lane-error-project");

    const optimizerRuntime = {
      getStatus: vi.fn().mockReturnValue({
        enabled_triggers: ["task_resolved"],
        lanes: {
          coordinator_task_pool: {
            last_error: null,
            last_scan_at: null,
            running: true,
          },
          developer_follow_up: {
            last_error:
              "gh failed with token ghp_1234567890abcdefghijklmnopqrstuvwxyz and stack at internal.js:1",
            last_scan_at: "2026-04-27T10:00:00.000Z",
            running: true,
          },
          manager_evaluation: {
            last_error: null,
            last_scan_at: null,
            running: true,
          },
        },
        last_event: null,
        last_scan_at: "2026-04-27T10:00:00.000Z",
        running: true,
      }),
      handleEvent: vi.fn(),
      start: vi.fn(),
      disable: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ optimizerRuntime });
    const project = await createProject(app, true);

    const response = await app.request(
      `/projects/${project.id}/optimizer/status`,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.blocker_summary).toContain("developer_follow_up");
    expect(payload.blocker_summary).toContain("Check optimizer logs");
    expect(payload.blocker_summary).toContain("[REDACTED]");
    expect(payload.blocker_summary).not.toContain("ghp_1234567890");
    expect(payload.blocker_summary).not.toContain("internal.js:1");
  });
});
