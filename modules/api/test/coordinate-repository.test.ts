import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { createCoordinateRepository } from "../src/coordinate-repository.js";

type TableInfoRow = {
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

const tempRoot = join(process.cwd(), ".tmp", "modules-api-coordinates");

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

const createCoordinateInput = {
  project_path: "/repo/main",
  name: "API Fit",
  goal: "Keep the public API aligned with manager workflow needs.",
  evaluation_method: "Review OpenAPI and route behavior against Manager usage.",
};

const createEvaluationInput = {
  project_path: "/repo/main",
  commit_sha: "abc1234",
  evaluator_model: "anthropic/claude-sonnet-4-5",
  score: 81,
  evaluation: "优秀：API shape is clear and covered.",
};

afterEach(async () => {
  delete process.env.AIM_PROJECT_ROOT;
  await rm(tempRoot, { force: true, recursive: true });
});

describe("coordinate repository", () => {
  it("creates aim.sqlite and coordinate tables with cascading evaluation storage", async () => {
    const projectRoot = await createProjectRoot("creates-tables");
    const databasePath = join(projectRoot, "aim.sqlite");

    await expect(access(databasePath)).rejects.toThrow();

    const repository = createCoordinateRepository({ projectRoot });

    await repository.listCoordinates("/repo/main");

    await expect(access(databasePath)).resolves.toBeUndefined();

    const database = new DatabaseSync(databasePath);
    const coordinateColumns = database
      .prepare("PRAGMA table_info(coordinates)")
      .all() as TableInfoRow[];
    const evaluationColumns = database
      .prepare("PRAGMA table_info(coordinate_evaluations)")
      .all() as TableInfoRow[];
    database.close();

    expect(coordinateColumns.map((column) => column.name)).toEqual([
      "id",
      "project_path",
      "name",
      "goal",
      "evaluation_method",
      "created_at",
      "updated_at",
    ]);
    expect(evaluationColumns.map((column) => column.name)).toEqual([
      "id",
      "coordinate_id",
      "project_path",
      "commit_sha",
      "evaluator_model",
      "score",
      "evaluation",
      "created_at",
    ]);
  });

  it("creates, reads, lists, patches, and deletes coordinates", async () => {
    const projectRoot = await createProjectRoot("crud");
    const repository = createCoordinateRepository({ projectRoot });

    const firstCoordinate = await repository.createCoordinate(
      createCoordinateInput,
    );
    const secondCoordinate = await repository.createCoordinate({
      ...createCoordinateInput,
      name: "Task Throughput",
    });
    await repository.createCoordinate({
      ...createCoordinateInput,
      project_path: "/repo/other",
    });

    expect(firstCoordinate).toMatchObject(createCoordinateInput);
    expect(firstCoordinate.id).toEqual(expect.any(String));
    await expect(repository.getCoordinate(firstCoordinate.id)).resolves.toEqual(
      firstCoordinate,
    );
    await expect(repository.listCoordinates("/repo/main")).resolves.toEqual([
      firstCoordinate,
      secondCoordinate,
    ]);

    const patchedCoordinate = await repository.patchCoordinate(
      firstCoordinate.id,
      {
        goal: "Keep API, storage, and contract behavior aligned.",
      },
    );

    expect(patchedCoordinate).toMatchObject({
      id: firstCoordinate.id,
      goal: "Keep API, storage, and contract behavior aligned.",
    });
    expect(patchedCoordinate?.updated_at).not.toBe(firstCoordinate.updated_at);

    await expect(repository.deleteCoordinate(firstCoordinate.id)).resolves.toBe(
      true,
    );
    await expect(
      repository.getCoordinate(firstCoordinate.id),
    ).resolves.toBeNull();
  });

  it("appends evaluations and cascades them when deleting coordinates", async () => {
    const projectRoot = await createProjectRoot("evaluations");
    const repository = createCoordinateRepository({ projectRoot });
    const coordinate = await repository.createCoordinate(createCoordinateInput);

    const firstEvaluation = await repository.createCoordinateEvaluation(
      coordinate.id,
      createEvaluationInput,
    );
    const secondEvaluation = await repository.createCoordinateEvaluation(
      coordinate.id,
      {
        ...createEvaluationInput,
        commit_sha: "abc1235",
        score: 96,
        evaluation: "近似完成：no known blocking gaps.",
      },
    );

    expect(firstEvaluation).toMatchObject({
      ...createEvaluationInput,
      coordinate_id: coordinate.id,
    });
    expect(firstEvaluation.id).toEqual(expect.any(String));
    await expect(
      repository.listCoordinateEvaluations(coordinate.id),
    ).resolves.toEqual([firstEvaluation, secondEvaluation]);

    await repository.deleteCoordinate(coordinate.id);

    await expect(
      repository.listCoordinateEvaluations(coordinate.id),
    ).resolves.toEqual([]);
  });

  it("rejects evaluations for missing coordinates", async () => {
    const projectRoot = await createProjectRoot("missing-coordinate");
    const repository = createCoordinateRepository({ projectRoot });

    await expect(
      repository.createCoordinateEvaluation(
        "missing-coordinate",
        createEvaluationInput,
      ),
    ).resolves.toBeNull();
  });
});
