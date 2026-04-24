import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

import { afterEach, describe, expect, it, vi } from "vitest";
import * as contractModule from "../../contract/src/index.js";
import * as apiModule from "../src/app.js";

const taskRouteSourceUrl = new URL("../src/routes/tasks.ts", import.meta.url);
const appSourceUrl = new URL("../src/app.ts", import.meta.url);
const routesTempRoot = join(process.cwd(), ".tmp", "modules-api-task-routes");

let previousProjectRoot: string | undefined;

const createLogger = () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
});

const resolveTaskByIdPath = (taskId: string) =>
  contractModule.taskByIdPath.replace("{taskId}", taskId);

const resolveTaskSpecPath = (taskId: string) =>
  contractModule.taskSpecPath.replace("{taskId}", taskId);

const resolveTaskResolvePath = (taskId: string) =>
  contractModule.taskResolvePath.replace("{taskId}", taskId);

const resolveTaskRejectPath = (taskId: string) =>
  contractModule.taskRejectPath.replace("{taskId}", taskId);

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;

  return projectRoot;
};

const createProjectRoot = async (name: string) => {
  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
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

describe("task routes", () => {
  it("rejects POST /tasks when project_path is missing", async () => {
    await useProjectRoot("rejects-missing-project-path");

    const app = apiModule.createApp();
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
    const app = apiModule.createApp({ logger });
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

    const app = apiModule.createApp();
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_path: "/repo/main",
        task_spec: "write sqlite-backed route tests",
      }),
    });

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
  });

  it("persists required title and developer model fields when creating a task", async () => {
    await useProjectRoot("persists-developer-model-fields");

    const app = apiModule.createApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        project_path: "/repo/main",
        task_spec: "write sqlite-backed route tests",
        title: "SQLite route tests",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();

    expect(createdTask).toMatchObject({
      developer_model_id: "claude-sonnet-4-5",
      developer_provider_id: "anthropic",
      title: "SQLite route tests",
    });
  });

  it("persists a created task and reads the same record through both GET routes", async () => {
    await useProjectRoot("persists-create-and-read");

    const app = apiModule.createApp();
    const projectPath = "/repo/main";
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "write sqlite-backed route tests",
        project_path: projectPath,
        session_id: "session-1",
        dependencies: ["task-0"],
        status: "running",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdTask = await createResponse.json();

    expect(contractModule.taskSchema.safeParse(createdTask).success).toBe(true);
    expect(createdTask.task_spec).toBe("write sqlite-backed route tests");
    expect(createdTask.project_path).toBe(projectPath);
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

  it("returns the raw task spec markdown for GET /tasks/{taskId}/spec", async () => {
    await useProjectRoot("reads-task-spec");

    const app = apiModule.createApp();
    const taskSpec = "# Task Spec\n\nShip the endpoint.";
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: taskSpec,
        project_path: "/repo/task-spec",
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

    const app = apiModule.createApp();
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
    const app = apiModule.createApp({ logger });
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        project_path: "/repo/main",
        session_id: "session-1",
        status: "running",
        task_spec: "write sqlite-backed route tests",
      }),
    });

    expect(response.status).toBe(201);

    const createdTask = await response.json();

    expect(logger.info).toHaveBeenCalledWith({
      event: "task_created",
      project_path: "/repo/main",
      session_id: "session-1",
      status: "running",
      task_id: createdTask.task_id,
    });
  });

  it("binds task storage to the project root present when the app is created", async () => {
    const appProjectRoot = await useProjectRoot("app-project-root");
    const requestProjectRoot = await createProjectRoot("request-project-root");
    const app = apiModule.createApp();

    process.env.AIM_PROJECT_ROOT = requestProjectRoot;

    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "stays on app root",
        project_path: "/repo/app-root",
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

    const app = apiModule.createApp();

    const firstCreateResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "keep running",
        project_path: "/repo/session-a/running",
        session_id: "session-a",
        status: "running",
      }),
    });
    const secondCreateResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "already done",
        project_path: "/repo/session-a/done",
        session_id: "session-a",
        status: "failed",
      }),
    });
    const thirdCreateResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "different session",
        project_path: "/repo/session-b/running",
        session_id: "session-b",
        status: "running",
      }),
    });

    expect(firstCreateResponse.status).toBe(201);
    expect(secondCreateResponse.status).toBe(201);
    expect(thirdCreateResponse.status).toBe(201);

    const statusFilteredResponse = await app.request(
      `${contractModule.tasksPath}?status=running`,
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
      statusFilteredPayload.items.every((task) => task.status === "running"),
    ).toBe(true);

    expect(
      contractModule.taskListResponseSchema.safeParse(doneFilteredPayload)
        .success,
    ).toBe(true);
    expect(doneFilteredPayload.items).toHaveLength(1);
    expect(doneFilteredPayload.items[0].task_spec).toBe("already done");
    expect(doneFilteredPayload.items[0].status).toBe("failed");
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

    const app = apiModule.createApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "before patch",
        project_path: "/repo/patch-target",
        session_id: "session-7",
        dependencies: ["task-a"],
        status: "running",
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
          status: "failed",
        }),
      },
    );

    expect(patchResponse.status).toBe(200);

    const patchedTask = await patchResponse.json();

    expect(contractModule.taskSchema.safeParse(patchedTask).success).toBe(true);
    expect(patchedTask.task_id).toBe(createdTask.task_id);
    expect(patchedTask.task_spec).toBe("after patch");
    expect(patchedTask.project_path).toBe("/repo/patch-target");
    expect(patchedTask.session_id).toBe("session-7");
    expect(patchedTask.dependencies).toEqual(["task-a"]);
    expect(patchedTask.pull_request_url).toBe("https://example.test/pr/7");
    expect(patchedTask.status).toBe("failed");
    expect(patchedTask.done).toBe(true);

    const detailResponse = await app.request(
      resolveTaskByIdPath(createdTask.task_id),
    );

    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toEqual(patchedTask);
  });

  it("patches nullable fields back to null", async () => {
    await useProjectRoot("patches-nullable-fields");

    const app = apiModule.createApp();
    const projectPath = "/repo/null-fields";
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "clear patch fields",
        project_path: projectPath,
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
    expect(patchedTask.project_path).toBe(projectPath);
    expect(patchedTask.worktree_path).toBeNull();
    expect(patchedTask.pull_request_url).toBeNull();
  });

  it("resolves a task and preserves the result when PATCH omits it", async () => {
    await useProjectRoot("resolves-task-and-preserves-result");

    const app = apiModule.createApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "resolve me",
        project_path: "/repo/resolve-target",
        status: "running",
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

    expect(resolvedTask.status).toBe("succeeded");
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
    expect(patchedTask.status).toBe("succeeded");
    expect(patchedTask.done).toBe(true);
    expect(patchedTask.result).toBe("ship it");
  });

  it("logs task_resolved with a truncated result preview after repository success", async () => {
    await useProjectRoot("logs-task-resolved");

    const logger = createLogger();
    const app = apiModule.createApp({ logger });
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        project_path: "/repo/resolve-target",
        session_id: "session-7",
        task_spec: "resolve me",
        status: "running",
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
      project_path: "/repo/resolve-target",
      result_preview: longResult.slice(0, 200),
      session_id: "session-7",
      status: "succeeded",
      task_id: createdTask.task_id,
    });
  });

  it("rejects a task and persists the failed result", async () => {
    await useProjectRoot("rejects-task");

    const app = apiModule.createApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "reject me",
        project_path: "/repo/reject-target",
        status: "running",
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

    expect(rejectedTask.status).toBe("failed");
    expect(rejectedTask.done).toBe(true);
    expect(rejectedTask.result).toBe("needs more work");
  });

  it("logs task_rejected with a truncated result preview after repository success", async () => {
    await useProjectRoot("logs-task-rejected");

    const logger = createLogger();
    const app = apiModule.createApp({ logger });
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        project_path: "/repo/reject-target",
        session_id: "session-8",
        task_spec: "reject me",
        status: "running",
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
      project_path: "/repo/reject-target",
      result_preview: longResult.slice(0, 200),
      session_id: "session-8",
      status: "failed",
      task_id: createdTask.task_id,
    });
  });

  it("rejects PATCH /tasks/{id} when project_path is present", async () => {
    await useProjectRoot("rejects-project-path-patch");

    const app = apiModule.createApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "patch validation target",
        project_path: "/repo/original",
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
          project_path: "/repo/other",
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

    const app = apiModule.createApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "delete me",
        project_path: "/repo/delete-me",
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

    const app = apiModule.createApp();
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

    const app = apiModule.createApp();
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

    const app = apiModule.createApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "patch validation target",
        project_path: "/repo/invalid-patch",
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

    const app = apiModule.createApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "resolve validation target",
        project_path: "/repo/invalid-resolve",
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

    const app = apiModule.createApp();
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "reject validation target",
        project_path: "/repo/invalid-reject",
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
    const app = apiModule.createApp({ logger });
    const createResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        title: "Test task",
        task_spec: "reject validation target",
        project_path: "/repo/invalid-reject",
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

    const app = apiModule.createApp();
    const response = await app.request(resolveTaskByIdPath("task-404"), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "running",
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

    const app = apiModule.createApp();
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
    const app = apiModule.createApp({ logger });
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

    const app = apiModule.createApp();
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
    const app = apiModule.createApp({ logger });
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

    const app = apiModule.createApp();
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

    const app = apiModule.createApp();
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
