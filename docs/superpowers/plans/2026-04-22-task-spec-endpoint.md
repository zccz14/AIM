# Task Spec Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `GET /tasks/{taskId}/spec`，让调用方可以直接读取任务持久化保存的原始 `task_spec` Markdown 文本，并继续复用既有 `TASK_NOT_FOUND` + `404` 错误协议。

**Architecture:** 继续沿用当前仓库的 OpenAPI-first + shared-contract 模式：先在 `modules/contract/openapi/openapi.yaml` 和 `modules/contract/src/*` 定义稳定路径常量与 `text/markdown` 响应，再通过现有 `pnpm --filter @aim-ai/contract run generate` 刷新生成产物。API 侧只在 `modules/api/src/routes/tasks.ts` 中追加一个与 `resolve`/`reject` 同层级的只读子资源 handler，直接复用已有 `getTaskById(taskId)` 和统一 not-found 错误构造，不引入新 repository abstraction、文件系统读取或额外 service 层。

**Tech Stack:** OpenAPI 3.1 YAML、TypeScript、Hono、Vitest、pnpm workspace、`@aim-ai/contract`

---

## 文件结构与职责映射

**修改文件**
- `modules/contract/openapi/openapi.yaml`：新增 `/tasks/{taskId}/spec` path item，定义 `GET` 的 `text/markdown` 成功响应和复用 `ErrorResponse` 的 `404`。
- `modules/contract/src/openapi.ts`：新增 `taskSpecPath` 常量，保持 task 子资源路径常量集中定义。
- `modules/contract/src/index.ts`：导出 `taskSpecPath`，让 API 和测试继续只依赖包级公共边界。
- `modules/contract/test/contract-package.test.ts`：补充公开导出、OpenAPI path item、`text/markdown` content type、生成 client/types 结果与根级 `openapi:check` 断言。
- `package.json`：把根级 `openapi:check` 从只校验 `tasksPath` / `taskByIdPath` 扩展到校验 `taskSpecPath`。
- `modules/api/src/routes/tasks.ts`：新增 `/spec` route path 常量和 handler，成功时返回 `task.task_spec` 原文与 `text/markdown; charset=utf-8`，任务不存在时返回共享 404 错误。
- `modules/api/test/task-routes.test.ts`：覆盖 `GET /tasks/{taskId}/spec` 的成功正文/content-type 和 not-found 分支。
- `modules/api/test/health-route.test.ts`：确认 `/openapi.json` 对外暴露的新 path item 仍然与 shared contract 一致。

**生成产物（通过脚本刷新，不手写）**
- `modules/contract/generated/openapi.ts`
- `modules/contract/generated/client.ts`
- `modules/contract/generated/types.ts`
- `modules/contract/generated/_client/**`
- `modules/contract/generated/_types/**`
- `modules/contract/generated/zod.ts`

说明：本接口只新增 path，不新增 component schema，因此 `generated/zod.ts` 很可能无内容变化；这仍然符合仓库 workflow，因为 `generate` 会统一重跑全部生成步骤。

**只读参考文件**
- `docs/superpowers/specs/2026-04-22-task-spec-endpoint-design.md`：唯一 scope 来源。
- `modules/api/src/routes/tasks.ts`：现有 task 子资源注册与 not-found 处理模式。
- `modules/api/test/task-routes.test.ts`：现有 `createApp()` + `app.request()` 黑盒测试模式。
- `modules/contract/src/openapi.ts`：现有 path 常量命名模式。
- `modules/contract/test/contract-package.test.ts`：现有 contract 包导出与 OpenAPI 断言模式。

## 实施约束

- 路径固定为 `GET /tasks/{taskId}/spec`，不要新增别名、query 参数、下载语义或 JSON 包装。
- 成功响应 body 必须等于数据库中的 `task.task_spec` 原文，不改写换行、不追加 metadata。
- 成功响应 `Content-Type` 必须是 `text/markdown; charset=utf-8`；contract 与 API 测试都要锁定这一点。
- not-found 继续复用现有 `buildNotFoundError()` 产出的 `TASK_NOT_FOUND` + `404`，不要新增 spec 专属错误码。
- 读取来源只能是 repository 返回的 `task.task_spec`；不要访问 `.aim/task-specs/...md` 或增加文件存在性分支。
- 继续复用现有 task route 文件和 contract 导出方式，不要新建 `task-spec-repository`、`task-spec-service` 之类的新抽象。

