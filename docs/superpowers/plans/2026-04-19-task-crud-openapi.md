# Task CRUD OpenAPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先以 OpenAPI-first 方式补齐 Task CRUD 契约、contract 导出与 API route skeleton，让 `@aim-ai/contract` 和 `@aim-ai/api` 对同一份 Task 资源事实保持一致，但不接入真实 SQLite CRUD。

**Architecture:** 继续沿用当前仓库的 contract-first 结构：先在 `modules/contract/openapi/openapi.yaml` 固定 Task endpoints、schema、query 参数和错误模型，再通过现有生成脚本刷新 `generated` 产物，并在 `modules/contract/src` 暴露稳定的 path/schema/type 边界。API 侧只新增一个 `routes/tasks.ts` 骨架文件并在 `createApp()` 中注册，所有 handler 返回符合 contract schema 的 stub 响应或固定错误响应，不引入数据库、service 层或额外状态机逻辑。

**Tech Stack:** OpenAPI 3.1 YAML、TypeScript、Zod、Hono、Vitest、pnpm workspace

---

## 文件结构与职责映射

**修改文件**
- `modules/contract/openapi/openapi.yaml`：新增五个 Task CRUD endpoint、`Task`/`CreateTaskRequest`/`PatchTaskRequest`/`TaskListResponse`/`ErrorResponse` schema、`status`/`done`/`session_id` 过滤参数，以及 200/201/204/400/404 响应定义。
- `modules/contract/src/openapi.ts`：补充 `tasksPath`、`taskByIdPath` 等稳定 path 常量，继续把 runtime OpenAPI document 暴露为公共事实源。
- `modules/contract/src/index.ts`：从生成的 Zod schema 中导出 Task CRUD 所需 schema、类型和 path 常量，保持 API 与测试都只依赖包级公开边界。
- `modules/contract/test/contract-package.test.ts`：把包级导出断言、OpenAPI 断言和生成产物断言扩展到 Task CRUD contract。
- `modules/contract/package.json`：把生成脚本写入的 banner 文案从 `/health` 专用描述改成通用 OpenAPI contract 描述，避免生成产物注释与实际 contract scope 脱节。
- `package.json`：把根级 `openapi:check` 内联断言从只校验 `/health` 扩展为同时校验 `/tasks` 与 `/tasks/{taskId}`。
- `modules/api/src/app.ts`：注册新的 Task 路由骨架，保持 `/health` 和 `/openapi.json` 现有行为不变。

**新增文件**
- `modules/api/src/routes/tasks.ts`：实现 `POST /tasks`、`GET /tasks`、`GET /tasks/{taskId}`、`PATCH /tasks/{taskId}`、`DELETE /tasks/{taskId}` 五个 route skeleton，并用 `@aim-ai/contract` 的 schema 组装 stub 响应。
- `modules/api/test/task-routes.test.ts`：覆盖五个 Task 路由的 HTTP 状态码、响应 shape、过滤 query 透传和 404/400 stub 行为。

**生成产物（通过脚本刷新，不手写）**
- `modules/contract/generated/openapi.ts`：刷新嵌入式 OpenAPI document。
- `modules/contract/generated/types.ts`：刷新公开类型入口。
- `modules/contract/generated/client.ts`：刷新生成 client 入口。
- `modules/contract/generated/zod.ts`：刷新 Task CRUD 对应的 Zod schema。
- `modules/contract/generated/_client/**`：随 `generate:client` 自动刷新 Task CRUD client 细节。
- `modules/contract/generated/_types/**`：随 `generate:types` 自动刷新 Task CRUD types 细节。

