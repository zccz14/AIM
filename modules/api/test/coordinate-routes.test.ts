import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-coordinates-routes",
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

const createCoordinate = (
  app: ReturnType<typeof createApp>,
  name = "API Fit",
) =>
  app.request("/coordinates", {
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

describe("coordinate routes", () => {
  it("creates, lists, reads, patches, and physically deletes coordinates", async () => {
    await useProjectRoot("crud");

    const app = createApp();
    const createResponse = await createCoordinate(app);

    expect(createResponse.status).toBe(201);

    const createdCoordinate = await createResponse.json();

    expect(createdCoordinate).toMatchObject({
      project_path: "/repo/main",
      name: "API Fit",
      goal: "Keep the public API aligned with manager workflow needs.",
      evaluation_method:
        "Review OpenAPI and route behavior against Manager usage.",
    });
    expect(createdCoordinate.id).toEqual(expect.any(String));

    const listResponse = await app.request(
      `/coordinates?project_path=${encodeURIComponent("/repo/main")}`,
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [createdCoordinate],
    });

    const getResponse = await app.request(
      `/coordinates/${createdCoordinate.id}`,
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual(createdCoordinate);

    const patchResponse = await app.request(
      `/coordinates/${createdCoordinate.id}`,
      {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({
          goal: "Keep API, storage, and contract behavior aligned.",
        }),
      },
    );

    expect(patchResponse.status).toBe(200);

    const patchedCoordinate = await patchResponse.json();

    expect(patchedCoordinate).toMatchObject({
      id: createdCoordinate.id,
      goal: "Keep API, storage, and contract behavior aligned.",
    });
    expect(patchedCoordinate.updated_at).not.toBe(createdCoordinate.updated_at);

    const deleteResponse = await app.request(
      `/coordinates/${createdCoordinate.id}`,
      {
        method: "DELETE",
      },
    );

    expect(deleteResponse.status).toBe(204);
    expect(
      await app.request(`/coordinates/${createdCoordinate.id}`),
    ).toHaveProperty("status", 404);
  });

  it("appends evaluations, lists them by sequence, and rejects invalid scores", async () => {
    await useProjectRoot("evaluations");

    const app = createApp();
    const createdCoordinate = await (await createCoordinate(app)).json();

    const firstEvaluationResponse = await app.request(
      `/coordinates/${createdCoordinate.id}/evaluations`,
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
      coordinate_id: createdCoordinate.id,
      project_path: "/repo/main",
      commit_sha: "abc1234",
      evaluator_model: "anthropic/claude-sonnet-4-5",
      score: 81,
      evaluation: "优秀：API shape is clear and covered.",
    });
    expect(firstEvaluation.id).toEqual(expect.any(String));

    const invalidScoreResponse = await app.request(
      `/coordinates/${createdCoordinate.id}/evaluations`,
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
      `/coordinates/${createdCoordinate.id}/evaluations`,
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [firstEvaluation],
    });
  });

  it("cascades evaluation deletion when a coordinate is deleted", async () => {
    await useProjectRoot("cascade");

    const app = createApp();
    const createdCoordinate = await (await createCoordinate(app)).json();

    await app.request(`/coordinates/${createdCoordinate.id}/evaluations`, {
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
      await app.request(`/coordinates/${createdCoordinate.id}`, {
        method: "DELETE",
      }),
    ).toHaveProperty("status", 204);

    expect(
      await app.request(`/coordinates/${createdCoordinate.id}/evaluations`),
    ).toHaveProperty("status", 404);
  });
});
