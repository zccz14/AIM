# Task Result Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 Task API 增加持久化 `result` 字段，以及对称的 `POST /tasks/{taskId}/resolve` / `POST /tasks/{taskId}/reject` 终态上报入口，同时保持 `PATCH /tasks/{taskId}` 在省略 `result` 时继续执行真正的部分更新。

**Architecture:** 继续沿用仓库当前的 contract-first 结构：先在 `modules/contract/openapi/openapi.yaml` 扩展 Task schema、请求体和两个动作型子路径，再刷新 generated 产物并把新的 path/schema/client 边界暴露给 API 与调用方。API 侧保持现有 `task-repository.ts` 的“先读当前行，再合并，再整体落库”模式，只新增 `result` 持久化列和两个很薄的 route handler；验证重点放在 contract 包测试、repository SQLite 测试、route 黑盒 HTTP 测试，以及文档与 skill 文案同步。

**Tech Stack:** OpenAPI 3.1 YAML、TypeScript、Zod、Hono、Node.js `sqlite`、Vitest、pnpm workspace

---

## 文件结构与职责映射

**修改文件**
- `modules/contract/openapi/openapi.yaml`：为 `Task` / `CreateTaskRequest` / `PatchTaskRequest` 增加 `result`，新增 `TaskResultRequest` schema，以及 `POST /tasks/{taskId}/resolve`、`POST /tasks/{taskId}/reject` 的 204/400/404 contract。
- `modules/contract/src/openapi.ts`：新增 `taskResolvePath`、`taskRejectPath` 常量，保持 API 与 tests 不手写字符串路径。
- `modules/contract/src/index.ts`：导出 `taskResultRequestSchema` 和新增 path 常量，确保公共边界完整。
- `modules/contract/src/client.ts`：新增 `resolveTaskById()` / `rejectTaskById()` 包装方法，成功时返回 `Promise<void>`，失败时继续抛 `ContractClientError`。
- `modules/contract/test/contract-package.test.ts`：先写失败测试，锁定新 schema、path、OpenAPI 操作、client 边界和 `result` 字段约束。
- `modules/contract/generated/openapi.ts`
- `modules/contract/generated/types.ts`
- `modules/contract/generated/client.ts`
- `modules/contract/generated/zod.ts`
- `modules/contract/generated/_client/**`
- `modules/contract/generated/_types/**`
- `modules/api/src/task-repository.ts`：给 SQLite schema、行映射、创建、更新与专用终态写入增加 `result` 支持，并保持 PATCH 省略 `result` 时不覆盖已有值。
- `modules/api/src/routes/tasks.ts`：新增 `parseTaskResultRequest()`，注册 `/resolve` 与 `/reject` 路由，并复用既有错误模型返回 400/404/204。
- `modules/api/test/task-repository.test.ts`：锁定 `TEXT NOT NULL DEFAULT ''`、create 默认空字符串、PATCH 省略 `result` 保持原值、resolve/reject 写入结果并切换终态。
- `modules/api/test/task-routes.test.ts`：锁定新 endpoint 的 204/400/404 行为、结果文本必填非空约束，以及现有 PATCH 在省略 `result` 时的保值语义。
- `docs/task-model.md`：把 `result` 加入 Task 数据模型与字段说明。
- `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`：把终态上报说明从“只用 PATCH”更新为“非终态仍用 PATCH，终态结果上报改用 resolve/reject 且必须提交非空 `result`”。

**预期不修改文件**
- `modules/api/src/app.ts`：现有 `registerTaskRoutes(app)` 已经统一承载 Task 路由，无需额外注册文件。
- `modules/web/**`、`modules/cli/**`：本 spec 只要求服务端 contract、持久化、route 和文档同步，不扩展到新的前端/CLI 入口。
- `docs/task-planning.md`：该文档聚焦规划方法，不描述 Task API 字段与终态上报协议。