**只读参考文件**
- `docs/superpowers/specs/2026-04-19-task-crud-openapi-design.md`：唯一 scope 来源，后续实现不得扩展到 SQLite、分页、排序、批量操作或动词型接口。
- `modules/api/src/routes/health.ts`：现有 route 注册模式参考，Task 路由应复用同样的 contract schema parse + `context.json()` 风格。
- `modules/api/test/health-route.test.ts`：现有 API 包测试模式参考，Task 路由测试应延续 `createApp()` + `app.request()` 的黑盒断言方式。
- `modules/contract/package.json`：确认 `pnpm --filter ./modules/contract generate`、`generate:check` 与 `build` 是唯一 contract 生成入口。
- `package.json`：确认根级 `openapi:check` 会在最终验证中执行，因此实现需要同步扩展对 Task path 的断言。

## 实施约束

- 只实现五个资源风格 endpoint：`POST /tasks`、`GET /tasks`、`GET /tasks/{taskId}`、`PATCH /tasks/{taskId}`、`DELETE /tasks/{taskId}`；不新增 `PUT`、动作型子路径或额外查询能力。
- `Task.status` 枚举只能使用 spec 已批准的八个值；`done` 必须是只读字段，并在 stub 响应中由 `status` 推导，而不是从请求体读取。
- `CreateTaskRequest` 与 `PatchTaskRequest` 只允许写 spec 批准的六个字段；`task_id`、`done`、`created_at`、`updated_at` 只能存在于响应 `Task` schema。
- `session_id`、`worktree_path`、`pull_request_url` 必须在 contract 中建模为 `nullable string`，并在 API skeleton 中显式返回 `null` 而不是空字符串。
- API skeleton 只返回固定 stub 数据和固定错误，不接入 SQLite、repository、service、内存状态或真实持久化。
- contract 与 API 的新增断言都必须通过包级公开边界消费，不要在 `modules/api` 中直接 import `modules/contract/generated/*`。

### Task 1: 扩展 Task CRUD OpenAPI contract 并先锁定失败测试

**Files:**
- Modify: `modules/contract/openapi/openapi.yaml`
- Modify: `modules/contract/test/contract-package.test.ts`

- [ ] **Step 1: 先补 contract 级失败测试，锁定新增公开边界与 OpenAPI 结构**

在 `modules/contract/test/contract-package.test.ts` 追加针对 Task CRUD 的导出和 OpenAPI 断言，先让测试在实现前失败。新增断言至少覆盖 path 常量、schema 导出、状态枚举、列表过滤参数和 201/204/404 响应。示例：

```ts
it("publishes task CRUD entrypoints from the built package boundary", () => {
  expect(Object.keys(contractModule).sort()).toEqual([
    "ContractClientError",
    "createTaskRequestSchema",
    "createContractClient",
    "healthErrorCodeSchema",
    "healthErrorSchema",
    "healthPath",
    "healthResponseSchema",
    "healthStatusSchema",
    "openApiDocument",
    "patchTaskRequestSchema",
    "taskByIdPath",
    "taskErrorCodeSchema",
    "taskErrorSchema",
    "taskListResponseSchema",
    "taskSchema",
    "taskStatusSchema",
    "tasksPath",
  ]);
  expect(contractModule.tasksPath).toBe("/tasks");
  expect(contractModule.taskByIdPath).toBe("/tasks/{taskId}");
});

it("publishes task CRUD operations in the shared OpenAPI document", () => {
  const tasksPathItem = contractModule.openApiDocument.paths[contractModule.tasksPath];
  const taskByIdPathItem = contractModule.openApiDocument.paths[contractModule.taskByIdPath];

  expect(tasksPathItem?.post?.responses["201"]).toBeDefined();
  expect(tasksPathItem?.get?.parameters).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "status", in: "query" }),
      expect.objectContaining({ name: "done", in: "query" }),
      expect.objectContaining({ name: "session_id", in: "query" }),
    ]),
  );
  expect(taskByIdPathItem?.delete?.responses["204"]).toBeDefined();
  expect(taskByIdPathItem?.get?.responses["404"]).toBeDefined();
});
```

