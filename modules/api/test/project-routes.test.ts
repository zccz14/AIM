import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-project-routes",
);
const projectsPath = "/projects";
const projectByIdPath = (projectId: string) => `/projects/${projectId}`;

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

const createRouteApp = () =>
  createApp({
    currentBaselineFactsProvider: vi.fn().mockResolvedValue({ commit: null }),
    openCodeModelsAdapter: createSupportedOpenCodeModelsAdapter(),
  });

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;
};

const createProject = async (app: ReturnType<typeof createApp>) => {
  const response = await app.request(projectsPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "project-detail",
      git_origin_url: "https://github.com/example/project-detail.git",
      global_provider_id: "anthropic",
      global_model_id: "claude-sonnet-4-5",
    }),
  });

  expect(response.status).toBe(201);

  return response.json();
};

afterEach(async () => {
  vi.unstubAllGlobals();

  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  previousProjectRoot = undefined;

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("project detail route", () => {
  it("returns the same project representation as the list endpoint", async () => {
    await useProjectRoot("reads-project-detail");
    const app = createRouteApp();
    const project = await createProject(app);

    const listResponse = await app.request(projectsPath);
    const detailResponse = await app.request(projectByIdPath(project.id));

    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toEqual(
      (await listResponse.json()).items[0],
    );
  });

  it("returns stable PROJECT_NOT_FOUND for a missing project", async () => {
    await useProjectRoot("missing-project-detail");
    const app = createRouteApp();
    const missingProjectId = "00000000-0000-4000-8000-000000000001";

    const response = await app.request(projectByIdPath(missingProjectId));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "PROJECT_NOT_FOUND",
      message: `Project ${missingProjectId} was not found`,
    });
  });
});