**只读参考文件**
- `docs/superpowers/specs/2026-04-21-task-result-endpoints-design.md`：唯一 scope 来源，后续实现不得扩展到通用状态机重构、历史数据迁移或新的错误码。
- `modules/api/src/routes/tasks.ts`：现有 PATCH/GET/POST/DELETE 错误处理模式参考，新端点应继续沿用 `taskErrorSchema`。
- `modules/api/src/task-repository.ts`：现有 SQLite schema 校验、读-合并-写更新模式参考。
- `modules/api/test/task-routes.test.ts`：现有 route 黑盒测试组织方式参考。
- `modules/api/test/task-repository.test.ts`：现有 repository SQLite 断言风格参考。

## 实施约束

- `Task.result` 必须是非空 schema 字段对应的非 nullable string；SQLite 列定义必须是 `TEXT NOT NULL DEFAULT ''`，create 路径默认写入空字符串。
- `POST /tasks/{taskId}/resolve` 与 `POST /tasks/{taskId}/reject` 的 request body 都只能接受 `{ "result": string }`，并且该字符串必须通过非空校验；空字符串、空白字符串、缺字段、非 JSON body 都必须返回 `400` + `TASK_VALIDATION_ERROR`。
- `resolve` 只能把状态写成 `succeeded`，`reject` 只能把状态写成 `failed`；两个接口成功时统一返回 `204 No Content`，不要返回 Task JSON。
- `PATCH /tasks/{taskId}` 继续可用；当 payload 省略 `result` 时必须保留当前值，只有显式提供 `result` 时才更新它。
- 任务不存在、路径参数缺失或请求体验证失败时，继续沿用既有 `TASK_NOT_FOUND` / `TASK_VALIDATION_ERROR` 错误模型，不引入新的错误 code。
- contract 侧 generated 文件只能通过现有生成脚本刷新，不手写 generated 产物。

### Task 1: 扩展 Task contract 与公共 client 边界

**Files:**
- Modify: `modules/contract/test/contract-package.test.ts`
- Modify: `modules/contract/openapi/openapi.yaml`
- Modify: `modules/contract/src/openapi.ts`
- Modify: `modules/contract/src/index.ts`
- Modify: `modules/contract/src/client.ts`
- Modify: `modules/contract/generated/openapi.ts`
- Modify: `modules/contract/generated/types.ts`
- Modify: `modules/contract/generated/client.ts`
- Modify: `modules/contract/generated/zod.ts`
- Modify: `modules/contract/generated/_client/**`
- Modify: `modules/contract/generated/_types/**`

- [ ] **Step 1: 先在 contract 包测试里锁定新 schema、path 和 client 边界**

在 `modules/contract/test/contract-package.test.ts` 追加失败断言，至少覆盖 `result` 字段、新 path 常量、新 request schema 与 client 方法。示例：

```ts
it("exports task result paths and schemas from the built package boundary", () => {
  expect(contractModule.taskResolvePath).toBe("/tasks/{taskId}/resolve");
  expect(contractModule.taskRejectPath).toBe("/tasks/{taskId}/reject");
  expect(
    contractModule.taskResultRequestSchema.parse({ result: "final summary" }),
  ).toEqual({ result: "final summary" });
  expect(() =>
    contractModule.taskResultRequestSchema.parse({ result: "" }),
  ).toThrow();
  expect(
    contractModule.taskSchema.parse({
      task_id: "task-1",
      task_spec: "Ship result endpoint",
      project_path: "/repo",
      session_id: null,
      worktree_path: null,
      pull_request_url: null,
      dependencies: [],
      result: "",
      done: false,
      status: "running",
      created_at: "2026-04-21T00:00:00.000Z",
      updated_at: "2026-04-21T00:00:00.000Z",
    }).result,
  ).toBe("");
});

it("publishes resolve and reject task operations in the shared OpenAPI document", () => {
  const resolvePathItem = contractModule.openApiDocument.paths[
    contractModule.taskResolvePath
  ];
  const rejectPathItem = contractModule.openApiDocument.paths[
    contractModule.taskRejectPath
  ];

  expect(resolvePathItem?.post?.responses["204"]).toBeDefined();
  expect(rejectPathItem?.post?.responses["204"]).toBeDefined();
  expect(
    resolvePathItem?.post?.requestBody?.content?.["application/json"]?.schema,
  ).toEqual({ $ref: "#/components/schemas/TaskResultRequest" });
  expect(
    rejectPathItem?.post?.responses["404"]?.content?.["application/json"]
      ?.schema,
  ).toEqual({ $ref: "#/components/schemas/ErrorResponse" });
});
```