- [ ] **Step 2: 运行 contract 定向测试，确认当前基线先失败**

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "task CRUD"`

Expected: FAIL，提示 `tasksPath` / `taskSchema` 尚未导出，且 OpenAPI document 里还没有 `/tasks` 和 `/tasks/{taskId}`。

- [ ] **Step 3: 在 OpenAPI YAML 中补齐五个 Task endpoint、五个核心 schema 与统一错误响应**

在 `modules/contract/openapi/openapi.yaml` 中新增：
1. `/tasks` 的 `post` 与 `get`。
2. `/tasks/{taskId}` 的 `get`、`patch` 与 `delete`。
3. `Task`、`CreateTaskRequest`、`PatchTaskRequest`、`TaskListResponse`、`ErrorResponse` schema。
4. `taskId` path parameter，以及 `status`、`done`、`session_id` query parameters。
5. 统一引用 `ErrorResponse` 的 400/404 响应。

建议核心 YAML 片段如下：

```yaml
paths:
  /tasks:
    post:
      operationId: createTask
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateTaskRequest"
      responses:
        "201":
          description: Created task
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Task"
        "400":
          description: Invalid task payload
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
    get:
      operationId: listTasks
      parameters:
        - $ref: "#/components/parameters/TaskStatusQueryParameter"
        - $ref: "#/components/parameters/TaskDoneQueryParameter"
        - $ref: "#/components/parameters/TaskSessionIdQueryParameter"
      responses:
        "200":
          description: Task collection
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/TaskListResponse"
  /tasks/{taskId}:
    get:
      operationId: getTaskById
      parameters:
        - $ref: "#/components/parameters/TaskIdPathParameter"
      responses:
        "200":
          description: Task detail
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Task"
        "404":
          description: Task not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
```

`Task` schema 内必须把 `task_id`、`done`、`created_at`、`updated_at` 标记为 `readOnly: true`，并把 `session_id`、`worktree_path`、`pull_request_url` 定义为 `type: ["string", "null"]` 或等价的 nullable 表达。

- [ ] **Step 4: 重新运行同一组 contract 测试，确认 OpenAPI 结构达标**

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "task CRUD"`

Expected: PASS，说明 YAML 已包含五个 endpoint、列表过滤参数和统一错误响应。

- [ ] **Step 5: 提交 OpenAPI contract 基线**

```bash
git add modules/contract/openapi/openapi.yaml modules/contract/test/contract-package.test.ts
git commit -m "feat: define task crud openapi contract"
```

### Task 2: 刷新 contract 生成产物并补齐 Task 公共导出

**Files:**
- Modify: `modules/contract/package.json`
- Modify: `package.json`
- Modify: `modules/contract/src/openapi.ts`
- Modify: `modules/contract/src/index.ts`
- Modify: `modules/contract/generated/openapi.ts`
- Modify: `modules/contract/generated/types.ts`
- Modify: `modules/contract/generated/client.ts`
- Modify: `modules/contract/generated/zod.ts`
- Modify: `modules/contract/generated/_client/**`
- Modify: `modules/contract/generated/_types/**`
- Modify: `modules/contract/test/contract-package.test.ts`

- [ ] **Step 1: 运行生成脚本，先让生成产物和源码导出不一致地失败一次**

Run: `pnpm --filter @aim-ai/contract run build`

Expected: FAIL 或 test 仍失败，因为 `modules/contract/src/index.ts` / `src/openapi.ts` 还没有把新的 Task path 和 schema 暴露到公共边界。

- [ ] **Step 2: 先把生成与校验脚本从 health-only 文案/断言扩展到通用 OpenAPI contract**

在 `modules/contract/package.json` 中把这三条脚本的 banner 文案改成不再绑定 `/health` 的描述：

```json
{
  "generate:openapi": "... const output = '// This file is auto-generated from the OpenAPI contract.\\n' + ...",
  "generate:types": "... printf '%s\n' '// This file is auto-generated from the OpenAPI contract.' 'export * from \"./_types/types.gen.js\";' > ./generated/types.ts",
  "generate:client": "... printf '%s\n' '// This file is auto-generated from the OpenAPI contract.' 'export * from \"./_client/index.js\";' > ./generated/client.ts"
}
```

