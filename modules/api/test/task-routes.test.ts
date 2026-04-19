import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const apiEntryUrl = new URL("../dist/app.mjs", import.meta.url);
const contractEntryUrl = new URL(
  "../../contract/dist/index.mjs",
  import.meta.url,
);
const taskRouteSourceUrl = new URL("../src/routes/tasks.ts", import.meta.url);

type ApiPackageModule = typeof import("../src/app.js");
type ContractPackageModule = typeof import("../../contract/src/index.js");

let apiModule: ApiPackageModule;
let contractModule: ContractPackageModule;

const resolveTaskByIdPath = (taskId: string) =>
  contractModule.taskByIdPath.replace("{taskId}", taskId);

beforeAll(async () => {
  apiModule = (await import(
    pathToFileURL(fileURLToPath(apiEntryUrl)).href
  )) as ApiPackageModule;
  contractModule = (await import(
    pathToFileURL(fileURLToPath(contractEntryUrl)).href
  )) as ContractPackageModule;
});

describe("task routes", () => {
  it("creates a stub task from the shared contract", async () => {
    const app = apiModule.createApp();
    const response = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        task_spec: "write task route tests",
        status: "succeeded",
      }),
    });

    expect(response.status).toBe(201);

    const payload = await response.json();

    expect(contractModule.taskSchema.safeParse(payload).success).toBe(true);
    expect(payload.task_spec).toBe("write task route tests");
    expect(payload.status).toBe("succeeded");
    expect(payload.done).toBe(true);
  });

  it("returns a shared validation error for an invalid create payload", async () => {
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

  it("lists stub tasks from the shared contract", async () => {
    const app = apiModule.createApp();
    const response = await app.request(contractModule.tasksPath);

    expect(response.status).toBe(200);

    const payload = await response.json();

    expect(
      contractModule.taskListResponseSchema.safeParse(payload).success,
    ).toBe(true);
    expect(payload.items).toHaveLength(1);
  });

  it("returns a shared validation error for invalid list filters", async () => {
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

  it("returns a shared not found error for the missing stub task", async () => {
    const app = apiModule.createApp();
    const response = await app.request(resolveTaskByIdPath("task-404"));

    expect(response.status).toBe(404);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_NOT_FOUND");
  });

  it("returns a stub task by id from the shared contract", async () => {
    const app = apiModule.createApp();
    const response = await app.request(resolveTaskByIdPath("task-123"));

    expect(response.status).toBe(200);

    const payload = await response.json();

    expect(contractModule.taskSchema.safeParse(payload).success).toBe(true);
    expect(payload.task_id).toBe("task-123");
  });

  it("patches the stub task and derives done from the final status", async () => {
    const app = apiModule.createApp();
    const response = await app.request(resolveTaskByIdPath("task-123"), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        task_spec: "patched spec",
        status: "failed",
      }),
    });

    expect(response.status).toBe(200);

    const payload = await response.json();

    expect(contractModule.taskSchema.safeParse(payload).success).toBe(true);
    expect(payload.task_id).toBe("task-123");
    expect(payload.task_spec).toBe("patched spec");
    expect(payload.status).toBe("failed");
    expect(payload.done).toBe(true);
  });

  it("returns a shared validation error for an invalid patch payload", async () => {
    const app = apiModule.createApp();
    const response = await app.request(resolveTaskByIdPath("task-123"), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "not-a-status",
      }),
    });

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.code).toBe("TASK_VALIDATION_ERROR");
  });

  it("returns a shared not found error for patching the missing stub task", async () => {
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

  it("deletes the stub task with an empty response body", async () => {
    const app = apiModule.createApp();
    const response = await app.request(resolveTaskByIdPath("task-123"), {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });

  it("returns a shared not found error for deleting the missing stub task", async () => {
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

  it("keeps task route implementation on the public contract boundary", async () => {
    const source = await readFile(taskRouteSourceUrl, "utf8");

    expect(source).toContain('from "@aim-ai/contract"');
    expect(source).not.toContain("contract/generated");
  });
});
