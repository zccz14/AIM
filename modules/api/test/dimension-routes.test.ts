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

const createDimension = (app: ReturnType<typeof createApp>, name = "API Fit") =>
  app.request("/dimensions", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      project_path: "/repo/main",
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
    const createResponse = await createDimension(app);

    expect(createResponse.status).toBe(201);

    const createdDimension = await createResponse.json();

    expect(createdDimension).toMatchObject({
      project_path: "/repo/main",
      name: "API Fit",
      goal: "Keep the public API aligned with manager workflow needs.",
      evaluation_method:
        "Review OpenAPI and route behavior against Manager usage.",
    });
    expect(createdDimension.id).toEqual(expect.any(String));

    const listResponse = await app.request(
      `/dimensions?project_path=${encodeURIComponent("/repo/main")}`,
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
    const createdDimension = await (await createDimension(app)).json();

    const firstEvaluationResponse = await app.request(
      `/dimensions/${createdDimension.id}/evaluations`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          project_path: "/repo/main",
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
      project_path: "/repo/main",
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
          project_path: "/repo/main",
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

  it("cascades evaluation deletion when a dimension is deleted", async () => {
    await useProjectRoot("cascade");

    const app = createApp();
    const createdDimension = await (await createDimension(app)).json();

    await app.request(`/dimensions/${createdDimension.id}/evaluations`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        project_path: "/repo/main",
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