在根 `package.json` 中把 `openapi:check` 的断言补成同时校验 health 和 Task path：

```json
{
  "openapi:check": "pnpm --filter ./modules/contract generate:check && pnpm --filter ./modules/contract build && node --input-type=module --eval \"import { pathToFileURL } from 'node:url'; const contractModule = await import(pathToFileURL(process.cwd() + '/modules/contract/dist/index.mjs').href); if (contractModule.openApiDocument.openapi !== '3.1.0') throw new Error('expected OpenAPI 3.1.0 document'); if (!contractModule.openApiDocument.paths[contractModule.healthPath]) throw new Error('expected health path in OpenAPI document'); if (!contractModule.openApiDocument.paths[contractModule.tasksPath]) throw new Error('expected tasks path in OpenAPI document'); if (!contractModule.openApiDocument.paths[contractModule.taskByIdPath]) throw new Error('expected task detail path in OpenAPI document');\""
}
```

- [ ] **Step 3: 在 `src/openapi.ts` 与 `src/index.ts` 中补齐 Task path/schema/type 导出**

`modules/contract/src/openapi.ts` 中新增稳定 path 常量：

```ts
export const healthPath = "/health";
export const tasksPath = "/tasks";
export const taskByIdPath = "/tasks/{taskId}";
export const openApiDocument: OpenApiDocument = generatedOpenApiDocument;
```

`modules/contract/src/index.ts` 中从 `schemas` 导出 Task 相关 schema 和类型，最少包括：

```ts
export { healthPath, openApiDocument, taskByIdPath, tasksPath } from "./openapi.js";

export const taskSchema = schemas.Task;
export const createTaskRequestSchema = schemas.CreateTaskRequest;
export const patchTaskRequestSchema = schemas.PatchTaskRequest;
export const taskListResponseSchema = schemas.TaskListResponse;
export const taskErrorSchema = schemas.ErrorResponse;
export const taskStatusSchema = taskSchema.shape.status;
export const taskErrorCodeSchema = taskErrorSchema.shape.code;

export type Task = Infer<typeof taskSchema>;
export type CreateTaskRequest = Infer<typeof createTaskRequestSchema>;
export type PatchTaskRequest = Infer<typeof patchTaskRequestSchema>;
export type TaskListResponse = Infer<typeof taskListResponseSchema>;
export type TaskError = Infer<typeof taskErrorSchema>;
export type TaskStatus = Infer<typeof taskStatusSchema>;
```

这里不要导出 generated client 的内部类型名；继续保持包级边界只暴露路径、schema 与推导后的公共类型。

- [ ] **Step 4: 刷新生成产物并确认 `generated` 目录包含 Task CRUD 结果**

Run: `pnpm --filter @aim-ai/contract run generate`

Expected: PASS，并且 `modules/contract/generated/openapi.ts`、`generated/zod.ts`、`generated/types.ts`、`generated/client.ts` 以及对应 `_client` / `_types` 子目录都出现 `tasks`、`taskId`、`Task`、`CreateTaskRequest`、`PatchTaskRequest` 相关内容。

- [ ] **Step 5: 补齐 contract 包级断言，锁定 Task schema 行为与生成产物内容**

在 `modules/contract/test/contract-package.test.ts` 追加两个断言块：

