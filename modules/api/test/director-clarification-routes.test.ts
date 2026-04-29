import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-director-clarification-routes",
);

let previousProjectRoot: string | undefined;

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;
};

const jsonHeaders = { "content-type": "application/json" };

const createProject = async (
  app: ReturnType<typeof createApp>,
  name = "Main project",
) => {
  const response = await app.request("/projects", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      git_origin_url: `https://github.com/example/${name.toLowerCase().replaceAll(" ", "-")}.git`,
      global_model_id: "claude-sonnet-4-5",
      global_provider_id: "anthropic",
      name,
    }),
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<{ id: string }>;
};

const createDimension = async (
  app: ReturnType<typeof createApp>,
  projectId: string,
) => {
  const response = await app.request("/dimensions", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      project_id: projectId,
      name: "API Fit",
      goal: "Keep the public API aligned with manager workflow needs.",
      evaluation_method:
        "Review OpenAPI and route behavior against Manager usage.",
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

describe("director clarification routes", () => {
  it("creates and lists project-scoped Director clarifications", async () => {
    await useProjectRoot("project-scoped");

    const app = createApp();
    const project = await createProject(app);

    const createResponse = await app.request(
      `/projects/${project.id}/director/clarifications`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: project.id,
          kind: "clarification",
          message: "Please clarify the expected API affordance.",
        }),
      },
    );

    expect(createResponse.status).toBe(201);

    const createdClarification = await createResponse.json();

    expect(createdClarification).toMatchObject({
      project_id: project.id,
      dimension_id: null,
      kind: "clarification",
      message: "Please clarify the expected API affordance.",
      status: "open",
    });
    expect(createdClarification.id).toEqual(expect.any(String));

    const listResponse = await app.request(
      `/projects/${project.id}/director/clarifications`,
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [createdClarification],
    });
  });

  it("accepts optional dimension_id for dimension-targeted adjustments", async () => {
    await useProjectRoot("dimension-scoped");

    const app = createApp();
    const project = await createProject(app);
    const dimension = await createDimension(app, project.id);

    const createResponse = await app.request(
      `/projects/${project.id}/director/clarifications`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: project.id,
          dimension_id: dimension.id,
          kind: "adjustment",
          message: "Adjust the dimension goal toward GUI readiness.",
        }),
      },
    );

    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toMatchObject({
      project_id: project.id,
      dimension_id: dimension.id,
      kind: "adjustment",
      status: "open",
    });
  });

  it("patches clarification status and reflects updated_at in the project list", async () => {
    await useProjectRoot("patches-status");

    const app = createApp();
    const project = await createProject(app);

    const createResponse = await app.request(
      `/projects/${project.id}/director/clarifications`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: project.id,
          kind: "clarification",
          message: "Please settle this once the answer is captured.",
        }),
      },
    );

    expect(createResponse.status).toBe(201);
    const createdClarification = await createResponse.json();

    const patchResponse = await app.request(
      `/projects/${project.id}/director/clarifications/${createdClarification.id}`,
      {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ status: "addressed" }),
      },
    );

    expect(patchResponse.status).toBe(200);
    const patchedClarification = await patchResponse.json();

    expect(patchedClarification).toMatchObject({
      id: createdClarification.id,
      project_id: project.id,
      status: "addressed",
    });
    expect(patchedClarification.updated_at).not.toBe(
      createdClarification.updated_at,
    );

    const reopenResponse = await app.request(
      `/projects/${project.id}/director/clarifications/${createdClarification.id}`,
      {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ status: "open" }),
      },
    );

    expect(reopenResponse.status).toBe(200);
    const reopenedClarification = await reopenResponse.json();

    expect(reopenedClarification).toMatchObject({
      id: createdClarification.id,
      project_id: project.id,
      status: "open",
    });

    const listResponse = await app.request(
      `/projects/${project.id}/director/clarifications`,
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [reopenedClarification],
    });
  });

  it("validates status patches and project ownership", async () => {
    await useProjectRoot("patch-validation");

    const app = createApp();
    const project = await createProject(app, "Main project");
    const otherProject = await createProject(app, "Other project");

    const createResponse = await app.request(
      `/projects/${project.id}/director/clarifications`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: project.id,
          kind: "adjustment",
          message: "This request should only be settled from its project.",
        }),
      },
    );

    expect(createResponse.status).toBe(201);
    const createdClarification = await createResponse.json();

    const invalidStatusResponse = await app.request(
      `/projects/${project.id}/director/clarifications/${createdClarification.id}`,
      {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ status: "invalid" }),
      },
    );

    expect(invalidStatusResponse.status).toBe(400);
    await expect(invalidStatusResponse.json()).resolves.toMatchObject({
      code: "DIRECTOR_CLARIFICATION_VALIDATION_ERROR",
      message: "Invalid Director clarification status patch",
    });

    const wrongProjectResponse = await app.request(
      `/projects/${otherProject.id}/director/clarifications/${createdClarification.id}`,
      {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ status: "dismissed" }),
      },
    );

    expect(wrongProjectResponse.status).toBe(404);
    await expect(wrongProjectResponse.json()).resolves.toMatchObject({
      code: "DIRECTOR_CLARIFICATION_NOT_FOUND",
      message: `Director clarification ${createdClarification.id} was not found`,
    });
  });

  it("rejects project mismatches and dimensions from another project", async () => {
    await useProjectRoot("mismatch");

    const app = createApp();
    const project = await createProject(app, "Main project");
    const otherProject = await createProject(app, "Other project");
    const otherDimension = await createDimension(app, otherProject.id);

    const projectMismatchResponse = await app.request(
      `/projects/${project.id}/director/clarifications`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: otherProject.id,
          kind: "clarification",
          message: "This should not cross project boundaries.",
        }),
      },
    );

    expect(projectMismatchResponse.status).toBe(400);
    await expect(projectMismatchResponse.json()).resolves.toMatchObject({
      code: "DIRECTOR_CLARIFICATION_VALIDATION_ERROR",
      message: "project_id must match the project path parameter",
    });

    const dimensionMismatchResponse = await app.request(
      `/projects/${project.id}/director/clarifications`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: project.id,
          dimension_id: otherDimension.id,
          kind: "adjustment",
          message: "This dimension belongs to another project.",
        }),
      },
    );

    expect(dimensionMismatchResponse.status).toBe(400);
    await expect(dimensionMismatchResponse.json()).resolves.toMatchObject({
      code: "DIRECTOR_CLARIFICATION_VALIDATION_ERROR",
      message: "dimension_id must belong to the project",
    });
  });
});