### Task 1: 先锁定 contract 失败测试，再定义 `/tasks/{taskId}/spec` 契约

**Files:**
- Modify: `modules/contract/test/contract-package.test.ts`
- Modify: `modules/contract/openapi/openapi.yaml`
- Modify: `modules/contract/src/openapi.ts`
- Modify: `modules/contract/src/index.ts`

- [ ] **Step 1: 先补 contract 失败测试，锁定新 path 常量与 `text/markdown` OpenAPI 形状**

在 `modules/contract/test/contract-package.test.ts` 的包级导出断言和 OpenAPI 断言中加入 `taskSpecPath` 与 `/tasks/{taskId}/spec` 相关检查，先让测试在实现前失败。新增断言至少覆盖三件事：`taskSpecPath` 从包级边界导出、OpenAPI document 中存在该 path、`200` 响应内容类型是 `text/markdown` 而不是 `application/json`。示例：

```ts
expect(Object.keys(contractModule).sort()).toEqual([
  "ContractClientError",
  "createContractClient",
  "createTaskRequestSchema",
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
  "taskRejectPath",
  "taskResolvePath",
  "taskResultRequestSchema",
  "taskSchema",
  "taskSpecPath",
  "taskStatusSchema",
  "tasksPath",
]);

const taskSpecPathItem = contractModule.openApiDocument.paths[
  contractModule.taskSpecPath
] as
  | {
      get?: {
        responses?: Record<
          string,
          {
            content?: {
              "text/markdown"?: {
                schema?: Record<string, unknown>;
              };
              "application/json"?: unknown;
            };
          }
        >;
      };
    }
  | undefined;

expect(contractModule.taskSpecPath).toBe("/tasks/{taskId}/spec");
expect(taskSpecPathItem?.get?.responses?.["200"]?.content?.["text/markdown"]?.schema).toEqual({
  type: "string",
});
expect(taskSpecPathItem?.get?.responses?.["200"]?.content?.["application/json"]).toBeUndefined();
expect(taskSpecPathItem?.get?.responses?.["404"]?.content?.["application/json"]?.schema).toEqual({
  $ref: "#/components/schemas/ErrorResponse",
});
```

- [ ] **Step 2: 运行定向 contract 测试，确认基线先失败**

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract modules/contract/test/contract-package.test.ts --testNamePattern "task spec|package export contract|task CRUD operations"`

Expected: FAIL，报错点应集中在 `taskSpecPath` 尚未导出，以及 `openApiDocument.paths["/tasks/{taskId}/spec"]` 还不存在。

- [ ] **Step 3: 在 OpenAPI YAML 和公共导出中补齐 `/spec` 子资源定义**

先在 `modules/contract/openapi/openapi.yaml` 的 task 子资源区块后追加 `/tasks/{taskId}/spec`，再在 `modules/contract/src/openapi.ts` / `modules/contract/src/index.ts` 暴露常量。最小代码形状如下：

```yaml
  /tasks/{taskId}/spec:
    get:
      operationId: getTaskSpecById
      summary: Read a task spec markdown document
      parameters:
        - $ref: "#/components/parameters/TaskIdPathParameter"
      responses:
        "200":
          description: Task spec markdown
          content:
            text/markdown:
              schema:
                type: string
        "404":
          description: Task not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
```

```ts
export const taskSpecPath = "/tasks/{taskId}/spec";

export {
  healthPath,
  openApiDocument,
  taskByIdPath,
  taskRejectPath,
  taskResolvePath,
  taskSpecPath,
  tasksPath,
} from "./openapi.js";
```

不要新增 `taskSpecResponseSchema`；成功响应是裸字符串，不是 component schema。

- [ ] **Step 4: 重新运行同一组 contract 测试，确认契约定义通过**

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract modules/contract/test/contract-package.test.ts --testNamePattern "task spec|package export contract|task CRUD operations"`

Expected: PASS，说明 path 常量、OpenAPI path item、`text/markdown` 成功响应与共享 `404` 错误响应已对齐。

### Task 2: 刷新 contract 生成产物，并把新 path 纳入仓库级 OpenAPI 校验

**Files:**
- Modify: `package.json`
- Modify: `modules/contract/test/contract-package.test.ts`
- Modify: `modules/contract/generated/openapi.ts`
- Modify: `modules/contract/generated/client.ts`
- Modify: `modules/contract/generated/types.ts`
- Modify: `modules/contract/generated/_client/**`
- Modify: `modules/contract/generated/_types/**`
- Modify: `modules/contract/generated/zod.ts`
- Modify: `modules/api/test/health-route.test.ts`