```ts
it("exports task schemas from the built package boundary", () => {
  expect(contractModule.taskStatusSchema.parse("created")).toBe("created");
  expect(
    contractModule.taskSchema.parse({
      task_id: "task-123",
      task_spec: "# Task",
      session_id: null,
      worktree_path: null,
      pull_request_url: null,
      dependencies: [],
      done: false,
      status: "created",
      created_at: "2026-04-19T00:00:00.000Z",
      updated_at: "2026-04-19T00:00:00.000Z",
    }),
  ).toMatchObject({ task_id: "task-123", done: false, status: "created" });
});

it("keeps generated artifacts aligned with task CRUD operations", async () => {
  await expect(readFile(generatedTypesUrl, "utf8")).resolves.toContain("/tasks");
  await expect(readFile(generatedClientUrl, "utf8")).resolves.toContain("createTask");
  await expect(readFile(generatedZodUrl, "utf8")).resolves.toContain("CreateTaskRequest");
  await expect(readFile(generatedClientUrl, "utf8")).resolves.not.toContain("/health OpenAPI contract");
});
```

- [ ] **Step 6: 运行 contract 全量包测试并提交导出边界**

Run: `pnpm --filter @aim-ai/contract test`

Expected: PASS，证明包级导出、生成产物和 OpenAPI document 已对齐。

```bash
git add package.json modules/contract/package.json modules/contract/src/openapi.ts modules/contract/src/index.ts modules/contract/generated modules/contract/test/contract-package.test.ts
git commit -m "feat: export generated task crud contract"
```

### Task 3: 在 API 包中落地五个 Task route skeleton

**Files:**
- Modify: `modules/api/src/app.ts`
- Create: `modules/api/src/routes/tasks.ts`
- Create: `modules/api/test/task-routes.test.ts`

- [ ] **Step 1: 先写 API 失败测试，锁定五个 endpoint 的最小 HTTP 行为**

新建 `modules/api/test/task-routes.test.ts`，沿用 `health-route.test.ts` 的黑盒方式，先约束以下行为：
1. `POST /tasks` 返回 201 和符合 `taskSchema` 的 stub Task。
2. `GET /tasks` 返回 200 和符合 `taskListResponseSchema` 的 `{ items: [...] }`。
3. `GET /tasks/task-404` 返回 404 和符合 `taskErrorSchema` 的错误体。
4. `PATCH /tasks/task-123` 返回 200 和更新后的 stub Task。
5. `DELETE /tasks/task-123` 返回 204 且无响应体。

示例：

```ts
it("returns a stub task from POST /tasks", async () => {
  const app = apiModule.createApp();

  const response = await app.request(contractModule.tasksPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task_spec: "# Task", dependencies: [] }),
  });

  expect(response.status).toBe(201);

  const payload = await response.json();

  expect(contractModule.taskSchema.safeParse(payload).success).toBe(true);
  expect(payload).toMatchObject({ task_spec: "# Task", status: "created", done: false });
});
```

- [ ] **Step 2: 运行 API 定向测试，确认在新路由未实现时先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api --testNamePattern "stub task|task routes|DELETE /tasks"`

Expected: FAIL，报 `/tasks` 相关路由为 404，或 `contractModule` 中缺少 Task contract 导出。

- [ ] **Step 3: 新增 `routes/tasks.ts`，用 contract schema 组装最小 stub 响应**

在 `modules/api/src/routes/tasks.ts` 中只实现一个轻量注册函数，直接依赖 `@aim-ai/contract`。建议最小骨架如下：

```ts
import {
  createTaskRequestSchema,
  patchTaskRequestSchema,
  taskByIdPath,
  taskErrorSchema,
  taskListResponseSchema,
  taskSchema,
  tasksPath,
  type Task,
} from "@aim-ai/contract";
import type { Hono } from "hono";

const buildStubTask = (overrides: Partial<Task> = {}): Task =>
  taskSchema.parse({
    task_id: "task-stub-123",
    task_spec: "# Stub Task\n",
    session_id: null,
    worktree_path: null,
    pull_request_url: null,
    dependencies: [],
    done: false,
    status: "created",
    created_at: "2026-04-19T00:00:00.000Z",
    updated_at: "2026-04-19T00:00:00.000Z",
    ...overrides,
  });

