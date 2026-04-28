import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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
      blocker_summary: "Optimizer disabled for project",
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
      blocker_summary: "Optimizer runtime inactive",
    });
  });

  it("reports enabled project config with optimizer system presence as active", async () => {
    await useProjectRoot("enabled-active-project");

    const app = createApp({
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
      blocker_summary: null,
    });
  });

  it("reports optimizer lane status for an enabled active project", async () => {
    await useProjectRoot("enabled-active-project-with-lane-signals");

    const blockerSummary =
      "Manager lane active; recent scan at 2026-04-29T10:15:30.000Z";
    const app = createApp({
      optimizerSystem: {
        [Symbol.asyncDispose]: async () => undefined,
        getProjectStatus: () => ({ blocker_summary: blockerSummary }),
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
    });
  });
});