并补一条 client 公开边界断言：

```ts
expectTypeOf(contractModule.createContractClient({ fetch })).toMatchTypeOf<{
  resolveTaskById(taskId: string, input: { result: string }): Promise<void>;
  rejectTaskById(taskId: string, input: { result: string }): Promise<void>;
}>();
```

- [ ] **Step 2: 运行 contract 定向测试，确认新增断言先失败**

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "result paths|resolve and reject task operations"`

Expected: FAIL，提示 `taskResolvePath` / `taskRejectPath` / `taskResultRequestSchema` 尚未导出，且 OpenAPI document 里还没有 `/tasks/{taskId}/resolve` 与 `/tasks/{taskId}/reject`。

- [ ] **Step 3: 在 OpenAPI contract 中定义 `result` 字段、新请求体和两个终态子路径**

在 `modules/contract/openapi/openapi.yaml` 中做最小增量修改：

```yaml
  /tasks/{taskId}/resolve:
    post:
      operationId: resolveTaskById
      summary: Resolve a task with a final result
      parameters:
        - $ref: "#/components/parameters/TaskIdPathParameter"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/TaskResultRequest"
      responses:
        "204":
          description: Task resolved
        "400":
          description: Invalid task result payload
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "404":
          description: Task not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
  /tasks/{taskId}/reject:
    post:
      operationId: rejectTaskById
      summary: Reject a task with a final result
      parameters:
        - $ref: "#/components/parameters/TaskIdPathParameter"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/TaskResultRequest"
      responses:
        "204":
          description: Task rejected
```

同时把 `result` 加到三个 schema：

```yaml
    Task:
      required:
        - result
      properties:
        result:
          type: string
    CreateTaskRequest:
      properties:
        result:
          type: string
          default: ""
    PatchTaskRequest:
      properties:
        result:
          type: string
    TaskResultRequest:
      type: object
      additionalProperties: false
      required:
        - result
      properties:
        result:
          type: string
          minLength: 1
          pattern: ".*\\S.*"
```

- [ ] **Step 4: 刷新 contract 导出与 generated 产物**

在 `modules/contract/src/openapi.ts` 增加稳定 path 常量：

```ts
export const healthPath = "/health";
export const tasksPath = "/tasks";
export const taskByIdPath = "/tasks/{taskId}";
export const taskResolvePath = "/tasks/{taskId}/resolve";
export const taskRejectPath = "/tasks/{taskId}/reject";
```

在 `modules/contract/src/index.ts` 暴露新 schema 与 path：

```ts
export {
  healthPath,
  openApiDocument,
  taskByIdPath,
  taskRejectPath,
  taskResolvePath,
  tasksPath,
} from "./openapi.js";

export const taskResultRequestSchema = schemas.TaskResultRequest;
export type TaskResultRequest = Infer<typeof taskResultRequestSchema>;
```

在 `modules/contract/src/client.ts` 先把 generated operation import 改成别名，再加两个包装方法：

```ts
import {
  rejectTaskById as rejectTaskByIdOperation,
  resolveTaskById as resolveTaskByIdOperation,
} from "../generated/client.js";

type ContractClient = {
  resolveTaskById(taskId: string, input: TaskResultRequest): Promise<void>;
  rejectTaskById(taskId: string, input: TaskResultRequest): Promise<void>;
};