- [ ] **Step 1: 先补生成产物与 `/openapi.json` 的失败断言**

在 `modules/contract/test/contract-package.test.ts` 中追加对生成文件的文本断言，在 `modules/api/test/health-route.test.ts` 中追加对 `/openapi.json` 新 path 的断言。示例：

```ts
const generatedOpenApiUrl = new URL("../generated/openapi.ts", import.meta.url);
const generatedOpenApiSource = await readFile(generatedOpenApiUrl, "utf8");
const generatedClientSdkSource = await readFile(generatedClientSdkUrl, "utf8");

expect(generatedOpenApiSource).toContain('"/tasks/{taskId}/spec"');
expect(generatedClientSdkSource).toContain("getTaskSpecById");
expect(rootPackage.scripts["openapi:check"]).toContain("taskSpecPath");
```

```ts
const taskSpecPathItem = payload.paths[contractModule.taskSpecPath] as
  | {
      get?: {
        responses?: Record<
          string,
          {
            content?: {
              "text/markdown"?: {
                schema?: Record<string, unknown>;
              };
            };
          }
        >;
      };
    }
  | undefined;

expect(taskSpecPathItem?.get?.responses?.["200"]?.content?.["text/markdown"]?.schema).toEqual({
  type: "string",
});
```

- [ ] **Step 2: 运行生成/对外暴露相关测试，确认它们先失败**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project contract --project api --testNamePattern "task spec|shared OpenAPI document"`

Expected: FAIL，至少应看到 `generated/openapi.ts` 或 `generated/_client/sdk.gen.ts` 还没包含新 endpoint，且根级 `openapi:check` 还未断言 `taskSpecPath`。

- [ ] **Step 3: 刷新生成产物，并把根级 `openapi:check` 扩展到 `taskSpecPath`**

先更新根 `package.json` 的 `openapi:check`，再执行生成脚本，不要手写 `generated/**`。根脚本需要扩展到下面这种最小形状：

```json
{
  "openapi:check": "pnpm --filter ./modules/contract generate:check && pnpm --filter ./modules/contract build && node --input-type=module --eval \"import { pathToFileURL } from 'node:url'; const contractModule = await import(pathToFileURL(process.cwd() + '/modules/contract/dist/index.mjs').href); if (contractModule.openApiDocument.openapi !== '3.1.0') throw new Error('expected OpenAPI 3.1.0 document'); if (!contractModule.openApiDocument.paths[contractModule.healthPath]) throw new Error('expected health path in OpenAPI document'); if (!contractModule.openApiDocument.paths[contractModule.tasksPath]) throw new Error('expected tasks path in OpenAPI document'); if (!contractModule.openApiDocument.paths[contractModule.taskByIdPath]) throw new Error('expected task-by-id path in OpenAPI document'); if (!contractModule.openApiDocument.paths[contractModule.taskSpecPath]) throw new Error('expected task-spec path in OpenAPI document');\""
}
```

Run: `pnpm --filter @aim-ai/contract run generate`

Expected: PASS，并刷新 `generated/openapi.ts`、`generated/client.ts`、`generated/types.ts` 与相关 `_client` / `_types` 文件；`generated/zod.ts` 可无 diff。

- [ ] **Step 4: 运行 contract 与 OpenAPI 暴露验证，确认生成结果和仓库校验都通过**

Run: `pnpm --filter @aim-ai/contract test`

Expected: PASS，说明包级导出、OpenAPI document、生成产物与根脚本断言一致。

Run: `pnpm openapi:check`

Expected: PASS，说明 `generate:check`、contract build 与根级 path 存在性校验都接受新 endpoint。

### Task 3: 先写 API route 失败测试，再在现有 task 路由中实现 `/spec`

**Files:**
- Modify: `modules/api/test/task-routes.test.ts`
- Modify: `modules/api/src/routes/tasks.ts`

- [ ] **Step 1: 先补两个 API 失败测试，锁定成功文本响应和 not-found 分支**

在 `modules/api/test/task-routes.test.ts` 中新增两个 case：
1. 先创建任务，再请求 `/tasks/{taskId}/spec`，断言 `200`、返回 body 等于创建时的 `task_spec`、`content-type` 包含 `text/markdown; charset=utf-8`。
2. 请求不存在的 task id，断言 `404` 且 body 通过 `taskErrorSchema`，`code === "TASK_NOT_FOUND"`。

示例：

```ts
const resolveTaskSpecPath = (taskId: string) =>
  contractModule.taskSpecPath.replace("{taskId}", taskId);

it("returns raw markdown for GET /tasks/{taskId}/spec", async () => {
  await useProjectRoot("reads-task-spec");

  const app = apiModule.createApp();
  const markdown = "# Task\n\n- keep exact spacing\n";
  const createResponse = await app.request(contractModule.tasksPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task_spec: markdown, project_path: "/repo/spec" }),
  });
  const createdTask = await createResponse.json();

  const response = await app.request(resolveTaskSpecPath(createdTask.task_id));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/markdown; charset=utf-8");
  await expect(response.text()).resolves.toBe(markdown);
});

it("returns TASK_NOT_FOUND for GET /tasks/{taskId}/spec when the task is missing", async () => {
  await useProjectRoot("missing-task-spec");

  const app = apiModule.createApp();
  const response = await app.request(resolveTaskSpecPath("task-missing"));

  expect(response.status).toBe(404);
  const payload = await response.json();
  expect(contractModule.taskErrorSchema.safeParse(payload).success).toBe(true);
  expect(payload.code).toBe("TASK_NOT_FOUND");
});
```

- [ ] **Step 2: 运行 task route 定向测试，确认新 case 先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts --testNamePattern "raw markdown|TASK_NOT_FOUND for GET"`

Expected: FAIL，通常会报 `contractModule.taskSpecPath` 未定义，或 route 仍返回 `404 Not Found` / `application/json`。

- [ ] **Step 3: 在现有 `modules/api/src/routes/tasks.ts` 中追加最小实现**

只在现有 task route 文件中补 path 常量和一个 `app.get(...)` handler，复用 `getRepository()`、`requireTaskId()` 和 `buildNotFoundError()`。最小实现形状如下：

```ts
import {
  createTaskRequestSchema,
  patchTaskRequestSchema,
  taskByIdPath,
  taskErrorSchema,
  taskRejectPath,
  taskResolvePath,
  taskResultRequestSchema,
  taskSpecPath,
  taskStatusSchema,
  tasksPath,
} from "@aim-ai/contract";

const taskSpecRoutePath = taskSpecPath.replace("{taskId}", ":taskId");

app.get(taskSpecRoutePath, async (context) => {
  const taskId = requireTaskId(context.req.param("taskId"));
  const task = await getRepository().getTaskById(taskId);

  if (!task) {
    return context.json(buildNotFoundError(taskId), 404);
  }

  return new Response(task.task_spec, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
    },
  });
});
```

不要在这里 `JSON.stringify({ task_spec: task.task_spec })`，也不要读取 `.aim/task-specs` 文件。

- [ ] **Step 4: 重新运行定向 API 测试，确认成功/失败路径都通过**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts --testNamePattern "raw markdown|TASK_NOT_FOUND for GET"`

Expected: PASS，成功 case 返回原始 markdown 文本和 `text/markdown; charset=utf-8`，缺失任务 case 返回共享 `TASK_NOT_FOUND`。

- [ ] **Step 5: 运行 API 包全量测试，确认没有破坏现有 task routes 与 `/openapi.json`**

Run: `pnpm --filter @aim-ai/api test`

Expected: PASS，说明新 route 与现有 create/list/detail/resolve/reject/delete 路由共存，且 `/openapi.json` 暴露的新 path 与 shared contract 保持一致。

## 完成定义

- `modules/contract/src/openapi.ts` 与 `modules/contract/src/index.ts` 导出 `taskSpecPath`。
- `modules/contract/openapi/openapi.yaml` 发布 `GET /tasks/{taskId}/spec`，其 `200` 响应是 `text/markdown` 字符串，`404` 复用 `ErrorResponse`。
- `pnpm --filter @aim-ai/contract run generate` 后，生成产物与新 endpoint 对齐，`pnpm openapi:check` 通过。
- `modules/api/src/routes/tasks.ts` 实现 `/spec` handler，成功返回 `task.task_spec` 原文，not-found 返回共享错误对象。
- `modules/api/test/task-routes.test.ts` 与 `modules/api/test/health-route.test.ts` 覆盖并通过。
