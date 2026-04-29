import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

import { afterEach, describe, expect, it, vi } from "vitest";
import * as contractModule from "../../contract/src/index.js";
import * as apiModule from "../src/app.js";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

const sensitiveGhFailureMessage =
  "gh failed with token ghp_1234567890abcdefghijklmnopqrstuvwxyz and stack at internal.js:1";
const ghFailedChecksPullRequestOutput = JSON.stringify({
  autoMergeRequest: null,
  mergeable: "MERGEABLE",
  mergedAt: null,
  reviewDecision: "",
  state: "OPEN",
  statusCheckRollup: [
    {
      conclusion: "FAILURE",
      name: "test:api",
      status: "COMPLETED",
      workflowName: "CI",
    },
  ],
});
const ghReviewBlockedPullRequestOutput = JSON.stringify({
  autoMergeRequest: { enabledAt: "2026-04-26T10:00:00Z" },
  mergeable: "MERGEABLE",
  mergedAt: null,
  reviewDecision: "CHANGES_REQUESTED",
  state: "OPEN",
  statusCheckRollup: [],
});
const ghMergedFollowupPullRequestOutput = JSON.stringify({
  autoMergeRequest: null,
  mergeable: "MERGEABLE",
  mergedAt: "2026-04-26T10:00:00Z",
  reviewDecision: "APPROVED",
  state: "MERGED",
  statusCheckRollup: [],
});

const mockGhPullRequestOutput = (stdout: string) => {
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string) => void,
    ) => {
      callback(null, stdout);
    },
  );
};

const mockGhFailure = () => {
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error) => void,
    ) => {
      callback(new Error(sensitiveGhFailureMessage));
    },
  );
};

const taskRouteSourceUrl = new URL("../src/routes/tasks.ts", import.meta.url);
const appSourceUrl = new URL("../src/app.ts", import.meta.url);
const routesTempRoot = join(process.cwd(), ".tmp", "modules-api-task-routes");

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mainProjectId = "00000000-0000-4000-8000-000000000001";
const currentBaselineCommit = "fc284b9aa5ff780228c625011d4714f9e6771622";
const staleBaselineCommit = "45eeecbf2a0c2d33dd9dd4896fc8dd6d6b9ded13";
const buildPassingCoordinatorSourceMetadata = (
  dimensionId = "33333333-3333-4333-8333-333333333333",
  dimensionEvaluationId = "44444444-4444-4444-8444-444444444444",
) => ({
  conflict_duplicate_assessment:
    "No duplicate unfinished Task covers this dimension evaluation.",
  current_task_pool_coverage:
    "Current Task Pool has no unfinished same-source coverage.",
  dependency_rationale:
    "No prerequisite Task must complete before this candidate can start.",
  dimension_evaluation_id: dimensionEvaluationId,
  dimension_id: dimensionId,
  latest_origin_main_commit: currentBaselineCommit,
  task_spec_validation: {
    conclusion: "pass",
    conclusion_summary: "Task Spec validation passed",
    dimension_evaluation_id: dimensionEvaluationId,
    validated_baseline_commit: currentBaselineCommit,
    validation_session_id: `validation-${dimensionEvaluationId}`,
    validation_source: "aim-verify-task-spec",
  },
  unfinished_task_non_conflict_rationale:
    "The candidate does not cover or conflict with existing unfinished Tasks.",
});

let previousProjectRoot: string | undefined;

const createLogger = () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
});

const resolveTaskByIdPath = (taskId: string) =>
  contractModule.taskByIdPath.replace("{taskId}", taskId);

const resolveTaskFieldPath = (taskId: string, field: string) =>
  `${resolveTaskByIdPath(taskId)}/${field}`;

const resolveTaskSpecPath = (taskId: string) =>
  contractModule.taskSpecPath.replace("{taskId}", taskId);

const resolveTaskPullRequestStatusPath = (taskId: string) =>
  "/tasks/{taskId}/pull_request_status".replace("{taskId}", taskId);

const insertProject = (projectRoot: string, projectId = mainProjectId) => {
  const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      git_origin_url TEXT NOT NULL UNIQUE,
      global_provider_id TEXT NOT NULL,
      global_model_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
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

const createTaskRouteApp = (
  options: Parameters<typeof apiModule.createApp>[0] = {},
) =>
  apiModule.createApp({
    currentBaselineFactsProvider: vi.fn().mockResolvedValue({
      commit: currentBaselineCommit,
    }),
    openCodeModelsAdapter: createSupportedOpenCodeModelsAdapter(),
    ...options,
  });

const useProjectRoot = async (
  name: string,
  options = { seedProject: true },
) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;

  if (options.seedProject) {
    insertProject(projectRoot);
  }

  return projectRoot;
};