export const registerTaskRoutes = (app: Hono) => {
  app.post(tasksPath, async (context) => {
    const input = createTaskRequestSchema.parse(await context.req.json());
    return context.json(buildStubTask({
      task_spec: input.task_spec,
      session_id: input.session_id ?? null,
      worktree_path: input.worktree_path ?? null,
      pull_request_url: input.pull_request_url ?? null,
      dependencies: input.dependencies ?? [],
      status: input.status ?? "created",
      done: (input.status ?? "created") === "succeeded" || (input.status ?? "created") === "failed",
    }), 201);
  });
};
```

同一文件继续补齐 `GET /tasks`、`GET /tasks/{taskId}`、`PATCH /tasks/{taskId}`、`DELETE /tasks/{taskId}`。其中：
- `GET /tasks` 返回 `taskListResponseSchema.parse({ items: [buildStubTask()] })`。
- `GET /tasks/{taskId}` 对固定 `task-404` 返回 `taskErrorSchema.parse({ code: "TASK_NOT_FOUND", message: "Task not found" })` 和 404，其余返回 200。
- `PATCH /tasks/{taskId}` 用 `patchTaskRequestSchema` 校验 body，并返回用 patch 字段覆盖后的 stub Task，同时重新按最终 `status` 推导 `done`。
- `DELETE /tasks/{taskId}` 直接返回 `new Response(null, { status: 204 })`。

- [ ] **Step 4: 在 `app.ts` 注册 Task 路由并确认 OpenAPI endpoint 仍然可用**

把 `modules/api/src/app.ts` 调整为：

```ts
import { registerHealthRoute } from "./routes/health.js";
import { registerTaskRoutes } from "./routes/tasks.js";

export const createApp = () => {
  const app = new Hono();

  registerHealthRoute(app);
  registerTaskRoutes(app);
  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
```

- [ ] **Step 5: 运行 API 包测试并提交 route skeleton**

Run: `pnpm --filter @aim-ai/api test`

Expected: PASS，证明五个 Task endpoint、既有 health route 和 `/openapi.json` 都可通过共享 contract 断言。

```bash
git add modules/api/src/app.ts modules/api/src/routes/tasks.ts modules/api/test/task-routes.test.ts
git commit -m "feat: add task crud api skeleton routes"
```

### Task 4: 做收口验证，确保 contract、generated artifacts 与 API skeleton 一致

**Files:**
- Modify: `modules/contract/test/contract-package.test.ts`
- Modify: `modules/api/test/task-routes.test.ts`
- Modify: `modules/api/test/health-route.test.ts`

- [ ] **Step 1: 补一条跨包一致性断言，确认 `/openapi.json` 暴露的是带 Task CRUD 的共享文档**

如果 `modules/api/test/health-route.test.ts` 里的 `/openapi.json` 用例还只断言 health path，就把断言扩大为同时覆盖 Task path：

```ts
expect(payload.paths[contractModule.tasksPath]).toEqual(
  contractModule.openApiDocument.paths[contractModule.tasksPath],
);
expect(payload.paths[contractModule.taskByIdPath]).toEqual(
  contractModule.openApiDocument.paths[contractModule.taskByIdPath],
);
```

- [ ] **Step 2: 运行 focused verification，确认变更面最小闭环成立**

Run: `pnpm --filter @aim-ai/contract test && pnpm --filter @aim-ai/api test && pnpm run openapi:check`

Expected: PASS，说明 contract 导出、API route skeleton 和 generated artifacts 都处于一致状态，且生成脚本不会产生未提交漂移。

- [ ] **Step 3: 运行最终仓库级验证，确认没有把问题留到包外**

Run: `pnpm run test:repo && pnpm run build`

Expected: PASS，证明 repo 级基线测试和 workspace build 在 Task CRUD skeleton 引入后仍然稳定。

- [ ] **Step 4: 提交验证收口调整**

```bash
git add modules/contract/test/contract-package.test.ts modules/api/test/task-routes.test.ts modules/api/test/health-route.test.ts
git commit -m "test: verify task crud contract and api alignment"
```