async resolveTaskById(taskId, input) {
  const result = await resolveTaskByIdOperation({
    body: input,
    client,
    headers: { accept: "application/json" },
    path: { taskId },
  });

  if (result.error) {
    throw new ContractClientError(
      result.response.status,
      taskErrorSchema.parse(result.error satisfies ResolveTaskByIdError),
    );
  }
}
```

然后运行：`pnpm --filter @aim-ai/contract run generate`

Expected: PASS，`generated/openapi.ts`、`generated/types.ts`、`generated/client.ts`、`generated/zod.ts` 以及 `generated/_client/**`、`generated/_types/**` 都刷新出新的 `TaskResultRequest` / `ResolveTaskById*` / `RejectTaskById*` 产物。

- [ ] **Step 5: 重新运行 contract 测试，确认 contract 边界达标**

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "task result|resolve and reject task operations|exports task paths and task schemas"`

Expected: PASS，说明公共边界、OpenAPI 路径、schema 与 generated client 已经对齐。

- [ ] **Step 6: 提交 contract 基线**

```bash
git add modules/contract/test/contract-package.test.ts modules/contract/openapi/openapi.yaml modules/contract/src/openapi.ts modules/contract/src/index.ts modules/contract/src/client.ts modules/contract/generated/openapi.ts modules/contract/generated/types.ts modules/contract/generated/client.ts modules/contract/generated/zod.ts modules/contract/generated/_client modules/contract/generated/_types
git commit -m "feat: add task result contract endpoints"
```

### Task 2: 扩展 repository 持久化 `result` 并保持 PATCH 省略语义

**Files:**
- Modify: `modules/api/test/task-repository.test.ts`
- Modify: `modules/api/src/task-repository.ts`

- [ ] **Step 1: 先写 repository 失败测试，锁定 schema、默认值和终态写入行为**

在 `modules/api/test/task-repository.test.ts` 追加四组断言。示例：

```ts
it("stores result as a non-null text column with default empty string", async () => {
  const projectRoot = await createProjectRoot("stores-result-column");
  process.env.AIM_PROJECT_ROOT = projectRoot;

  const repository = createTaskRepository();
  const createdTask = await repository.createTask({
    task_spec: "capture final result",
    project_path: "/repo/result-column",
  });
  const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
  const columns = database.prepare("PRAGMA table_info(tasks)").all() as Array<{
    dflt_value: null | string;
    name: string;
    notnull: 0 | 1;
    type: string;
  }>;

  expect(createdTask.result).toBe("");
  expect(columns).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "result",
        notnull: 1,
        type: "TEXT",
        dflt_value: "''",
      }),
    ]),
  );
});

it("keeps the existing result when PATCH omits result", async () => {
  const updatedTask = await repository.updateTask(task.task_id, {
    status: "outbound",
  });

  expect(updatedTask?.result).toBe("existing summary");
});

it("updates the result only when PATCH explicitly provides it", async () => {
  await expect(
    repository.updateTask(task.task_id, { result: "revised summary" }),
  ).resolves.toMatchObject({ result: "revised summary", status: task.status });
});

it("resolves and rejects tasks with a persisted final result", async () => {
  await expect(repository.resolveTask(task.task_id, "done summary")).resolves
    .toMatchObject({ status: "succeeded", done: true, result: "done summary" });
  await expect(repository.rejectTask(task.task_id, "failure summary")).resolves
    .toMatchObject({ status: "failed", done: true, result: "failure summary" });
});
```

- [ ] **Step 2: 运行 repository 定向测试，确认基线先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api --testNamePattern "result column|PATCH omits result|resolves and rejects tasks"`

Expected: FAIL，提示 `result` 字段不存在，或 `resolveTask` / `rejectTask` 方法尚未实现。

- [ ] **Step 3: 在 SQLite schema、行映射和创建路径中加入 `result` 默认值**

修改 `modules/api/src/task-repository.ts` 的 row type、schema 约束和建表 SQL：

```ts
type TaskRow = {
  // ...
  result: string;
  // ...
};

const requiredColumns = [
  // ...
  { name: "result", notnull: 1, pk: 0, type: "TEXT" },
  // ...
] as const;

database.exec(`
  CREATE TABLE IF NOT EXISTS ${tasksTableName} (
    task_id TEXT PRIMARY KEY,
    task_spec TEXT NOT NULL,
    project_path TEXT NOT NULL,
    session_id TEXT,
    worktree_path TEXT,
    pull_request_url TEXT,
    dependencies TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
```

并在 `mapTaskRow()` / `createTask()` 中显式传递 `result`：

```ts
result: row.result,

result: input.result ?? "",
```

- [ ] **Step 4: 保持 PATCH 省略 `result` 时不覆盖，并新增对称终态写入方法**

把 `updateTask()` 改成只在 patch 显式携带 `result` 时才覆盖：

```ts
const updatedTask = taskSchema.parse({
  ...currentTask,
  ...patch,
  result:
    Object.hasOwn(patch, "result") && patch.result !== undefined
      ? patch.result
      : currentTask.result,
  task_id: currentTask.task_id,
  done: isDoneStatus(nextStatus),
  status: nextStatus,
  updated_at: new Date().toISOString(),
});
```

先抽一个本地读取 helper，再供 `getTaskById()`、`updateTask()`、`resolveTask()` / `rejectTask()` 复用：

```ts
const readTaskSnapshot = (taskId: string) => {
  const row = getTaskByIdStatement.get(taskId) as TaskRow | undefined;

  return row ? mapTaskRow(row) : null;
};

const updateTaskResultStatus = async (
  taskId: string,
  status: "failed" | "succeeded",
  result: string,
) => {
  const currentTask = readTaskSnapshot(taskId);

  if (!currentTask) {
    return null;
  }

  const updatedTask = taskSchema.parse({
    ...currentTask,
    done: true,
    result,
    status,
    updated_at: new Date().toISOString(),
  });

  updateTaskStatement.run(
    updatedTask.task_spec,
    updatedTask.session_id,
    updatedTask.worktree_path,
    updatedTask.pull_request_url,
    JSON.stringify(updatedTask.dependencies),
    updatedTask.result,
    Number(updatedTask.done),
    updatedTask.status,
    updatedTask.updated_at,
    taskId,
  );

  return updatedTask;
};
```

然后把公共方法改成直接委托这个 helper：

```ts
getTaskById(taskId: string): Promise<null | Task> {
  return Promise.resolve(readTaskSnapshot(taskId));
},
resolveTask(taskId: string, result: string) {
  return updateTaskResultStatus(taskId, "succeeded", result);
},
rejectTask(taskId: string, result: string) {
  return updateTaskResultStatus(taskId, "failed", result);
},
```

注意同步给 `insertTaskStatement`、`get/list` SELECT、`updateTaskStatement` 增加 `result` 列位次。

- [ ] **Step 5: 重新运行 repository 测试，确认持久化语义正确**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-repository.test.ts`

Expected: PASS，尤其要看到 create 默认 `result = ''`、PATCH 省略时保值、resolve/reject 会把 `done` 置为 `true` 并持久化结果文本。

- [ ] **Step 6: 提交 repository 基线**

```bash
git add modules/api/test/task-repository.test.ts modules/api/src/task-repository.ts
git commit -m "feat: persist task final result"
```

### Task 3: 新增 resolve/reject 路由并补齐 HTTP 黑盒测试

**Files:**
- Modify: `modules/api/test/task-routes.test.ts`
- Modify: `modules/api/src/routes/tasks.ts`

- [ ] **Step 1: 先写 route 失败测试，锁定 204/400/404 和 PATCH 保值语义**

在 `modules/api/test/task-routes.test.ts` 追加四组测试。示例：

```ts
const resolveTaskPath = (taskId: string) =>
  contractModule.taskResolvePath.replace("{taskId}", taskId);
const rejectTaskPath = (taskId: string) =>
  contractModule.taskRejectPath.replace("{taskId}", taskId);

it("resolves a task with a non-empty final result and returns 204", async () => {
  const response = await app.request(resolveTaskPath(createdTask.task_id), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result: "merged successfully" }),
  });

  expect(response.status).toBe(204);
  await expect(response.text()).resolves.toBe("");
  await expect(app.request(resolveTaskByIdPath(createdTask.task_id))).resolves
    .toMatchObject({ status: 200 });
});

it("rejects resolve and reject payloads when result is blank", async () => {
  const response = await app.request(resolveTaskPath(createdTask.task_id), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result: "   " }),
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    code: "TASK_VALIDATION_ERROR",
  });
});

it("returns 404 when resolving or rejecting a missing task", async () => {
  const response = await app.request(resolveTaskPath("missing-task"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result: "missing" }),
  });

  expect(response.status).toBe(404);
});

it("keeps the existing result when PATCH omits result", async () => {
  const patchResponse = await app.request(resolveTaskByIdPath(createdTask.task_id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "outbound" }),
  });

  await expect(patchResponse.json()).resolves.toMatchObject({
    result: "existing route summary",
    status: "outbound",
  });
});
```

- [ ] **Step 2: 运行 route 定向测试，确认新增断言先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api --testNamePattern "resolves a task with a non-empty final result|result is blank|PATCH omits result"`

Expected: FAIL，提示 `taskResolvePath` 不存在、POST `/resolve` 返回 404，或 PATCH 仍未暴露 `result` 字段。

- [ ] **Step 3: 在路由层新增 `TaskResultRequest` 解析器并注册两个 endpoint**

在 `modules/api/src/routes/tasks.ts` 引入新 contract 导出：

```ts
import {
  patchTaskRequestSchema,
  taskRejectPath,
  taskResolvePath,
  taskResultRequestSchema,
} from "@aim-ai/contract";
```

新增解析函数：

```ts
const parseTaskResultRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskResultRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task result payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};
```

然后在 `registerTaskRoutes()` 里注册：

```ts
const taskResolveRoutePath = taskResolvePath.replace("{taskId}", ":taskId");
const taskRejectRoutePath = taskRejectPath.replace("{taskId}", ":taskId");

app.post(taskResolveRoutePath, async (context) => {
  const taskId = requireTaskId(context.req.param("taskId"));
  const input = await parseTaskResultRequest(context.req.raw);

  if (!input.ok) {
    return context.json(input.error, 400);
  }

  const payload = await getRepository().resolveTask(taskId, input.data.result);

  if (!payload) {
    return context.json(buildNotFoundError(taskId), 404);
  }

  return new Response(null, { status: 204 });
});
```

`/reject` handler 与此完全对称，只把 repository 调用换成 `rejectTask()`。

- [ ] **Step 4: 重新运行 route 测试，确认 HTTP 契约正确**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts`

Expected: PASS，说明 204/400/404、非空 `result` 校验、PATCH 保值语义和 GET 持久化读取都符合 spec。

- [ ] **Step 5: 运行 API 包级回归，确认 repository + route 一起通过**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api`

Expected: PASS，确认新 contract 不会破坏现有 task repository、scheduler 与 route 覆盖。

- [ ] **Step 6: 提交 API 基线**

```bash
git add modules/api/test/task-routes.test.ts modules/api/src/routes/tasks.ts
git commit -m "feat: add task resolve and reject routes"
```

### Task 4: 同步 Task 文档与 AIM 生命周期 skill 说明

**Files:**
- Modify: `modules/opencode-plugin/test/opencode-plugin.test.ts`
- Modify: `docs/task-model.md`
- Modify: `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`

- [ ] **Step 1: 先写文档边界断言，避免实现后遗漏文案同步**

在 `modules/opencode-plugin/test/opencode-plugin.test.ts` 追加一条文档覆盖测试：

```ts
it("documents resolve/reject terminal reporting with required non-empty result text", async () => {
  const lifecycleSkillSource = await readFile(pluginLifecycleSkillUrl, "utf8");

  expect(lifecycleSkillSource).toContain("/tasks/${task_id}/resolve");
  expect(lifecycleSkillSource).toContain("/tasks/${task_id}/reject");
  expect(lifecycleSkillSource).toContain("non-empty");
  expect(lifecycleSkillSource).toContain("result");
  expect(lifecycleSkillSource).not.toContain(
    "The only reporting target in v1 is `PATCH ${SERVER_BASE_URL}/tasks/${task_id}`.",
  );
});
```

- [ ] **Step 2: 运行 plugin 定向测试，确认文档断言先失败**

Run: `pnpm --filter @aim-ai/opencode-plugin exec vitest run --config ../../vitest.workspace.ts --project opencode-plugin --testNamePattern "resolve/reject terminal reporting"`

Expected: FAIL，提示 skill 文档仍声明终态只走 PATCH。

- [ ] **Step 3: 更新 `docs/task-model.md`，把 `result` 纳入持久化字段真相**

在推荐字段表与字段详解里增加 `result`。建议直接写成：

```md
| `result`           | `TEXT`              | 否   | Task 最近一次终态结果文本；新建时默认为空字符串         |
```

并新增一节：

```md
### `result`

`result` 保存 Task 当前已持久化的结果文本。

- 新建 Task 时默认值为 `""`，避免引入 null/缺省三态。
- `PATCH /tasks/{id}` 省略 `result` 时，表示“不修改当前结果文本”。
- `POST /tasks/{id}/resolve` 与 `POST /tasks/{id}/reject` 必须提供非空 `result`，用于记录终态结果。
```

- [ ] **Step 4: 更新 AIM 生命周期 skill，区分非终态 PATCH 与终态 resolve/reject**

把 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md` 中的终态说明改为下面这种结构：

````md
## Environment

- `SERVER_BASE_URL` defaults to `http://localhost:8192`.
- Non-terminal lifecycle updates use `PATCH ${SERVER_BASE_URL}/tasks/${task_id}`.
- Terminal result reporting uses `POST ${SERVER_BASE_URL}/tasks/${task_id}/resolve` or `POST ${SERVER_BASE_URL}/tasks/${task_id}/reject`.

## API call format

Use PATCH for non-terminal lifecycle facts. When the task reaches a terminal state, send a dedicated resolve/reject request with a required non-empty `result` string.

### Terminal success example

```bash
curl -X POST "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}/resolve" \
  -H "Content-Type: application/json" \
  --data '{
    "result": "Merged after checks passed"
  }'
```

### Terminal failure example

```bash
curl -X POST "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}/reject" \
  -H "Content-Type: application/json" \
  --data '{
    "result": "Spec assumptions no longer hold on latest baseline"
  }'
```
````

同时把 failure handling 中的 “report `status = failed` and `done = true`” 改成 “call `/reject` with a non-empty `result` body`”。

- [ ] **Step 5: 运行文档相关测试并做一次最小全链路验证**

Run: `pnpm --filter @aim-ai/opencode-plugin exec vitest run --config ../../vitest.workspace.ts --project opencode-plugin --testNamePattern "resolve/reject terminal reporting"`

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "task result|resolve and reject task operations"`

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-repository.test.ts modules/api/test/task-routes.test.ts`

Expected: PASS，说明文档断言、contract 边界和 API 行为在最终状态下一致。

- [ ] **Step 6: 提交文档与 skill 同步基线**

```bash
git add modules/opencode-plugin/test/opencode-plugin.test.ts docs/task-model.md modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md
git commit -m "docs: document task result reporting"
```

## 最终验证

- [ ] Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract`
- [ ] Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api`
- [ ] Run: `pnpm --filter @aim-ai/opencode-plugin exec vitest run --config ../../vitest.workspace.ts --project opencode-plugin`
- [ ] Run: `pnpm --filter @aim-ai/contract run generate:check`
- [ ] Run: `pnpm run openapi:check`

Expected final state: 所有 contract / api / plugin 测试通过；generated 产物与 `openapi.yaml` 同步；`Task.result` 为非 nullable string，`resolve` / `reject` 返回 204，`PATCH` 在省略 `result` 时保留原值，文档与 lifecycle skill 也同步到新协议。
