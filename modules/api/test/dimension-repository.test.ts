import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { createDimensionRepository } from "../src/dimension-repository.js";

type TableInfoRow = {
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

const tempRoot = join(process.cwd(), ".tmp", "modules-api-dimensions");

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

const createDimensionInput = {
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

describe("dimension repository", () => {
  it("creates aim.sqlite and dimension tables with cascading evaluation storage", async () => {
    const projectRoot = await createProjectRoot("creates-tables");
    const databasePath = join(projectRoot, "aim.sqlite");

    await expect(access(databasePath)).rejects.toThrow();

    const repository = createDimensionRepository({ projectRoot });

    await repository.listDimensions("/repo/main");

    await expect(access(databasePath)).resolves.toBeUndefined();

    const database = new DatabaseSync(databasePath);
    const dimensionColumns = database
      .prepare("PRAGMA table_info(dimensions)")
      .all() as TableInfoRow[];
    const evaluationColumns = database
      .prepare("PRAGMA table_info(dimension_evaluations)")
      .all() as TableInfoRow[];
    database.close();

    expect(dimensionColumns.map((column) => column.name)).toEqual([
      "id",
      "project_id",
      "name",
      "goal",
      "evaluation_method",
      "created_at",
      "updated_at",
    ]);
    expect(evaluationColumns.map((column) => column.name)).toEqual([
      "id",
      "dimension_id",
      "project_id",
      "commit_sha",
      "evaluator_model",
      "score",
      "evaluation",
      "created_at",
    ]);
  });

  it("closes its database when an await using scope exits", async () => {
    const projectRoot = await createProjectRoot("await-using-closes-db");
    let repository: ReturnType<typeof createDimensionRepository> | undefined;

    await (async () => {
      await using scopedRepository = createDimensionRepository({ projectRoot });

      repository = scopedRepository;
      await scopedRepository.listDimensions("/repo/main");
    })();

    await expect(async () => {
      await repository?.listDimensions("/repo/main");
    }).rejects.toThrow(/closed|finalized|open/i);
  });

  it("creates, reads, lists, patches, and deletes dimensions", async () => {
    const projectRoot = await createProjectRoot("crud");
    const repository = createDimensionRepository({ projectRoot });

    const firstDimension =
      await repository.createDimension(createDimensionInput);
    const secondDimension = await repository.createDimension({
      ...createDimensionInput,
      name: "Task Throughput",
    });
    await repository.createDimension({
      ...createDimensionInput,
      project_path: "/repo/other",
    });

    expect(firstDimension).toMatchObject(createDimensionInput);
    expect(firstDimension.id).toEqual(expect.any(String));
    await expect(repository.getDimension(firstDimension.id)).resolves.toEqual(
      firstDimension,
    );
    await expect(repository.listDimensions("/repo/main")).resolves.toEqual([
      firstDimension,
      secondDimension,
    ]);

    const patchedDimension = await repository.patchDimension(
      firstDimension.id,
      {
        goal: "Keep API, storage, and contract behavior aligned.",
      },
    );

    expect(patchedDimension).toMatchObject({
      id: firstDimension.id,
      goal: "Keep API, storage, and contract behavior aligned.",
    });
    expect(patchedDimension?.updated_at).not.toBe(firstDimension.updated_at);

    await expect(repository.deleteDimension(firstDimension.id)).resolves.toBe(
      true,
    );
    await expect(
      repository.getDimension(firstDimension.id),
    ).resolves.toBeNull();
  });

  it("appends evaluations and cascades them when deleting dimensions", async () => {
    const projectRoot = await createProjectRoot("evaluations");
    const repository = createDimensionRepository({ projectRoot });
    const dimension = await repository.createDimension(createDimensionInput);

    const firstEvaluation = await repository.createDimensionEvaluation(
      dimension.id,
      createEvaluationInput,
    );
    const secondEvaluation = await repository.createDimensionEvaluation(
      dimension.id,
      {
        ...createEvaluationInput,
        commit_sha: "abc1235",
        score: 96,
        evaluation: "近似完成：no known blocking gaps.",
      },
    );

    expect(firstEvaluation).toMatchObject({
      ...createEvaluationInput,
      dimension_id: dimension.id,
    });
    expect(firstEvaluation.id).toEqual(expect.any(String));
    await expect(
      repository.listDimensionEvaluations(dimension.id),
    ).resolves.toEqual([firstEvaluation, secondEvaluation]);

    await repository.deleteDimension(dimension.id);

    await expect(
      repository.listDimensionEvaluations(dimension.id),
    ).resolves.toEqual([]);
  });

  it("rejects evaluations for missing dimensions", async () => {
    const projectRoot = await createProjectRoot("missing-dimension");
    const repository = createDimensionRepository({ projectRoot });

    await expect(
      repository.createDimensionEvaluation(
        "missing-dimension",
        createEvaluationInput,
      ),
    ).resolves.toBeNull();
  });
});
