import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-dimensions-routes",
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
const mainProjectId = "00000000-0000-4000-8000-000000000001";

const createProject = async (app: ReturnType<typeof createApp>) => {
  const response = await app.request("/projects", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      git_origin_url: "https://github.com/example/main.git",
      global_model_id: "claude-sonnet-4-5",
      global_provider_id: "anthropic",
      name: "Main project",
    }),
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<{ id: string }>;
};

const createDimension = (
  app: ReturnType<typeof createApp>,
  projectId = mainProjectId,
  name = "API Fit",
) =>
  app.request("/dimensions", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      project_id: projectId,
      name,
      goal: "Keep the public API aligned with manager workflow needs.",
      evaluation_method:
        "Review OpenAPI and route behavior against Manager usage.",
    }),
  });

afterEach(async () => {
  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  previousProjectRoot = undefined;

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("dimension routes", () => {
  it("creates, lists, reads, patches, and physically deletes dimensions", async () => {
    await useProjectRoot("crud");

    const app = createApp();
    const project = await createProject(app);
    const createResponse = await createDimension(app, project.id);

    expect(createResponse.status).toBe(201);

    const createdDimension = await createResponse.json();

    expect(createdDimension).toMatchObject({
      project_id: project.id,
      name: "API Fit",
      goal: "Keep the public API aligned with manager workflow needs.",
      evaluation_method:
        "Review OpenAPI and route behavior against Manager usage.",
    });
    expect(createdDimension.id).toEqual(expect.any(String));

    const listResponse = await app.request(
      `/dimensions?project_id=${encodeURIComponent(project.id)}`,
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [createdDimension],
    });

    const getResponse = await app.request(`/dimensions/${createdDimension.id}`);

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual(createdDimension);

    const patchResponse = await app.request(
      `/dimensions/${createdDimension.id}`,
      {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({
          goal: "Keep API, storage, and contract behavior aligned.",
        }),
      },
    );

    expect(patchResponse.status).toBe(200);

    const patchedDimension = await patchResponse.json();

    expect(patchedDimension).toMatchObject({
      id: createdDimension.id,
      goal: "Keep API, storage, and contract behavior aligned.",
    });
    expect(patchedDimension.updated_at).not.toBe(createdDimension.updated_at);

    const deleteResponse = await app.request(
      `/dimensions/${createdDimension.id}`,
      {
        method: "DELETE",
      },
    );

    expect(deleteResponse.status).toBe(204);
    expect(
      await app.request(`/dimensions/${createdDimension.id}`),
    ).toHaveProperty("status", 404);
  });

  it("appends evaluations, lists them by sequence, and rejects invalid scores", async () => {
    await useProjectRoot("evaluations");

    const app = createApp();
    const project = await createProject(app);
    const createdDimension = await (
      await createDimension(app, project.id)
    ).json();

    const firstEvaluationResponse = await app.request(
      `/dimensions/${createdDimension.id}/evaluations`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: project.id,
          commit_sha: "abc1234",
          evaluator_model: "anthropic/claude-sonnet-4-5",
          score: 81,
          evaluation: "优秀：API shape is clear and covered.",
        }),
      },
    );

    expect(firstEvaluationResponse.status).toBe(201);

    const firstEvaluation = await firstEvaluationResponse.json();

    expect(firstEvaluation).toMatchObject({
      dimension_id: createdDimension.id,
      project_id: project.id,
      commit_sha: "abc1234",
      evaluator_model: "anthropic/claude-sonnet-4-5",
      score: 81,
      evaluation: "优秀：API shape is clear and covered.",
    });
    expect(firstEvaluation.id).toEqual(expect.any(String));

    const invalidScoreResponse = await app.request(
      `/dimensions/${createdDimension.id}/evaluations`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: project.id,
          commit_sha: "abc1235",
          evaluator_model: "anthropic/claude-sonnet-4-5",
          score: 101,
          evaluation: "Out of range.",
        }),
      },
    );

    expect(invalidScoreResponse.status).toBe(400);

    const listResponse = await app.request(
      `/dimensions/${createdDimension.id}/evaluations`,
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [firstEvaluation],
    });
  });

  it("returns an actionable validation error for duplicate baseline dimension evaluations", async () => {
    await useProjectRoot("duplicate-evaluation");

    const app = createApp();
    const project = await createProject(app);
    const createdDimension = await (
      await createDimension(app, project.id)
    ).json();
    const evaluationPayload = {
      project_id: project.id,
      commit_sha: "abc1234",
      evaluator_model: "anthropic/claude-sonnet-4-5",
      score: 81,
      evaluation: "优秀：API shape is clear and covered.",
    };

    const firstEvaluationResponse = await app.request(
      `/dimensions/${createdDimension.id}/evaluations`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(evaluationPayload),
      },
    );

    expect(firstEvaluationResponse.status).toBe(201);

    const duplicateEvaluationResponse = await app.request(
      `/dimensions/${createdDimension.id}/evaluations`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          ...evaluationPayload,
          score: 99,
          evaluation: "Duplicate write for the same baseline.",
        }),
      },
    );

    expect(duplicateEvaluationResponse.status).toBe(400);
    const duplicateError = await duplicateEvaluationResponse.json();
    const expectedDuplicateError = {
      code: "DIMENSION_VALIDATION_ERROR",
      message: `Dimension evaluation already exists for dimension_id ${createdDimension.id}, project_id ${project.id}, and commit_sha abc1234. Read the existing dimension evaluations for this dimension or wait for the next baseline before writing another evaluation.`,
    };

    expect(duplicateError).toEqual(expectedDuplicateError);
    expect(duplicateError.message).not.toMatch(
      /sqlite|unique|constraint|stack/i,
    );

    const repeatedDuplicateError = await (
      await app.request(`/dimensions/${createdDimension.id}/evaluations`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(evaluationPayload),
      })
    ).json();

    expect(repeatedDuplicateError).toEqual(expectedDuplicateError);
  });

  it("keeps project mismatch evaluation errors as validation errors", async () => {
    await useProjectRoot("evaluation-project-mismatch");

    const app = createApp();
    const project = await createProject(app);
    const createdDimension = await (
      await createDimension(app, project.id)
    ).json();

    const mismatchResponse = await app.request(
      `/dimensions/${createdDimension.id}/evaluations`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_id: "00000000-0000-4000-8000-000000000002",
          commit_sha: "abc1234",
          evaluator_model: "anthropic/claude-sonnet-4-5",
          score: 81,
          evaluation: "Project mismatch.",
        }),
      },
    );

    expect(mismatchResponse.status).toBe(400);
    await expect(mismatchResponse.json()).resolves.toEqual({
      code: "DIMENSION_VALIDATION_ERROR",
      message: "dimension evaluation project_id must match dimension",
    });
  });

  it("cascades evaluation deletion when a dimension is deleted", async () => {
    await useProjectRoot("cascade");

    const app = createApp();
    const project = await createProject(app);
    const createdDimension = await (
      await createDimension(app, project.id)
    ).json();

    await app.request(`/dimensions/${createdDimension.id}/evaluations`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        project_id: project.id,
        commit_sha: "abc1234",
        evaluator_model: "anthropic/claude-sonnet-4-5",
        score: 61,
        evaluation: "稳定：covered enough to use.",
      }),
    });

    expect(
      await app.request(`/dimensions/${createdDimension.id}`, {
        method: "DELETE",
      }),
    ).toHaveProperty("status", 204);

    expect(
      await app.request(`/dimensions/${createdDimension.id}/evaluations`),
    ).toHaveProperty("status", 404);
  });
});
