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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mainProjectId = "00000000-0000-4000-8000-000000000001";
const otherProjectId = "00000000-0000-4000-8000-000000000002";

const createDimensionInput = {
  project_id: mainProjectId,
  name: "API Fit",
  goal: "Keep the public API aligned with manager workflow needs.",
  evaluation_method: "Review OpenAPI and route behavior against Manager usage.",
};

const createEvaluationInput = {
  project_id: mainProjectId,
  commit_sha: "abc1234",
  evaluator_model: "anthropic/claude-sonnet-4-5",
  score: 81,
  evaluation: "优秀：API shape is clear and covered.",
};

const insertProject = (projectRoot: string, projectId = mainProjectId) => {
  const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

  database
    .prepare(
      "INSERT INTO projects (id, name, git_origin_url, global_provider_id, global_model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      projectId,
      `Project ${projectId}`,
      `https://github.com/example/${projectId}.git`,
      "anthropic",
      "claude-sonnet-4-5",
      "2026-04-26T00:00:00.000Z",
      "2026-04-26T00:00:00.000Z",
    );
  database.close();
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

    await repository.listDimensions(mainProjectId);

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
      await scopedRepository.listDimensions(mainProjectId);
    })();

    await expect(async () => {
      await repository?.listDimensions(mainProjectId);
    }).rejects.toThrow(/closed|finalized|open/i);
  });

  it("creates, reads, lists, patches, and deletes dimensions", async () => {
    const projectRoot = await createProjectRoot("crud");
    const repository = createDimensionRepository({ projectRoot });
    insertProject(projectRoot, mainProjectId);
    insertProject(projectRoot, otherProjectId);

    const firstDimension =
      await repository.createDimension(createDimensionInput);
    const secondDimension = await repository.createDimension({
      ...createDimensionInput,
      name: "Task Throughput",
    });
    await repository.createDimension({
      ...createDimensionInput,
      project_id: otherProjectId,
    });

    expect(firstDimension).toMatchObject(createDimensionInput);
    expect(firstDimension.id).toEqual(expect.any(String));
    await expect(repository.getDimension(firstDimension.id)).resolves.toEqual(
      firstDimension,
    );
    await expect(repository.listDimensions(mainProjectId)).resolves.toEqual([
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

  it("returns contract datetimes with timezone offsets for legacy SQLite dimension timestamps", async () => {
    const projectRoot = await createProjectRoot("legacy-sqlite-datetimes");
    const repository = createDimensionRepository({ projectRoot });
    insertProject(projectRoot, mainProjectId);
    const dimension = await repository.createDimension(createDimensionInput);
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database
      .prepare("UPDATE dimensions SET updated_at = ? WHERE id = ?")
      .run("2026-04-27 09:30:00", dimension.id);
    database.close();

    await expect(repository.listDimensions(mainProjectId)).resolves.toEqual([
      expect.objectContaining({
        id: dimension.id,
        updated_at: "2026-04-27T09:30:00.000Z",
      }),
    ]);
  });

  it("creates dimensions under a UUID project id", async () => {
    const projectRoot = await createProjectRoot(
      "creates-dimension-project-uuid",
    );
    const repository = createDimensionRepository({ projectRoot });
    insertProject(projectRoot, mainProjectId);

    const dimension = await repository.createDimension({
      ...createDimensionInput,
    });

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const persisted = database
      .prepare(
        "SELECT projects.id AS project_id, projects.git_origin_url AS git_origin_url, dimensions.project_id AS dimension_project_id FROM dimensions INNER JOIN projects ON projects.id = dimensions.project_id WHERE dimensions.id = ?",
      )
      .get(dimension.id) as
      | {
          dimension_project_id: string;
          project_id: string;
          git_origin_url: string;
        }
      | undefined;
    database.close();

    expect(persisted?.project_id).toMatch(uuidPattern);
    expect(persisted?.project_id).toBe(mainProjectId);
    expect(persisted).toMatchObject({
      dimension_project_id: persisted?.project_id,
      git_origin_url: `https://github.com/example/${mainProjectId}.git`,
    });
  });

  it("appends evaluations and cascades them when deleting dimensions", async () => {
    const projectRoot = await createProjectRoot("evaluations");
    const repository = createDimensionRepository({ projectRoot });
    insertProject(projectRoot, mainProjectId);
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

  it("lists only dimensions without an evaluation for the requested baseline commit", async () => {
    const projectRoot = await createProjectRoot("unevaluated-dimensions");
    const repository = createDimensionRepository({ projectRoot });
    insertProject(projectRoot, mainProjectId);
    const evaluatedDimension =
      await repository.createDimension(createDimensionInput);
    const unevaluatedDimension = await repository.createDimension({
      ...createDimensionInput,
      name: "Task Throughput",
    });

    await repository.createDimensionEvaluation(evaluatedDimension.id, {
      ...createEvaluationInput,
      commit_sha: "abc1234",
    });
    await repository.createDimensionEvaluation(unevaluatedDimension.id, {
      ...createEvaluationInput,
      commit_sha: "older-baseline",
    });

    await expect(
      repository.listUnevaluatedDimensionIds(mainProjectId, "abc1234"),
    ).resolves.toEqual([unevaluatedDimension.id]);
  });

  it("rejects duplicate evaluations for the same project, baseline commit, and dimension", async () => {
    const projectRoot = await createProjectRoot("duplicate-evaluation");
    const repository = createDimensionRepository({ projectRoot });
    insertProject(projectRoot, mainProjectId);
    const dimension = await repository.createDimension(createDimensionInput);

    await repository.createDimensionEvaluation(
      dimension.id,
      createEvaluationInput,
    );

    await expect(
      repository.createDimensionEvaluation(dimension.id, {
        ...createEvaluationInput,
        score: 99,
        evaluation: "Duplicate for same dimension and commit.",
      }),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });

  it("deletes conflicting duplicate evaluations when applying the uniqueness migration", async () => {
    const projectRoot = await createProjectRoot("dedupe-migration");
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        git_origin_url TEXT NOT NULL UNIQUE,
        global_provider_id TEXT NOT NULL,
        global_model_id TEXT NOT NULL,
        optimizer_enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE dimensions (
        id TEXT NOT NULL PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        evaluation_method TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE dimension_evaluations (
        id TEXT NOT NULL PRIMARY KEY,
        dimension_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        evaluator_model TEXT NOT NULL,
        score INTEGER NOT NULL,
        evaluation TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    database
      .prepare(
        "INSERT INTO projects (id, name, git_origin_url, global_provider_id, global_model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        mainProjectId,
        "Main project",
        "https://github.com/example/main.git",
        "anthropic",
        "claude-sonnet-4-5",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );
    database
      .prepare(
        "INSERT INTO dimensions (id, project_id, name, goal, evaluation_method, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "dimension-1",
        mainProjectId,
        "API Fit",
        "Keep API aligned.",
        "Review API behavior.",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );
    for (const id of ["evaluation-1", "evaluation-2"]) {
      database
        .prepare(
          "INSERT INTO dimension_evaluations (id, dimension_id, project_id, commit_sha, evaluator_model, score, evaluation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          "dimension-1",
          mainProjectId,
          "abc1234",
          "anthropic/claude-sonnet-4-5",
          81,
          id,
          `2026-04-26T00:00:0${id.endsWith("1") ? "1" : "2"}.000Z`,
        );
    }
    database.close();

    const repository = createDimensionRepository({ projectRoot });
    const migratedDatabase = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const evaluations = migratedDatabase
      .prepare(
        "SELECT id FROM dimension_evaluations WHERE project_id = ? AND commit_sha = ? AND dimension_id = ? ORDER BY id ASC",
      )
      .all(mainProjectId, "abc1234", "dimension-1");
    const uniqueIndexes = migratedDatabase
      .prepare("PRAGMA index_list(dimension_evaluations)")
      .all()
      .filter(
        (row) =>
          (row as { name: string; unique: 0 | 1 }).name ===
            "dimension_evaluations_project_commit_dimension_unique" &&
          (row as { name: string; unique: 0 | 1 }).unique === 1,
      );
    migratedDatabase.close();
    await repository[Symbol.asyncDispose]();

    expect(evaluations).toEqual([{ id: "evaluation-1" }]);
    expect(uniqueIndexes).toHaveLength(1);
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
