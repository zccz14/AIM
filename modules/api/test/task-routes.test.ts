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

const ghMergedPullRequestOutput = JSON.stringify({
  mergedAt: "2026-04-26T10:00:00Z",
  state: "MERGED",
});
const ghOpenPullRequestOutput = JSON.stringify({
  mergedAt: null,
  state: "OPEN",
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
      callback(new Error("gh failed"));
    },
  );
};

const taskRouteSourceUrl = new URL("../src/routes/tasks.ts", import.meta.url);
const appSourceUrl = new URL("../src/app.ts", import.meta.url);
const routesTempRoot = join(process.cwd(), ".tmp", "modules-api-task-routes");

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mainProjectId = "00000000-0000-4000-8000-000000000001";

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

const resolveTaskResolvePath = (taskId: string) =>
  contractModule.taskResolvePath.replace("{taskId}", taskId);

const resolveTaskRejectPath = (taskId: string) =>
  contractModule.taskRejectPath.replace("{taskId}", taskId);

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
      }),
    });

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      global_model_id: "gpt-5.5",
      global_provider_id: "openai",
      id: createdProject.id,
      name: "Renamed project",
      git_origin_url: "https://github.com/example/main.git",
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

  it("applies POST /tasks/batch create and delete operations atomically in order", async () => {
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
              source_metadata: { coordinator_session_id: "session-1" },
            },
          },
          {
            type: "delete",
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
      source_metadata: { coordinator_session_id: "session-1" },
      task_id: newTaskId,
      title: "Created from batch",
    });
    expect(
      await app.request(resolveTaskByIdPath(existingTask.task_id)),
    ).toMatchObject({ status: 404 });
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
              source_metadata: {},
            },
          },
          {
            type: "delete",
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

    expect(firstCreateResponse.status).toBe(201);
    expect(secondCreateResponse.status).toBe(201);
    expect(thirdCreateResponse.status).toBe(201);

    const statusFilteredResponse = await app.request(
      `${contractModule.tasksPath}?status=processing`,
    );
    const doneFilteredResponse = await app.request(
      `${contractModule.tasksPath}?done=true`,
    );
    const sessionFilteredResponse = await app.request(
      `${contractModule.tasksPath}?session_id=session-a`,
    );

    expect(statusFilteredResponse.status).toBe(200);
    expect(doneFilteredResponse.status).toBe(200);
    expect(sessionFilteredResponse.status).toBe(200);

    const statusFilteredPayload = await statusFilteredResponse.json();
    const doneFilteredPayload = await doneFilteredResponse.json();
    const sessionFilteredPayload = await sessionFilteredResponse.json();

    expect(
      contractModule.taskListResponseSchema.safeParse(statusFilteredPayload)
        .success,
    ).toBe(true);
    expect(statusFilteredPayload.items).toHaveLength(2);
    expect(statusFilteredPayload.items.map((task) => task.task_spec)).toEqual([
      "keep running",
      "different session",
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

  it("resolves a task and preserves the result when PATCH omits it", async () => {
    await useProjectRoot("resolves-task-and-preserves-result");

    mockGhPullRequestOutput(ghMergedPullRequestOutput);

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "resolve me",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const resolveResponse = await app.request(
      resolveTaskResolvePath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: "ship it",
        }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    await expect(resolveResponse.text()).resolves.toBe("");

    const resolvedDetailResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
    );

    expect(resolvedDetailResponse.status).toBe(200);

    const resolvedTask = await resolvedDetailResponse.json();

    expect(resolvedTask.status).toBe("resolved");
    expect(resolvedTask.done).toBe(true);
    expect(resolvedTask.result).toBe("ship it");

    const patchResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          task_spec: "resolved task",
        }),
      },
    );

    expect(patchResponse.status).toBe(200);

    const patchedTask = await patchResponse.json();

    expect(patchedTask.task_spec).toBe("resolved task");
    expect(patchedTask.status).toBe("resolved");
    expect(patchedTask.done).toBe(true);
    expect(patchedTask.result).toBe("ship it");
  });

  it("resolves a task when gh reports the pull request state as merged", async () => {
    await useProjectRoot("resolves-task-from-gh-merged-state");

    mockGhPullRequestOutput(
      JSON.stringify({
        mergedAt: "2026-04-26T10:00:00Z",
        state: "MERGED",
      }),
    );

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "resolve me",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const resolveResponse = await app.request(
      resolveTaskResolvePath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: "ship it",
        }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    expect(execFileMock).toHaveBeenCalledWith(
      "gh",
      [
        "pr",
        "view",
        "https://github.com/example/repo/pull/42",
        "--json",
        "state,mergedAt",
      ],
      { encoding: "utf8" },
      expect.any(Function),
    );
  });

  it("rejects resolve when no pull request URL is recorded", async () => {
    await useProjectRoot("resolve-requires-pull-request-url");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "resolve me",
        project_id: mainProjectId,
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const resolveResponse = await app.request(
      resolveTaskResolvePath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: "ship it",
        }),
      },
    );

    expect(resolveResponse.status).toBe(400);

    const payload = await resolveResponse.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    expect(payload.message).toContain("pull_request_url");
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("rejects resolve when the recorded pull request is not merged", async () => {
    await useProjectRoot("resolve-requires-merged-pull-request");

    mockGhPullRequestOutput(ghOpenPullRequestOutput);

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "resolve me",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const resolveResponse = await app.request(
      resolveTaskResolvePath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: "ship it",
        }),
      },
    );

    expect(resolveResponse.status).toBe(400);

    const payload = await resolveResponse.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    expect(payload.message).toContain("merged");
  });

  it("rejects resolve when gh cannot confirm the pull request is merged", async () => {
    await useProjectRoot("resolve-handles-gh-failure");

    mockGhFailure();

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "resolve me",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const resolveResponse = await app.request(
      resolveTaskResolvePath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: "ship it",
        }),
      },
    );

    expect(resolveResponse.status).toBe(400);

    const payload = await resolveResponse.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    expect(payload.message).toContain("Could not confirm");
  });

  it("logs task_resolved with a truncated result preview after repository success", async () => {
    await useProjectRoot("logs-task-resolved");

    mockGhPullRequestOutput(ghMergedPullRequestOutput);

    const logger = createLogger();
    const app = createTaskRouteApp({ logger });
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        session_id: "session-7",
        task_spec: "resolve me",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const longResult = "x".repeat(250);
    const resolveResponse = await app.request(
      resolveTaskResolvePath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: longResult,
        }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    expect(logger.info).toHaveBeenCalledWith({
      event: "task_resolved",
      project_id: mainProjectId,
      result_preview: longResult.slice(0, 200),
      session_id: "session-7",
      status: "resolved",
      task_id: createdTask.task_id,
    });
  });

  it("triggers a scheduler scan opportunity after resolve succeeds", async () => {
    await useProjectRoot("resolve-triggers-scheduler-scan");

    mockGhPullRequestOutput(ghMergedPullRequestOutput);

    const onTaskResolved = vi.fn();
    const app = createTaskRouteApp({ onTaskResolved });
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "resolve me",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const resolveResponse = await app.request(
      resolveTaskResolvePath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: "ship it",
        }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    await vi.waitFor(() =>
      expect(onTaskResolved).toHaveBeenCalledWith({
        taskId: createdTask.task_id,
        type: "task_resolved",
      }),
    );
    expect(onTaskResolved).toHaveBeenCalledTimes(1);
  });

  it("keeps resolve successful and logs when the scheduler scan trigger fails", async () => {
    await useProjectRoot("resolve-scheduler-scan-fails");

    mockGhPullRequestOutput(ghMergedPullRequestOutput);

    const logger = createLogger();
    const error = new Error("scan failed");
    const app = createTaskRouteApp({
      logger,
      onTaskResolved: vi.fn().mockRejectedValue(error),
    });
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "resolve me",
        project_id: mainProjectId,
        pull_request_url: "https://github.com/example/repo/pull/42",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const resolveResponse = await app.request(
      resolveTaskResolvePath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: "ship it",
        }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        { err: error, taskId: createdTask.task_id },
        "Task scheduler scan trigger failed after task resolve",
      ),
    );
  });

  it("rejects a task and persists the failed result", async () => {
    await useProjectRoot("rejects-task");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "reject me",
        project_id: mainProjectId,
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const rejectResponse = await app.request(
      resolveTaskRejectPath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: "needs more work",
        }),
      },
    );

    expect(rejectResponse.status).toBe(204);
    await expect(rejectResponse.text()).resolves.toBe("");

    const detailResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
    );

    expect(detailResponse.status).toBe(200);

    const rejectedTask = await detailResponse.json();

    expect(rejectedTask.status).toBe("rejected");
    expect(rejectedTask.done).toBe(true);
    expect(rejectedTask.result).toBe("needs more work");
  });

  it("logs task_rejected with a truncated result preview after repository success", async () => {
    await useProjectRoot("logs-task-rejected");

    const logger = createLogger();
    const app = createTaskRouteApp({ logger });
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        project_id: mainProjectId,
        session_id: "session-8",
        task_spec: "reject me",
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const longResult = "needs more work ".repeat(20);
    const rejectResponse = await app.request(
      resolveTaskRejectPath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: longResult,
        }),
      },
    );

    expect(rejectResponse.status).toBe(204);
    expect(logger.info).toHaveBeenCalledWith({
      event: "task_rejected",
      project_id: mainProjectId,
      result_preview: longResult.slice(0, 200),
      session_id: "session-8",
      status: "rejected",
      task_id: createdTask.task_id,
    });
  });

  it("does not trigger a scheduler scan opportunity after reject succeeds", async () => {
    await useProjectRoot("reject-does-not-trigger-scheduler-scan");

    const onTaskResolved = vi.fn();
    const app = createTaskRouteApp({ onTaskResolved });
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "reject me",
        project_id: mainProjectId,
        status: "processing",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const rejectResponse = await app.request(
      resolveTaskRejectPath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: "needs more work",
        }),
      },
    );

    expect(rejectResponse.status).toBe(204);
    expect(onTaskResolved).not.toHaveBeenCalled();
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

  it("returns a shared validation error for invalid resolve payloads", async () => {
    await useProjectRoot("invalid-resolve-payload");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "resolve validation target",
        project_id: mainProjectId,
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();

    for (const body of [
      JSON.stringify({}),
      JSON.stringify({ result: "" }),
      JSON.stringify({ result: "   " }),
      "{",
    ]) {
      const response = await app.request(
        resolveTaskResolvePath(createdTask.task_id),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body,
        },
      );

      expect(response.status).toBe(400);

      const payload = await response.json();

      expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
        true,
      );
      expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    }
  });

  it("returns a shared validation error for invalid reject payloads", async () => {
    await useProjectRoot("invalid-reject-payload");

    const app = createTaskRouteApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "reject validation target",
        project_id: mainProjectId,
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();

    for (const body of [
      JSON.stringify({}),
      JSON.stringify({ result: "" }),
      JSON.stringify({ result: "   " }),
      "{",
    ]) {
      const response = await app.request(
        resolveTaskRejectPath(createdTask.task_id),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body,
        },
      );

      expect(response.status).toBe(400);

      const payload = await response.json();

      expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
        true,
      );
      expect(payload.code).toBe("TASK_VALIDATION_ERROR");
    }
  });

  it("does not log success events for invalid reject payloads", async () => {
    await useProjectRoot("invalid-reject-does-not-log");

    const logger = createLogger();
    const app = createTaskRouteApp({ logger });
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Test task",
        task_spec: "reject validation target",
        project_id: mainProjectId,
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();
    const response = await app.request(
      resolveTaskRejectPath(createdTask.task_id),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(400);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "task_created" }),
    );
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

  it("returns a shared not found error for resolving a missing task", async () => {
    await useProjectRoot("missing-resolve-target");

    const app = createTaskRouteApp();
    const response = await app.request(resolveTaskResolvePath("task-404"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        result: "ship it",
      }),
    });

    expect(response.status).toBe(404);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_NOT_FOUND");
  });

  it("does not log success events when resolve returns not found", async () => {
    await useProjectRoot("missing-resolve-does-not-log");

    const logger = createLogger();
    const app = createTaskRouteApp({ logger });
    const response = await app.request(resolveTaskResolvePath("task-404"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        result: "ship it",
      }),
    });

    expect(response.status).toBe(404);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns a shared not found error for rejecting a missing task", async () => {
    await useProjectRoot("missing-reject-target");

    const app = createTaskRouteApp();
    const response = await app.request(resolveTaskRejectPath("task-404"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        result: "needs more work",
      }),
    });

    expect(response.status).toBe(404);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_NOT_FOUND");
  });

  it("does not log success events when reject returns not found", async () => {
    await useProjectRoot("missing-reject-does-not-log");

    const logger = createLogger();
    const app = createTaskRouteApp({ logger });
    const response = await app.request(resolveTaskRejectPath("task-404"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        result: "needs more work",
      }),
    });

    expect(response.status).toBe(404);
    expect(logger.info).not.toHaveBeenCalled();
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