const createProjectRoot = async (name: string) => {
  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

afterEach(async () => {
  execFileMock.mockReset();

  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  previousProjectRoot = undefined;

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("task routes", () => {
  it("supports project CRUD through API routes", async () => {
    await useProjectRoot("supports-project-crud-routes", {
      seedProject: false,
    });

    const app = createTaskRouteApp();
    const createResponse = await app.request("/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        global_model_id: "claude-sonnet-4-5",
        global_provider_id: "anthropic",
        name: "Main project",
        git_origin_url: "https://github.com/example/main.git",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdProject = await createResponse.json();

    expect(createdProject).toMatchObject({
      global_model_id: "claude-sonnet-4-5",
      global_provider_id: "anthropic",
      name: "Main project",
      git_origin_url: "https://github.com/example/main.git",
      optimizer_enabled: false,
    });
    expect(createdProject.id).toMatch(uuidPattern);
    expect(createdProject.id).not.toBe(createdProject.git_origin_url);

    const listResponse = await app.request("/projects");

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [createdProject],
    });

    const patchResponse = await app.request(`/projects/${createdProject.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        global_model_id: "gpt-5.5",
        global_provider_id: "openai",
        name: "Renamed project",
        optimizer_enabled: true,
      }),
    });

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      global_model_id: "gpt-5.5",
      global_provider_id: "openai",
      id: createdProject.id,
      name: "Renamed project",
      git_origin_url: "https://github.com/example/main.git",
      optimizer_enabled: true,
    });

    const deleteResponse = await app.request(`/projects/${createdProject.id}`, {
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(204);

    const emptyListResponse = await app.request("/projects");

    await expect(emptyListResponse.json()).resolves.toEqual({ items: [] });
  });

  it("rejects POST /tasks when project_id is missing", async () => {
    await useProjectRoot("rejects-missing-project-path");

    const app = createTaskRouteApp();
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        task_spec: "write sqlite-backed route tests",
      }),
    });

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
  });

  it("does not log success events for invalid create requests", async () => {
    await useProjectRoot("invalid-create-does-not-log");

    const logger = createLogger();
    const app = createTaskRouteApp({ logger });
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        task_spec: "write sqlite-backed route tests",
      }),
    });

    expect(response.status).toBe(400);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("rejects POST /tasks when required title or developer model fields are missing", async () => {
    await useProjectRoot("rejects-missing-developer-model-fields");

    const app = createTaskRouteApp();
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        task_spec: "write sqlite-backed route tests",
      }),
    });

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
  });

  it("persists required title and developer model fields when creating a task", async () => {
    await useProjectRoot("persists-developer-model-fields");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        task_spec: "write sqlite-backed route tests",
        title: "SQLite route tests",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();

    expect(createdTask).toMatchObject({
      title: "SQLite route tests",
    });
  });

  it("creates tasks from project_id using the project's global provider and model", async () => {
    const projectRoot = await useProjectRoot("creates-task-from-project-id", {
      seedProject: false,
    });
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        git_origin_url TEXT NOT NULL UNIQUE,
        global_provider_id TEXT NOT NULL,
        global_model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    database
      .prepare(
        `INSERT INTO projects (
          id,
          name,
          git_origin_url,
          global_provider_id,
          global_model_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
    database.close();

    const app = createTaskRouteApp();
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        task_spec: "write sqlite-backed route tests",
        title: "SQLite route tests",
      }),
    });

    expect(response.status).toBe(201);

    const createdTask = await response.json();

    expect(createdTask).toMatchObject({
      project_id: mainProjectId,
      git_origin_url: "https://github.com/example/main.git",
      title: "SQLite route tests",
    });
  });

  it("rejects POST /tasks when the project provider and model combination is unavailable", async () => {
    await useProjectRoot("rejects-unavailable-developer-model-combo", {
      seedProject: false,
    });

    const app = createTaskRouteApp({
      openCodeModelsAdapter: {
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
      },
    });
    const projectResponse = await app.request(contractModule.projectsPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        git_origin_url: "https://github.com/example/unsupported.git",
        global_model_id: "gpt-5",
        global_provider_id: "openai",
        name: "Unsupported project",
      }),
    });
    const project = await projectResponse.json();
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: project.id,
        task_spec: "write sqlite-backed route tests",
        title: "SQLite route tests",
      }),
    });

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    expect(payload.message).toContain("global_provider_id");
    expect(payload.message).toContain("global_model_id");
    expect(payload.message).toContain("/opencode/models");
  });

  it("persists a created task and reads the same record through both GET routes", async () => {
    await useProjectRoot("persists-create-and-read");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "write sqlite-backed route tests",
        project_id: mainProjectId,
        session_id: "session-1",
        dependencies: ["task-0"],
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();

    expect(contractModule.taskSchema.safeParse(createdTask).success).toBe(true);
    expect(createdTask.task_spec).toBe("write sqlite-backed route tests");
    expect(createdTask.project_id).toBe(mainProjectId);
    expect(createdTask.session_id).toBe("session-1");
    expect(createdTask.dependencies).toEqual(["task-0"]);
    expect(createdTask.done).toBe(false);

    const listResponse = await app.request(contractModule.tasksPath);

    expect(listResponse.status).toBe(200);

    const listPayload = await listResponse.json();

    expect(
      contractModule.taskListResponseSchema.safeParse(listPayload).success,
    ).toBe(true);
    expect(listPayload.items).toHaveLength(1);
    expect(listPayload.items[0]).toEqual(createdTask);

    const detailResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
    );

    expect(detailResponse.status).toBe(200);

    const detailPayload = await detailResponse.json();

    expect(contractModule.taskSchema.safeParse(detailPayload).success).toBe(
      true,
    );
    expect(detailPayload).toEqual(createdTask);
  });

  it("surfaces associated OpenCode session promise state on task get and list responses", async () => {
    await useProjectRoot("surfaces-task-opencode-session-state");

    const app = createTaskRouteApp();
    const sessionResponse = await app.request(
      contractModule.openCodeSessionsPath,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: "session-observed",
          continue_prompt: "Continue observed task.",
        }),
      },
    );

    expect(sessionResponse.status).toBe(201);

    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Observed task",
        task_spec: "surface opencode session state",
        project_id: mainProjectId,
        session_id: "session-observed",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const detailResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
    );

    expect(detailResponse.status).toBe(200);

    const detailPayload = await detailResponse.json();

    expect(contractModule.taskSchema.safeParse(detailPayload).success).toBe(
      true,
    );
    expect(detailPayload).toMatchObject({
      task_id: createdTask.task_id,
      session_id: "session-observed",
      opencode_session: {
        session_id: "session-observed",
        state: "pending",
        value: null,
        reason: null,
      },
    });

    const listResponse = await app.request(contractModule.tasksPath);

    expect(listResponse.status).toBe(200);

    const listPayload = await listResponse.json();

    expect(
      contractModule.taskListResponseSchema.safeParse(listPayload).success,
    ).toBe(true);
    expect(listPayload.items).toContainEqual(
      expect.objectContaining({
        task_id: createdTask.task_id,
        opencode_session: expect.objectContaining({
          session_id: "session-observed",
          state: "pending",
        }),
      }),
    );
  });

  it("reports current, stale, and unknown task source baseline freshness", async () => {
    const projectRoot = await useProjectRoot(
      "reports-task-source-baseline-freshness",
    );

    const app = createTaskRouteApp();
    const currentCommit = "fc284b9aa5ff780228c625011d4714f9e6771622";
    const staleCommit = "45eeecbf2a0c2d33dd9dd4896fc8dd6d6b9ded13";
    const dimensionResponse = await app.request(contractModule.dimensionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        name: "Baseline freshness",
        goal: "Expose task source baseline freshness.",
        evaluation_method: "Compare task source commits with current baseline.",
      }),
    });

    expect(dimensionResponse.status).toBe(201);

    const dimension = await dimensionResponse.json();
    const evaluationResponse = await app.request(
      contractModule.dimensionEvaluationsPath.replace(
        "{dimensionId}",
        dimension.id,
      ),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: mainProjectId,
          commit_sha: currentCommit,
          evaluator_model: "gpt-5.5",
          score: 80,
          evaluation: "Current independent origin/main evaluation.",
        }),
      },
    );

    expect(evaluationResponse.status).toBe(201);

    const batchResponse = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: "11111111-1111-4111-8111-111111111111",
              title: "Current source task",
              spec: "Task planned from current baseline.",
              source_metadata: {
                ...buildPassingCoordinatorSourceMetadata(),
                latest_origin_main_commit: currentCommit,
              },
            },
          },
        ],
      }),
    });

    expect(batchResponse.status).toBe(200);

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const now = "2026-04-26T00:00:00.000Z";

    database
      .prepare(
        `INSERT INTO tasks (
          task_id,
          title,
          task_spec,
          project_id,
          session_id,
          worktree_path,
          pull_request_url,
          dependencies,
          result,
          source_metadata,
          done,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "22222222-2222-4222-8222-222222222222",
        "Stale source task",
        "Task planned from stale baseline.",
        mainProjectId,
        null,
        null,
        null,
        "[]",
        "",
        JSON.stringify({ latest_origin_main_commit: staleCommit }),
        0,
        "processing",
        now,
        now,
      );
    database.close();

    const missingMetadataResponse = await app.request(
      contractModule.tasksPath,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Missing source metadata task",
          task_spec: "Task without source baseline metadata.",
          project_id: mainProjectId,
        }),
      },
    );

    expect(missingMetadataResponse.status).toBe(201);

    const listResponse = await app.request(contractModule.tasksPath);

    expect(listResponse.status).toBe(200);

    const listPayload = await listResponse.json();

    expect(
      contractModule.taskListResponseSchema.safeParse(listPayload).success,
    ).toBe(true);

    const tasksByTitle = new Map(
      listPayload.items.map((task: contractModule.Task) => [task.title, task]),
    );

    expect(
      tasksByTitle.get("Current source task")?.source_baseline_freshness,
    ).toEqual({
      current_commit: currentCommit,
      source_commit: currentCommit,
      status: "current",
      summary: `Task source baseline matches current origin/main ${currentCommit}`,
    });
    expect(
      tasksByTitle.get("Stale source task")?.source_baseline_freshness,
    ).toEqual({
      current_commit: currentCommit,
      source_commit: staleCommit,
      status: "stale",
      summary: `Task source baseline ${staleCommit} differs from current origin/main ${currentCommit}`,
    });
    expect(
      tasksByTitle.get("Missing source metadata task")
        ?.source_baseline_freshness,
    ).toEqual({
      current_commit: currentCommit,
      source_commit: null,
      status: "unknown",
      summary:
        "Task source baseline metadata is missing latest_origin_main_commit",
    });
  });

  it("applies POST /tasks/batch create operations with validation evidence and delete operations atomically in order", async () => {
    await useProjectRoot("creates-task-batch");

    const app = createTaskRouteApp();
    const project = { id: mainProjectId };
    const existingTaskResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: project.id,
        task_spec: "remove stale task",
        title: "Remove stale task",
      }),
    });
    const existingTask = await existingTaskResponse.json();
    const newTaskId = "11111111-1111-4111-8111-111111111111";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: project.id,
        operations: [
          {
            type: "create",
            task: {
              task_id: newTaskId,
              title: "Created from batch",
              spec: "write batch route",
              status: "processing",
              source_metadata: {
                ...buildPassingCoordinatorSourceMetadata(),
                coordinator_session_id: "session-1",
                task_spec_validation: {
                  conclusion_summary:
                    "aim-verify-task-spec returned pass for the source gap",
                  dimension_evaluation_id:
                    "44444444-4444-4444-8444-444444444444",
                  validated_baseline_commit: currentBaselineCommit,
                  validation_session_id: "validation-session-1",
                  validation_source: "aim-verify-task-spec",
                },
              },
            },
          },
          {
            type: "delete",
            delete_reason:
              "Stale unfinished task has no worktree or PR and is superseded by this batch.",
            task_id: existingTask.task_id,
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        { task_id: newTaskId, type: "create" },
        { task_id: existingTask.task_id, type: "delete" },
      ],
    });

    const createdTaskResponse = await app.request(
      resolveTaskByIdPath(newTaskId),
    );

    expect(createdTaskResponse.status).toBe(200);
    await expect(createdTaskResponse.json()).resolves.toMatchObject({
      project_id: project.id,
      source_metadata: {
        coordinator_session_id: "session-1",
        task_spec_validation: {
          conclusion_summary:
            "aim-verify-task-spec returned pass for the source gap",
          dimension_evaluation_id: "44444444-4444-4444-8444-444444444444",
          validation_session_id: "validation-session-1",
          validation_source: "aim-verify-task-spec",
        },
      },
      task_id: newTaskId,
      title: "Created from batch",
    });
    expect(
      await app.request(resolveTaskByIdPath(existingTask.task_id)),
    ).toMatchObject({ status: 404 });
  });

  it("accepts POST /tasks/batch create operations from the current baseline", async () => {
    await useProjectRoot("accepts-current-baseline-batch-create");

    const app = createTaskRouteApp({
      currentBaselineFactsProvider: vi.fn().mockResolvedValue({
        commit: currentBaselineCommit,
      }),
    });
    const taskId = "11111111-1111-4111-8111-111111111111";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: taskId,
              title: "Current baseline create",
              spec: "create only when baseline facts match",
              source_metadata: buildPassingCoordinatorSourceMetadata(),
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [{ task_id: taskId, type: "create" }],
    });
  });

  it("rejects POST /tasks/batch create operations missing baseline freshness metadata", async () => {
    await useProjectRoot("rejects-missing-baseline-batch-create");

    const app = createTaskRouteApp({
      currentBaselineFactsProvider: vi.fn().mockResolvedValue({
        commit: currentBaselineCommit,
      }),
    });
    const taskId = "11111111-1111-4111-8111-111111111111";
    const {
      latest_origin_main_commit: _latestOriginMainCommit,
      task_spec_validation,
      ...metadataWithoutSourceCommit
    } = buildPassingCoordinatorSourceMetadata();
    const {
      validated_baseline_commit: _validatedBaselineCommit,
      ...validationWithoutBaselineCommit
    } = task_spec_validation;

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: taskId,
              title: "Missing baseline create",
              spec: "must not be persisted",
              source_metadata: {
                ...metadataWithoutSourceCommit,
                task_spec_validation: validationWithoutBaselineCommit,
              },
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();

    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    expect(payload.message).toContain("latest_origin_main_commit");
    expect(payload.message).toContain("validated_baseline_commit");
    expect(payload.message).toContain(currentBaselineCommit);
    expect(payload.message).toContain(
      "Refresh the Task Spec from current origin/main",
    );
    expect(await app.request(resolveTaskByIdPath(taskId))).toMatchObject({
      status: 404,
    });
  });

  it("rejects POST /tasks/batch create operations from stale baseline metadata", async () => {
    await useProjectRoot("rejects-stale-baseline-batch-create");

    const app = createTaskRouteApp({
      currentBaselineFactsProvider: vi.fn().mockResolvedValue({
        commit: currentBaselineCommit,
      }),
    });
    const taskId = "11111111-1111-4111-8111-111111111111";
    const sourceMetadata = buildPassingCoordinatorSourceMetadata();

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: taskId,
              title: "Stale baseline create",
              spec: "must not be persisted",
              source_metadata: {
                ...sourceMetadata,
                latest_origin_main_commit: staleBaselineCommit,
                task_spec_validation: {
                  ...sourceMetadata.task_spec_validation,
                  validated_baseline_commit: staleBaselineCommit,
                },
              },
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();

    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    expect(payload.message).toContain(currentBaselineCommit);
    expect(payload.message).toContain(staleBaselineCommit);
    expect(payload.message).toContain(
      "Refresh the Task Spec from current origin/main",
    );
    expect(await app.request(resolveTaskByIdPath(taskId))).toMatchObject({
      status: 404,
    });
  });

  it("does not require baseline freshness metadata for POST /tasks/batch delete operations", async () => {
    await useProjectRoot("delete-only-batch-skips-baseline-freshness");

    const app = createTaskRouteApp({
      currentBaselineFactsProvider: vi.fn().mockResolvedValue({
        commit: currentBaselineCommit,
      }),
    });
    const existingTaskResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        task_spec: "remove stale task",
        title: "Remove stale task",
      }),
    });
    const existingTask = await existingTaskResponse.json();

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "delete",
            delete_reason:
              "Stale unfinished task has no worktree or PR and is superseded.",
            task_id: existingTask.task_id,
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [{ task_id: existingTask.task_id, type: "delete" }],
    });
  });

  it("redacts sensitive baseline metadata details from POST /tasks/batch freshness errors", async () => {
    await useProjectRoot("redacts-baseline-freshness-errors");

    const app = createTaskRouteApp({
      currentBaselineFactsProvider: vi.fn().mockResolvedValue({
        commit: currentBaselineCommit,
      }),
    });
    const sourceMetadata = buildPassingCoordinatorSourceMetadata();
    const leakedCommit = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: "11111111-1111-4111-8111-111111111111",
              title: "Sensitive stale baseline create",
              spec: "must not leak metadata",
              source_metadata: {
                ...sourceMetadata,
                latest_origin_main_commit: leakedCommit,
                task_spec_validation: {
                  ...sourceMetadata.task_spec_validation,
                  validated_baseline_commit: leakedCommit,
                },
              },
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();

    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    expect(payload.message).toContain("[REDACTED]");
    expect(payload.message).toContain(currentBaselineCommit);
    expect(payload.message).not.toContain("ghp_1234567890");
  });

  it("normalizes passing Task Spec validation evidence before persisting batch creates", async () => {
    await useProjectRoot("normalizes-task-spec-validation-evidence");

    const app = createTaskRouteApp();
    const taskId = "11111111-1111-4111-8111-111111111111";
    const validationSessionId = "validation-session-normalized";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: taskId,
              title: "Create with validation evidence",
              spec: "validated task spec",
              source_metadata: {
                ...buildPassingCoordinatorSourceMetadata(),
                dimension_evaluation_id: "44444444-4444-4444-8444-444444444444",
                dimension_id: "33333333-3333-4333-8333-333333333333",
                task_spec_validation: {
                  conclusion_summary: "Task Spec validation passed",
                  dimension_evaluation_id:
                    "44444444-4444-4444-8444-444444444444",
                  validated_baseline_commit: currentBaselineCommit,
                  validation_session_id: validationSessionId,
                  validation_source: "aim-verify-task-spec",
                },
              },
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(200);

    const createdTaskResponse = await app.request(resolveTaskByIdPath(taskId));
    expect(createdTaskResponse.status).toBe(200);
    await expect(createdTaskResponse.json()).resolves.toMatchObject({
      source_metadata: {
        dimension_evaluation_id: "44444444-4444-4444-8444-444444444444",
        dimension_id: "33333333-3333-4333-8333-333333333333",
        task_spec_validation: {
          conclusion: "pass",
          conclusion_summary: "Task Spec validation passed",
          dimension_evaluation_id: "44444444-4444-4444-8444-444444444444",
          validated_baseline_commit: currentBaselineCommit,
          validation_session_id: validationSessionId,
          validation_source: "aim-verify-task-spec",
        },
      },
    });
  });

  it.each([
    [
      "waiting_assumptions",
      { blocking_assumptions: ["Director must confirm the source gap"] },
      "waiting_assumptions Task Spec validation cannot enter POST /tasks/batch: Director must confirm the source gap",
    ],
    [
      "failed",
      { failure_reason: "Task Spec no longer matches origin/main" },
      "failed Task Spec validation cannot enter POST /tasks/batch: Task Spec no longer matches origin/main",
    ],
  ])("blocks %s Task Spec validation before batch writes", async (conclusion, details, message) => {
    await useProjectRoot(`blocks-${conclusion}-validation`);

    const app = createTaskRouteApp();
    const taskId = "11111111-1111-4111-8111-111111111111";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: taskId,
              title: "Blocked create",
              spec: "must not be persisted",
              source_metadata: {
                ...buildPassingCoordinatorSourceMetadata(),
                dimension_evaluation_id: "44444444-4444-4444-8444-444444444444",
                dimension_id: "33333333-3333-4333-8333-333333333333",
                task_spec_validation: {
                  conclusion,
                  conclusion_summary: "Task Spec validation did not pass",
                  dimension_evaluation_id:
                    "44444444-4444-4444-8444-444444444444",
                  validation_session_id: "validation-session-blocked",
                  validation_source: "aim-verify-task-spec",
                  ...details,
                },
              },
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message,
    });
    expect(await app.request(resolveTaskByIdPath(taskId))).toMatchObject({
      status: 404,
    });
  });

  it("redacts sensitive validation details while keeping POST /tasks/batch recovery actionable", async () => {
    await useProjectRoot("redacts-batch-validation-details");

    const app = createTaskRouteApp();
    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: "11111111-1111-4111-8111-111111111111",
              title: "Blocked create",
              spec: "must not be persisted",
              source_metadata: {
                ...buildPassingCoordinatorSourceMetadata(),
                dimension_evaluation_id: "44444444-4444-4444-8444-444444444444",
                dimension_id: "33333333-3333-4333-8333-333333333333",
                task_spec_validation: {
                  conclusion: "failed",
                  conclusion_summary: "Task Spec validation failed",
                  dimension_evaluation_id:
                    "44444444-4444-4444-8444-444444444444",
                  failure_reason:
                    "GitHub token ghp_1234567890abcdefghijklmnopqrstuvwxyz leaked in validation output",
                  validation_session_id: "validation-session-blocked",
                  validation_source: "aim-verify-task-spec",
                },
              },
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();

    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    expect(payload.message).toContain("POST /tasks/batch");
    expect(payload.message).toContain("task_spec_validation");
    expect(payload.message).toContain("Fix the validation evidence");
    expect(payload.message).toContain("[REDACTED]");
    expect(payload.message).not.toContain("ghp_1234567890");
  });

  it("does not treat Task Spec validation source gap as Task Pool planning evidence", async () => {
    await useProjectRoot("validation-gap-does-not-replace-planning-evidence");

    const app = createTaskRouteApp();
    const taskId = "11111111-1111-4111-8111-111111111111";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: taskId,
              title: "Missing planning evidence",
              spec: "validation evidence alone is not planning evidence",
              source_metadata: {
                task_spec_validation: {
                  conclusion: "pass",
                  conclusion_summary: "Task Spec validation passed",
                  dimension_evaluation_id:
                    "44444444-4444-4444-8444-444444444444",
                  validation_session_id: "validation-session-only",
                  validation_source: "aim-verify-task-spec",
                },
              },
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message:
        "Task batch create requires source_metadata Coordinator planning evidence independent from task_spec_validation: current_task_pool_coverage, dependency_rationale, conflict_duplicate_assessment, unfinished_task_non_conflict_rationale",
    });
    expect(await app.request(resolveTaskByIdPath(taskId))).toMatchObject({
      status: 404,
    });
  });

  it("rolls back POST /tasks/batch when any operation fails", async () => {
    await useProjectRoot("rolls-back-task-batch");

    const app = createTaskRouteApp();
    const project = { id: mainProjectId };
    const newTaskId = "11111111-1111-4111-8111-111111111111";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: project.id,
        operations: [
          {
            type: "create",
            task: {
              task_id: newTaskId,
              title: "Created from batch",
              spec: "write batch route",
              source_metadata: buildPassingCoordinatorSourceMetadata(),
            },
          },
          {
            type: "delete",
            delete_reason:
              "Stale task has no active worktree or PR and must be deleted atomically.",
            task_id: "22222222-2222-4222-8222-222222222222",
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    expect(await app.request(resolveTaskByIdPath(newTaskId))).toMatchObject({
      status: 404,
    });
  });

  it("rejects duplicate creates in the same POST /tasks/batch by stable source fields without partial writes", async () => {
    await useProjectRoot("rejects-same-batch-duplicate-creates");

    const app = createTaskRouteApp();
    const duplicateTaskId = "11111111-1111-4111-8111-111111111111";
    const otherDuplicateTaskId = "22222222-2222-4222-8222-222222222222";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: duplicateTaskId,
              title: "Close evaluation gap",
              spec: "first plan",
              source_metadata: buildPassingCoordinatorSourceMetadata(),
            },
          },
          {
            type: "create",
            task: {
              task_id: otherDuplicateTaskId,
              title: "Close evaluation gap",
              spec: "second plan",
              source_metadata: buildPassingCoordinatorSourceMetadata(),
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message:
        'Task batch create duplicates unfinished Task Pool coverage for title "Close evaluation gap", dimension_id "33333333-3333-4333-8333-333333333333", dimension_evaluation_id "44444444-4444-4444-8444-444444444444"',
    });
    expect(
      await app.request(resolveTaskByIdPath(duplicateTaskId)),
    ).toMatchObject({ status: 404 });
    expect(
      await app.request(resolveTaskByIdPath(otherDuplicateTaskId)),
    ).toMatchObject({ status: 404 });
  });

  it("rejects duplicate creates covered by an existing unfinished task without partial writes", async () => {
    await useProjectRoot("rejects-existing-duplicate-create");

    const app = createTaskRouteApp();
    const existingTaskId = "11111111-1111-4111-8111-111111111111";
    const duplicateTaskId = "22222222-2222-4222-8222-222222222222";
    const unrelatedTaskId = "55555555-5555-4555-8555-555555555555";
    const seedResponse = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: existingTaskId,
              title: "Close evaluation gap",
              spec: "existing plan",
              source_metadata: buildPassingCoordinatorSourceMetadata(),
            },
          },
        ],
      }),
    });

    expect(seedResponse.status).toBe(200);

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: duplicateTaskId,
              title: "Close evaluation gap",
              spec: "duplicate plan",
              source_metadata: buildPassingCoordinatorSourceMetadata(),
            },
          },
          {
            type: "create",
            task: {
              task_id: unrelatedTaskId,
              title: "Independent task",
              spec: "must not persist",
              source_metadata: buildPassingCoordinatorSourceMetadata(
                "66666666-6666-4666-8666-666666666666",
                "77777777-7777-4777-8777-777777777777",
              ),
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message:
        'Task batch create duplicates unfinished Task Pool coverage for title "Close evaluation gap", dimension_id "33333333-3333-4333-8333-333333333333", dimension_evaluation_id "44444444-4444-4444-8444-444444444444"',
    });
    expect(
      await app.request(resolveTaskByIdPath(existingTaskId)),
    ).toMatchObject({ status: 200 });
    expect(
      await app.request(resolveTaskByIdPath(duplicateTaskId)),
    ).toMatchObject({ status: 404 });
    expect(
      await app.request(resolveTaskByIdPath(unrelatedTaskId)),
    ).toMatchObject({ status: 404 });
  });

  it("rejects deletes for nonexistent tasks and leaves valid creates unapplied", async () => {
    await useProjectRoot("rejects-nonexistent-delete-atomically");

    const app = createTaskRouteApp();
    const newTaskId = "11111111-1111-4111-8111-111111111111";
    const missingTaskId = "22222222-2222-4222-8222-222222222222";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: newTaskId,
              title: "Valid create",
              spec: "must roll back",
              source_metadata: buildPassingCoordinatorSourceMetadata(),
            },
          },
          {
            type: "delete",
            delete_reason:
              "Missing stale task has no worktree or PR and should prove rollback behavior.",
            task_id: missingTaskId,
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message: `Task batch cannot delete nonexistent task ${missingTaskId}`,
    });
    expect(await app.request(resolveTaskByIdPath(newTaskId))).toMatchObject({
      status: 404,
    });
  });

  it("rejects create and delete conflicts in the same POST /tasks/batch", async () => {
    await useProjectRoot("rejects-create-delete-conflict");

    const app = createTaskRouteApp();
    const taskId = "11111111-1111-4111-8111-111111111111";

    const response = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: taskId,
              title: "Conflicting task",
              spec: "do not create and delete in one batch",
              source_metadata: {},
            },
          },
          {
            type: "delete",
            delete_reason:
              "Conflicting same-batch delete has no worktree or PR classification.",
            task_id: taskId,
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message: `Task batch cannot create and delete task_id ${taskId} in the same batch`,
    });
    expect(await app.request(resolveTaskByIdPath(taskId))).toMatchObject({
      status: 404,
    });
  });

  it("rejects duplicate task ids and terminal deletes in POST /tasks/batch", async () => {
    await useProjectRoot("rejects-invalid-task-batch");

    const app = createTaskRouteApp();
    const project = { id: mainProjectId };
    const resolvedResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: project.id,
        status: "resolved",
        task_spec: "already done",
        title: "Already done",
      }),
    });
    const resolvedTask = await resolvedResponse.json();
    const taskId = "11111111-1111-4111-8111-111111111111";

    const duplicateResponse = await app.request(contractModule.tasksBatchPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: project.id,
        operations: [
          {
            type: "create",
            task: {
              task_id: taskId,
              title: "Created from batch",
              spec: "write batch route",
              source_metadata: {},
            },
          },
          {
            type: "delete",
            delete_reason:
              "Conflicting duplicate operation has no worktree or PR classification.",
            task_id: taskId,
          },
        ],
      }),
    });
    const terminalDeleteResponse = await app.request(
      contractModule.tasksBatchPath,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          project_id: project.id,
          operations: [
            {
              type: "delete",
              delete_reason:
                "Terminal task has no active worktree or PR but cannot be deleted.",
              task_id: resolvedTask.task_id,
            },
          ],
        }),
      },
    );

    expect(duplicateResponse.status).toBe(400);
    expect(terminalDeleteResponse.status).toBe(400);
    expect(
      await app.request(resolveTaskByIdPath(resolvedTask.task_id)),
    ).toMatchObject({
      status: 200,
    });
  });

  it("returns the raw task spec markdown for GET /tasks/{taskId}/spec", async () => {
    await useProjectRoot("reads-task-spec");

    const app = createTaskRouteApp();
    const taskSpec = "# Task Spec\n\nShip the endpoint.";
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: taskSpec,
        project_id: mainProjectId,
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const specResponse = await app.request(
      resolveTaskSpecPath(createdTask.task_id),
    );

    expect(specResponse.status).toBe(200);
    expect(specResponse.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    await expect(specResponse.text()).resolves.toBe(taskSpec);
  });

  it("returns TASK_NOT_FOUND for GET /tasks/{taskId}/spec when the task is missing", async () => {
    await useProjectRoot("missing-task-spec");

    const app = createTaskRouteApp();
    const response = await app.request(resolveTaskSpecPath("task-missing"));

    expect(response.status).toBe(404);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_NOT_FOUND");
    expect(payload.message).toBe("Task task-missing was not found");
  });

  it("logs task_created after POST /tasks succeeds", async () => {
    await useProjectRoot("logs-task-created");

    const logger = createLogger();
    const app = createTaskRouteApp({ logger });
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        project_id: mainProjectId,
        session_id: "session-1",
        status: "processing",
        task_spec: "write sqlite-backed route tests",
      }),
    });

    expect(response.status).toBe(201);

    const createdTask = await response.json();

    expect(logger.info).toHaveBeenCalledWith({
      event: "task_created",
      project_id: mainProjectId,
      session_id: "session-1",
      status: "processing",
      task_id: createdTask.task_id,
    });
  });

  it("binds task storage to the project root present when the app is created", async () => {
    const appProjectRoot = await useProjectRoot("app-project-root");
    const requestProjectRoot = await createProjectRoot("request-project-root");
    const app = createTaskRouteApp();

    process.env.AIM_PROJECT_ROOT = requestProjectRoot;

    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "stays on app root",
        project_id: mainProjectId,
      }),
    });

    expect(createResponse.status).toBe(201);
    await expect(
      access(join(appProjectRoot, "aim.sqlite")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(requestProjectRoot, "aim.sqlite")),
    ).rejects.toThrow();
  });

  it("filters the persisted task list by status, done, and session_id", async () => {
    await useProjectRoot("filters-list");

    const app = createTaskRouteApp();

    const firstCreateResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "keep running",
        project_id: mainProjectId,
        session_id: "session-a",
        status: "processing",
      }),
    });
    const secondCreateResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "already done",
        project_id: mainProjectId,
        session_id: "session-a",
        status: "rejected",
      }),
    });
    const thirdCreateResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "different session",
        project_id: mainProjectId,
        session_id: "session-b",
        status: "processing",
      }),
    });
    const otherProjectResponse = await app.request(
      contractModule.projectsPath,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          global_model_id: "claude-sonnet-4-5",
          global_provider_id: "anthropic",
          name: "Other project",
          git_origin_url: "https://github.com/example/other.git",
        }),
      },
    );
    const otherProject = await otherProjectResponse.json();
    const otherProjectTaskResponse = await app.request(
      contractModule.tasksPath,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Other task",
          task_spec: "other project task",
          project_id: otherProject.id,
          status: "processing",
        }),
      },
    );

    expect(firstCreateResponse.status).toBe(201);
    expect(secondCreateResponse.status).toBe(201);
    expect(thirdCreateResponse.status).toBe(201);
    expect(otherProjectResponse.status).toBe(201);
    expect(otherProjectTaskResponse.status).toBe(201);

    const statusFilteredResponse = await app.request(
      `${contractModule.tasksPath}?status=processing`,
    );
    const doneFilteredResponse = await app.request(
      `${contractModule.tasksPath}?done=true`,
    );
    const sessionFilteredResponse = await app.request(
      `${contractModule.tasksPath}?session_id=session-a`,
    );
    const projectFilteredResponse = await app.request(
      `${contractModule.tasksPath}?project_id=${mainProjectId}&done=false`,
    );

    expect(statusFilteredResponse.status).toBe(200);
    expect(doneFilteredResponse.status).toBe(200);
    expect(sessionFilteredResponse.status).toBe(200);
    expect(projectFilteredResponse.status).toBe(200);

    const statusFilteredPayload = await statusFilteredResponse.json();
    const doneFilteredPayload = await doneFilteredResponse.json();
    const sessionFilteredPayload = await sessionFilteredResponse.json();
    const projectFilteredPayload = await projectFilteredResponse.json();

    expect(
      contractModule.taskListResponseSchema.safeParse(statusFilteredPayload)
        .success,
    ).toBe(true);
    expect(statusFilteredPayload.items).toHaveLength(3);
    expect(statusFilteredPayload.items.map((task) => task.task_spec)).toEqual([
      "keep running",
      "different session",
      "other project task",
    ]);
    expect(
      statusFilteredPayload.items.every((task) => task.status === "processing"),
    ).toBe(true);

    expect(
      contractModule.taskListResponseSchema.safeParse(doneFilteredPayload)
        .success,
    ).toBe(true);
    expect(doneFilteredPayload.items).toHaveLength(1);
    expect(doneFilteredPayload.items[0].task_spec).toBe("already done");
    expect(doneFilteredPayload.items[0].status).toBe("rejected");
    expect(doneFilteredPayload.items[0].done).toBe(true);

    expect(
      contractModule.taskListResponseSchema.safeParse(sessionFilteredPayload)
        .success,
    ).toBe(true);
    expect(sessionFilteredPayload.items).toHaveLength(2);
    expect(sessionFilteredPayload.items.map((task) => task.task_spec)).toEqual([
      "keep running",
      "already done",
    ]);
    expect(
      sessionFilteredPayload.items.every(
        (task) => task.session_id === "session-a",
      ),
    ).toBe(true);

    expect(
      contractModule.taskListResponseSchema.safeParse(projectFilteredPayload)
        .success,
    ).toBe(true);
    expect(projectFilteredPayload.items.map((task) => task.task_spec)).toEqual([
      "keep running",
      "different session",
    ]);
    expect(
      projectFilteredPayload.items.every(
        (task) => task.project_id === mainProjectId && task.done === false,
      ),
    ).toBe(true);
  });

  it("patches a persisted task by merging fields and deriving done from failed status", async () => {
    await useProjectRoot("patches-task");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "before patch",
        project_id: mainProjectId,
        session_id: "session-7",
        dependencies: ["task-a"],
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();

    const patchResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          task_spec: "after patch",
          pull_request_url: "https://example.test/pr/7",
          status: "rejected",
        }),
      },
    );

    expect(patchResponse.status).toBe(200);

    const patchedTask = await patchResponse.json();

    expect(contractModule.taskSchema.safeParse(patchedTask).success).toBe(true);
    expect(patchedTask.task_id).toBe(createdTask.task_id);
    expect(patchedTask.task_spec).toBe("after patch");
    expect(patchedTask.project_id).toBe(mainProjectId);
    expect(patchedTask.session_id).toBe("session-7");
    expect(patchedTask.dependencies).toEqual(["task-a"]);
    expect(patchedTask.pull_request_url).toBe("https://example.test/pr/7");
    expect(patchedTask.status).toBe("rejected");
    expect(patchedTask.done).toBe(true);

    const detailResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
    );

    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toEqual(patchedTask);
  });

  it("patches nullable fields back to null", async () => {
    await useProjectRoot("patches-nullable-fields");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "clear patch fields",
        project_id: mainProjectId,
        session_id: "session-9",
        worktree_path: "/tmp/worktree",
        pull_request_url: "https://example.test/pr/9",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const patchResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          session_id: null,
          worktree_path: null,
          pull_request_url: null,
        }),
      },
    );

    expect(patchResponse.status).toBe(200);

    const patchedTask = await patchResponse.json();

    expect(patchedTask.session_id).toBeNull();
    expect(patchedTask.project_id).toBe(mainProjectId);
    expect(patchedTask.worktree_path).toBeNull();
    expect(patchedTask.pull_request_url).toBeNull();
  });

  it("updates worktree_path through its dedicated field endpoint", async () => {
    await useProjectRoot("puts-worktree-path");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "record worktree path",
        project_id: mainProjectId,
        dependencies: ["task-a"],
        pull_request_url: "https://example.test/pr/1",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const response = await app.request(
      resolveTaskFieldPath(createdTask.task_id, "worktree_path"),
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          worktree_path: "/repo/.worktrees/task-1",
        }),
      },
    );

    expect(response.status).toBe(200);

    const updatedTask = await response.json();

    expect(contractModule.taskSchema.safeParse(updatedTask).success).toBe(true);
    expect(updatedTask.worktree_path).toBe("/repo/.worktrees/task-1");
    expect(updatedTask.pull_request_url).toBe("https://example.test/pr/1");
    expect(updatedTask.dependencies).toEqual(["task-a"]);
    expect(updatedTask.status).toBe("processing");
  });

  it("updates pull_request_url through its dedicated field endpoint", async () => {
    await useProjectRoot("puts-pull-request-url");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "record pull request url",
        project_id: mainProjectId,
        worktree_path: "/repo/.worktrees/task-2",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const response = await app.request(
      resolveTaskFieldPath(createdTask.task_id, "pull_request_url"),
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          pull_request_url: "https://github.com/org/repo/pull/2",
        }),
      },
    );

    expect(response.status).toBe(200);

    const updatedTask = await response.json();

    expect(contractModule.taskSchema.safeParse(updatedTask).success).toBe(true);
    expect(updatedTask.pull_request_url).toBe(
      "https://github.com/org/repo/pull/2",
    );
    expect(updatedTask.worktree_path).toBe("/repo/.worktrees/task-2");
  });

  it("classifies failed checks and review blockers with recovery guidance", async () => {
    await useProjectRoot("pull-request-status-blockers");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "follow the pull request",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();

    mockGhPullRequestOutput(ghFailedChecksPullRequestOutput);
    const failedChecksResponse = await app.request(
      resolveTaskPullRequestStatusPath(createdTask.task_id),
    );

    expect(failedChecksResponse.status).toBe(200);
    await expect(failedChecksResponse.json()).resolves.toMatchObject({
      category: "failed_checks",
      pull_request_url: "https://github.com/example/repo/pull/42",
      recovery_action:
        "Inspect the failing required checks, fix in-scope failures on the same branch, push, and continue PR follow-up. Escalate if the failure is outside task scope.",
      summary: expect.stringContaining("test:api"),
      task_status: "processing",
    });

    mockGhPullRequestOutput(ghReviewBlockedPullRequestOutput);
    const reviewBlockedResponse = await app.request(
      resolveTaskPullRequestStatusPath(createdTask.task_id),
    );

    expect(reviewBlockedResponse.status).toBe(200);
    await expect(reviewBlockedResponse.json()).resolves.toMatchObject({
      category: "review_blocked",
      recovery_action:
        "Address blocking review feedback on the same branch, then wait for review dismissal or approval before merging.",
      summary: expect.stringContaining("CHANGES_REQUESTED"),
    });
  });

  it("classifies a merged pull request on an unresolved task as ready to resolve", async () => {
    await useProjectRoot("pull-request-status-merged-unresolved");

    mockGhPullRequestOutput(ghMergedFollowupPullRequestOutput);

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "follow the pull request",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const response = await app.request(
      resolveTaskPullRequestStatusPath(createdTask.task_id),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      category: "merged_but_not_resolved",
      recovery_action:
        "Call aim_session_resolve with the final result now that the pull request is merged.",
      summary: "Pull request is merged, but the AIM task is still processing.",
      task_done: false,
      task_status: "processing",
    });
  });

  it("classifies unavailable pull request lookups before asking for rejection or escalation", async () => {
    await useProjectRoot("pull-request-status-unavailable");

    mockGhFailure();

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "follow the pull request",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/404",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const response = await app.request(
      resolveTaskPullRequestStatusPath(createdTask.task_id),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      category: "pull_request_unavailable",
      recovery_action:
        "Verify the pull_request_url, GitHub CLI authentication, and repository access. If the PR was deleted or cannot be recovered, reject or escalate with the exact lookup failure.",
      summary: expect.stringContaining("Could not query"),
    });
  });

  it("classifies processing tasks without pull requests by assignment, session, and worktree state", async () => {
    const projectRoot = await useProjectRoot(
      "pull-request-status-no-pr-states",
    );

    const app = createTaskRouteApp();

    const unassignedResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Waiting task",
        task_spec: "wait for assignment",
        project_id: mainProjectId,
        status: "processing",
      }),
    });

    expect(unassignedResponse.status).toBe(201);

    const unassignedTask = await unassignedResponse.json();
    const unassignedStatusResponse = await app.request(
      resolveTaskPullRequestStatusPath(unassignedTask.task_id),
    );

    expect(unassignedStatusResponse.status).toBe(200);
    await expect(unassignedStatusResponse.json()).resolves.toMatchObject({
      category: "waiting_for_assignment",
      pull_request_url: null,
      task_status: "processing",
      recovery_action:
        "Assign a developer session before expecting PR follow-up; no PR exists yet.",
      summary: "Task is processing without an assigned OpenCode session or PR.",
    });

    const staleSessionResponse = await app.request(
      contractModule.openCodeSessionsPath,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: "session-stale-no-pr",
          continue_prompt: "Continue the stale no-PR task.",
        }),
      },
    );

    expect(staleSessionResponse.status).toBe(201);

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    database
      .prepare(
        "UPDATE opencode_sessions SET updated_at = ? WHERE session_id = ?",
      )
      .run("2020-01-01T00:00:00.000Z", "session-stale-no-pr");
    database.close();

    const staleTaskResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Stale session task",
        task_spec: "recover stale session",
        project_id: mainProjectId,
        session_id: "session-stale-no-pr",
        status: "processing",
      }),
    });

    expect(staleTaskResponse.status).toBe(201);

    const staleTask = await staleTaskResponse.json();
    const staleStatusResponse = await app.request(
      resolveTaskPullRequestStatusPath(staleTask.task_id),
    );

    expect(staleStatusResponse.status).toBe(200);
    await expect(staleStatusResponse.json()).resolves.toMatchObject({
      category: "session_pending_stale",
      recovery_action:
        "Continue or restart the stale OpenCode session, then create and record a PR when work is ready.",
      summary:
        "Task has a stale pending OpenCode session and no pull_request_url.",
    });

    const worktreePath =
      "/Users/alice/Projects/AIM/.worktrees/sensitive-task-worktree";
    const worktreeTaskResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Worktree task",
        task_spec: "continue worktree task",
        project_id: mainProjectId,
        session_id: "missing-session-no-pr",
        worktree_path: worktreePath,
        status: "processing",
      }),
    });

    expect(worktreeTaskResponse.status).toBe(201);

    const worktreeTask = await worktreeTaskResponse.json();
    const worktreeStatusResponse = await app.request(
      resolveTaskPullRequestStatusPath(worktreeTask.task_id),
    );

    expect(worktreeStatusResponse.status).toBe(200);

    const worktreePayload = await worktreeStatusResponse.json();

    expect(worktreePayload).toMatchObject({
      category: "worktree_created_no_pr",
      recovery_action:
        "Inspect the task worktree, continue development there if still valid, then create and record pull_request_url.",
      summary: "Task has a recorded worktree but no pull_request_url.",
    });
    expect(worktreePayload.summary).not.toContain(worktreePath);
    expect(worktreePayload.recovery_action).not.toContain(worktreePath);
  });

  it("classifies active no-PR processing tasks as needing developer continuation", async () => {
    await useProjectRoot("pull-request-status-no-pr-active-session");

    const app = createTaskRouteApp();
    const sessionResponse = await app.request(
      contractModule.openCodeSessionsPath,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: "session-active-no-pr",
          continue_prompt: "Continue active task.",
        }),
      },
    );

    expect(sessionResponse.status).toBe(201);

    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Active session task",
        task_spec: "continue active session",
        project_id: mainProjectId,
        session_id: "session-active-no-pr",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const response = await app.request(
      resolveTaskPullRequestStatusPath(createdTask.task_id),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      category: "needs_developer_continue",
      recovery_action:
        "Continue the assigned OpenCode session until work is ready for PR, then record pull_request_url.",
      summary:
        "Task has an active assigned OpenCode session and no pull_request_url.",
    });
  });

  it("updates dependencies through its dedicated field endpoint with patch validation", async () => {
    await useProjectRoot("puts-dependencies");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "record dependencies",
        project_id: mainProjectId,
        dependencies: ["task-old"],
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const invalidResponse = await app.request(
      resolveTaskFieldPath(createdTask.task_id, "dependencies"),
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dependencies: [""],
        }),
      },
    );

    expect(invalidResponse.status).toBe(400);

    const invalidPayload = await invalidResponse.json();

    expect(invalidPayload.code).toBe("TASK_VALIDATION_ERROR");

    const response = await app.request(
      resolveTaskFieldPath(createdTask.task_id, "dependencies"),
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dependencies: ["task-api", "task-docs"],
        }),
      },
    );

    expect(response.status).toBe(200);

    const updatedTask = await response.json();

    expect(contractModule.taskSchema.safeParse(updatedTask).success).toBe(true);
    expect(updatedTask.dependencies).toEqual(["task-api", "task-docs"]);
  });

  it("does not expose legacy task terminal routes", async () => {
    await useProjectRoot("legacy-task-terminal-routes-removed");

    const app = createTaskRouteApp();

    for (const path of ["/tasks/task-404/resolve", "/tasks/task-404/reject"]) {
      const response = await app.request(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ result: "terminal result" }),
      });

      expect(response.status).toBe(404);
    }
  });

  it("rejects PATCH /tasks/{id} when project_id is present", async () => {
    await useProjectRoot("rejects-project-path-patch");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "patch validation target",
        project_id: mainProjectId,
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const response = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          project_id: mainProjectId,
        }),
      },
    );

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
  });

  it("deletes a persisted task and then returns not found for a follow-up read", async () => {
    await useProjectRoot("deletes-task");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "delete me",
        project_id: mainProjectId,
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const deleteResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
      {
        method: "DELETE",
      },
    );

    expect(deleteResponse.status).toBe(204);
    await expect(deleteResponse.text()).resolves.toBe("");

    const detailResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
    );

    expect(detailResponse.status).toBe(404);

    const detailPayload = await detailResponse.json();

    expect(
      contractModule.taskErrorSchema.safeParse(detailPayload).success,
    ).toBe(true);
    expect(detailPayload.code).toBe("TASK_NOT_FOUND");
  });

  it("returns a shared validation error for an invalid create payload", async () => {
    await useProjectRoot("invalid-create-payload");

    const app = createTaskRouteApp();
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        task_spec: "",
      }),
    });

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
  });

  it("returns a shared validation error for invalid list filters", async () => {
    await useProjectRoot("invalid-list-filters");

    const app = createTaskRouteApp();
    const response = await app.request(
      `${contractModule.tasksPath}?done=maybe`,
    );

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
  });

  it("returns a shared validation error for an invalid patch payload", async () => {
    await useProjectRoot("invalid-patch-payload");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "patch validation target",
        project_id: mainProjectId,
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const response = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "not-a-status",
        }),
      },
    );

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
  });

  it("returns a shared not found error for patching a missing task", async () => {
    await useProjectRoot("missing-patch-target");

    const app = createTaskRouteApp();
    const response = await app.request(resolveTaskByIdPath("task-404"), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "processing",
      }),
    });

    expect(response.status).toBe(404);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_NOT_FOUND");
  });

  it("returns a shared not found error for deleting a missing task", async () => {
    await useProjectRoot("missing-delete-target");

    const app = createTaskRouteApp();
    const response = await app.request(resolveTaskByIdPath("task-404"), {
      method: "DELETE",
    });

    expect(response.status).toBe(404);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_NOT_FOUND");
  });

  it("returns 500 when the existing sqlite tasks schema is incompatible", async () => {
    const projectRoot = await useProjectRoot("schema-fast-fail");
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database.exec(
      "CREATE TABLE tasks (task_id TEXT PRIMARY KEY, task_spec INTEGER NOT NULL)",
    );
    database.close();

    const app = createTaskRouteApp();
    const response = await app.request(contractModule.tasksPath);

    expect(response.status).toBe(500);
  });

  it("keeps task route implementation on the public contract boundary", async () => {
    const source = await readFile(taskRouteSourceUrl, "utf8");
    const sourceFile = ts.createSourceFile(
      taskRouteSourceUrl.pathname,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const importPaths = sourceFile.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => statement.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((specifier) => specifier.text);
    const valueImportPaths = sourceFile.statements
      .filter(ts.isImportDeclaration)
      .filter((statement) => !statement.importClause?.isTypeOnly)
      .map((statement) => statement.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((specifier) => specifier.text);

    expect(importPaths).toContain("@aim-ai/contract");
    expect(valueImportPaths).not.toContain("../src/logger.js");
    expect(valueImportPaths).not.toContain("../logger.js");
    expect(valueImportPaths).toContain("../task-log-fields.js");
    expect(
      importPaths.some((path) => path.includes("contract/generated")),
    ).toBe(false);
    expect(
      importPaths.some(
        (path) => path.startsWith(".") && path.includes("contract"),
      ),
    ).toBe(false);
  });

  it("keeps createApp type surface off the pino logger module", async () => {
    const source = await readFile(appSourceUrl, "utf8");
    const sourceFile = ts.createSourceFile(
      appSourceUrl.pathname,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const valueImportPaths = sourceFile.statements
      .filter(ts.isImportDeclaration)
      .filter((statement) => !statement.importClause?.isTypeOnly)
      .map((statement) => statement.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((specifier) => specifier.text);
    const typeImportPaths = sourceFile.statements
      .filter(ts.isImportDeclaration)
      .filter((statement) => statement.importClause?.isTypeOnly)
      .map((statement) => statement.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((specifier) => specifier.text);

    expect(valueImportPaths).not.toContain("./logger.js");
    expect(typeImportPaths).not.toContain("./logger.js");
    expect(typeImportPaths).toContain("./api-logger.js");
  });
});
