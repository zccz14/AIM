# Task Project Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `project_path` 成为 Task 的端到端必填事实源，并让 OpenCode Session 只使用该字段作为项目目录。

**Architecture:** 延续仓库现有 contract-first + SQLite repository + Hono route + dashboard/CLI 调用方分层：先修改 `modules/contract/openapi/openapi.yaml` 与生成产物锁定新契约，再把 API 路由、repository、SQLite schema 校验与 scheduler/coordinator 切到同一事实源。前端、CLI 与其他上游调用方只通过 `@aim-ai/contract` 的公开类型消费 `project_path`，不引入旧数据兼容、自动推断或回退到 `worktree_path` 的分支。

**Tech Stack:** OpenAPI 3.1 YAML、TypeScript、Zod、Hono、node:sqlite、Vitest、Playwright、React、pnpm workspace

---

## 文件结构与职责映射

**Contract / 生成产物**
- `modules/contract/openapi/openapi.yaml`：给 `Task` 与 `CreateTaskRequest` 增加必填 `project_path`，保持 `PatchTaskRequest` 不接受该字段。
- `modules/contract/generated/openapi.ts`
- `modules/contract/generated/zod.ts`
- `modules/contract/generated/types.ts`
- `modules/contract/generated/client.ts`
- `modules/contract/generated/_client/**`
- `modules/contract/generated/_types/**`
- `modules/contract/src/index.ts`：继续从包级公开边界暴露更新后的 schema/type。
- `modules/contract/test/contract-package.test.ts`：锁定新字段、PATCH 约束与生成产物一致性。

**API / SQLite / Scheduler**
- `modules/api/src/routes/tasks.ts`：`POST /tasks` 必填 `project_path`，`PATCH /tasks/{id}` 出现 `project_path` 时显式返回校验错误。
- `modules/api/src/task-repository.ts`：`TaskRow`、建表 SQL、schema 校验、CRUD 读写都纳入 `project_path`。
- `modules/api/src/task-session-coordinator.ts`：保持调度器边界不变，但其输入 `Task` 将始终带 `project_path`。
- `modules/api/src/opencode-sdk-adapter.ts`：创建 OpenCode session 时改用 `task.project_path` 作为 `query.directory`，prompt 文本同步体现 `project_path`。
- `modules/api/test/task-routes.test.ts`
- `modules/api/test/task-repository.test.ts`
- `modules/api/test/task-session-coordinator.test.ts`
- `modules/api/test/task-session-coordinator-default-adapter.test.ts`
- `modules/api/test/opencode-sdk-adapter.test.ts`
- `modules/api/test/task-scheduler.test.ts`

**上游调用方 / UI**
- `modules/cli/src/commands/task/create.ts`：创建命令新增必填 `--project-path`。
- `modules/cli/test/task-command.test.ts`：锁定 CLI 请求体与错误路径。
- `modules/web/src/features/task-dashboard/api/task-dashboard-api.ts`：dashboard 创建调用显式发送 `project_path`。
- `modules/web/src/features/task-dashboard/use-task-create-mutation.ts`：mutation 输入从单字符串升级为包含 `taskSpec` 与 `projectPath` 的 payload。
- `modules/web/src/features/task-dashboard/components/create-task-drawer.tsx`：新增 `Project Path` 输入并在本地禁止空值提交。
- `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`：提交创建表单时透传 `project_path`。
- `modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts`
- `modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`
- `modules/web/src/features/task-dashboard/components/task-details-drawer.tsx`：展示 `project_path`。
- `modules/web/test/task-dashboard.spec.ts`
- `modules/web/test/app.spec.ts`

**只读参考**
- `docs/superpowers/specs/2026-04-20-task-project-path-design.md`：唯一 scope 来源。
- `docs/superpowers/plans/2026-04-19-task-crud-openapi.md`
- `docs/superpowers/plans/2026-04-19-task-crud-sqlite.md`
- `docs/superpowers/plans/2026-04-20-task-create-flow.md`

## 实施约束

- `project_path` 只新增，不重定义 `worktree_path`。
- `POST /tasks` 缺少、为空、类型不合法的 `project_path` 必须报校验错误。
- `PATCH /tasks/{id}` 请求体只要出现 `project_path` 就必须失败，不能静默忽略。
- `Task` 响应始终包含 `project_path`，不能因为旧库或空值省略。
- SQLite 旧 schema 缺 `project_path` 列时必须快速失败，禁止自动补列、懒迁移、双 schema 兼容或从 `worktree_path` 伪造值。
- OpenCode session 的 `query.directory` 只能取 `project_path`，`worktree_path` 继续只表示执行目录。

### Task 1: 锁定 contract 与生成产物上的 `project_path` 新事实

**Files:**
- Modify: `modules/contract/openapi/openapi.yaml`
- Modify: `modules/contract/src/index.ts`
- Modify: `modules/contract/test/contract-package.test.ts`
- Modify: `modules/contract/generated/openapi.ts`
- Modify: `modules/contract/generated/zod.ts`
- Modify: `modules/contract/generated/types.ts`
- Modify: `modules/contract/generated/client.ts`
- Modify: `modules/contract/generated/_client/**`
- Modify: `modules/contract/generated/_types/**`

- [ ] **Step 1: 先补 contract 失败测试，锁定 `project_path` 的公开约束**

在 `modules/contract/test/contract-package.test.ts` 增加断言，先让测试在实现前失败。至少覆盖 `Task` schema、`CreateTaskRequest`、`PatchTaskRequest`、client create input 和 OpenAPI 文档。示例：

```ts
it("requires project_path in task responses and create requests", () => {
  const taskSchema = contractModule.openApiDocument.components.schemas.Task as {
    properties: Record<string, unknown>;
    required: string[];
  };
  const createSchema = contractModule.openApiDocument.components.schemas
    .CreateTaskRequest as {
    properties: Record<string, unknown>;
    required: string[];
  };

  expect(taskSchema.required).toContain("project_path");
  expect(createSchema.required).toContain("project_path");
  expect(taskSchema.properties.project_path).toEqual({
    minLength: 1,
    type: "string",
  });
});

it("does not allow project_path inside PatchTaskRequest", () => {
  const patchSchema = contractModule.openApiDocument.components.schemas
    .PatchTaskRequest as { properties: Record<string, unknown> };

  expect(patchSchema.properties.project_path).toBeUndefined();
  expect(
    contractModule.patchTaskRequestSchema.safeParse({ project_path: "/repo" })
      .success,
  ).toBe(false);
});
```

- [ ] **Step 2: 运行 contract 定向测试，确认当前基线先失败**

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "project_path|PatchTaskRequest"`

Expected: FAIL，提示 `project_path` 尚未出现在 `Task` / `CreateTaskRequest`，且 `PatchTaskRequest` 仍未显式拒绝该字段。

- [ ] **Step 3: 修改 OpenAPI 与包级 schema/type 导出**

在 `modules/contract/openapi/openapi.yaml` 中做三处核心调整：
1. `Task.required` 新增 `project_path`，并在 `properties` 中定义 `type: string` + `minLength: 1`。
2. `CreateTaskRequest.required` 新增 `project_path`。
3. `PatchTaskRequest` 保持没有 `project_path`，并加上 `additionalProperties: false`，让生成出的 Zod schema 走严格对象。

关键 YAML 片段应接近：

```yaml
Task:
  type: object
  additionalProperties: false
  required:
    - task_id
    - task_spec
    - project_path
    - session_id
    - worktree_path
    - pull_request_url
    - dependencies
    - done
    - status
    - created_at
    - updated_at
  properties:
    project_path:
      type: string
      minLength: 1

CreateTaskRequest:
  type: object
  additionalProperties: false
  required:
    - task_spec
    - project_path
  properties:
    task_spec:
      type: string
      minLength: 1
    project_path:
      type: string
      minLength: 1

PatchTaskRequest:
  type: object
  additionalProperties: false
  properties:
    task_spec:
      type: string
      minLength: 1
```

`modules/contract/src/index.ts` 不需要额外发明新 helper，只要继续从 `schemas` 导出更新后的 `taskSchema`、`createTaskRequestSchema`、`patchTaskRequestSchema` 与类型即可。

- [ ] **Step 4: 刷新生成产物并确认 contract 测试转绿**

Run: `pnpm --filter @aim-ai/contract run generate && pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "project_path|PatchTaskRequest"`

Expected: PASS，且 `modules/contract/generated/**` 中 `Task` / `CreateTaskRequest` 带 `project_path`，`PatchTaskRequest` 的 Zod/object 定义为严格对象或等价拒绝未知字段的结构。

- [ ] **Step 5: 提交 contract 基线**

```bash
git add modules/contract/openapi/openapi.yaml modules/contract/src/index.ts modules/contract/test/contract-package.test.ts modules/contract/generated
git commit -m "feat: add task project_path contract"
```

### Task 2: 收敛 API 请求校验、响应 shape 与 SQLite fail-fast 规则

**Files:**
- Modify: `modules/api/src/routes/tasks.ts`
- Modify: `modules/api/src/task-repository.ts`
- Modify: `modules/api/test/task-routes.test.ts`
- Modify: `modules/api/test/task-repository.test.ts`

- [ ] **Step 1: 先补 API / repository 失败测试，覆盖 create、patch 与旧 schema 边界**

在 `modules/api/test/task-routes.test.ts` 新增三类断言：创建必须带 `project_path`、PATCH 传 `project_path` 返回 400、所有成功响应都带 `project_path`。在 `modules/api/test/task-repository.test.ts` 新增旧 schema 缺列即失败的断言。示例：

```ts
it("rejects POST /tasks when project_path is missing", async () => {
  await useProjectRoot("rejects-missing-project-path");
  const app = apiModule.createApp();

  const response = await app.request(contractModule.tasksPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task_spec: "write plan only" }),
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    code: "TASK_VALIDATION_ERROR",
  });
});

it("rejects PATCH /tasks/:id when project_path is present", async () => {
  const response = await app.request(resolveTaskByIdPath(createdTask.task_id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_path: "/repo/other" }),
  });

  expect(response.status).toBe(400);
});

it("fails fast when an existing tasks table lacks project_path", async () => {
  database.exec(`
    CREATE TABLE tasks (
      task_id TEXT PRIMARY KEY,
      task_spec TEXT NOT NULL,
      dependencies TEXT NOT NULL,
      done INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  expect(() => createTaskRepository()).toThrowError(/tasks schema/i);
});
```

- [ ] **Step 2: 运行 API 定向测试，确认当前实现先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts modules/api/test/task-repository.test.ts`

Expected: FAIL，当前 `POST /tasks` 还没要求 `project_path`，`PATCH` 还可能静默忽略未知字段，旧 schema 校验也还没把 `project_path` 当成必需列。

- [ ] **Step 3: 修改 route 层与 repository 层，把 `project_path` 变成必填持久化事实**

在 `modules/api/src/routes/tasks.ts`：
1. `parseCreateTaskRequest()` 继续使用 contract schema，但错误消息改为覆盖 `project_path` 缺失/非法场景。
2. `parsePatchTaskRequest()` 先保留原始 `payload`，若 `typeof payload === "object" && payload !== null && "project_path" in payload`，直接返回 `TASK_VALIDATION_ERROR`，不要依赖 Zod 默认 strip 行为。

示例：

```ts
const parsePatchTaskRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);

  if (
    typeof payload === "object" &&
    payload !== null &&
    "project_path" in payload
  ) {
    return {
      error: buildValidationError("project_path cannot be patched"),
      ok: false as const,
    };
  }

  const result = patchTaskRequestSchema.safeParse(payload);
  // ...existing success/error flow
};
```

在 `modules/api/src/task-repository.ts`：
1. `TaskRow`、`requiredColumns`、`mapTaskRow()`、`createTasksTable()`、`insertTaskStatement`、`SELECT` 列表都加入 `project_path`。
2. `createTask()` 必须从 `input.project_path` 写入，不允许 fallback。
3. `updateTask()` 明确保持原值，不接受 patch 改写。
4. 兼容 schema 白名单中加入 `project_path TEXT NOT NULL`，让旧库缺列时直接抛出 `tasks schema is incompatible`。

关键实现骨架：

```ts
type TaskRow = {
  project_path: string;
  // ...existing fields
};

const requiredColumns = [
  { name: "task_id", notnull: 0, pk: 1, type: "TEXT" },
  { name: "task_spec", notnull: 1, pk: 0, type: "TEXT" },
  { name: "project_path", notnull: 1, pk: 0, type: "TEXT" },
  // ...existing fields
] as const;

const mapTaskRow = (row: TaskRow) =>
  taskSchema.parse({
    task_id: row.task_id,
    task_spec: row.task_spec,
    project_path: row.project_path,
    // ...existing fields
  });
```

- [ ] **Step 4: 重新运行 API 定向测试，确认 request/response/schema 行为闭环**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts modules/api/test/task-repository.test.ts`

Expected: PASS，创建成功响应和读接口响应都返回 `project_path`；PATCH 出现 `project_path` 返回 400；旧 schema 缺列快速失败。

- [ ] **Step 5: 提交 API + SQLite 基线**

```bash
git add modules/api/src/routes/tasks.ts modules/api/src/task-repository.ts modules/api/test/task-routes.test.ts modules/api/test/task-repository.test.ts
git commit -m "feat: persist task project_path"
```

### Task 3: 切换 scheduler / session adapter 到 `project_path`

**Files:**
- Modify: `modules/api/src/opencode-sdk-adapter.ts`
- Modify: `modules/api/test/opencode-sdk-adapter.test.ts`
- Modify: `modules/api/test/task-session-coordinator.test.ts`
- Modify: `modules/api/test/task-session-coordinator-default-adapter.test.ts`
- Modify: `modules/api/test/task-scheduler.test.ts`

- [ ] **Step 1: 先补 coordinator / adapter 失败测试，锁定目录来源切换**

在 `modules/api/test/opencode-sdk-adapter.test.ts`、`modules/api/test/task-session-coordinator.test.ts`、`modules/api/test/task-session-coordinator-default-adapter.test.ts` 和 `modules/api/test/task-scheduler.test.ts` 的 `createTask(...)` / inline task fixture 中统一补 `project_path`，并把 `modules/api/test/opencode-sdk-adapter.test.ts` 的核心断言改成 session directory 必须等于 `project_path` 而不是 `worktree_path`。示例：

```ts
const task = createTask({
  project_path: "/repo",
  worktree_path: "/repo/.worktrees/task-1",
});

expect(create).toHaveBeenCalledWith({
  query: {
    directory: "/repo",
  },
  throwOnError: true,
});
```

同时在 prompt 断言里要求包含：

```ts
expect(promptAsync).toHaveBeenCalledWith({
  body: {
    parts: [
      {
        text: expect.stringContaining("project_path: /repo"),
        type: "text",
      },
    ],
    // ...
  },
  // ...
});
```

- [ ] **Step 2: 运行 scheduler/coordinator 定向测试，确认当前基线先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/opencode-sdk-adapter.test.ts modules/api/test/task-session-coordinator.test.ts modules/api/test/task-session-coordinator-default-adapter.test.ts modules/api/test/task-scheduler.test.ts`

Expected: FAIL，当前 adapter 仍把 `worktree_path` 传给 `client.session.create({ query.directory })`，fixture 里也还缺 `project_path`。

- [ ] **Step 3: 修改 OpenCode adapter，明确只消费 `project_path`**

在 `modules/api/src/opencode-sdk-adapter.ts` 中：
1. `buildTaskPrompt()` 增加 `project_path` 行，保留 `worktree_path` 作为执行目录信息。
2. `createSession()` 的 `query.directory` 改成 `task.project_path`。
3. 不新增任何 fallback：即使 `worktree_path` 有值，也不能再参与 session directory 选择。

实现片段应接近：

```ts
const buildTaskPrompt = (action: "continue" | "start", task: Task) =>
  `${action === "start" ? "Start" : "Continue"} the assigned task session.

task_id: ${task.task_id}
task_spec: ${task.task_spec}
project_path: ${task.project_path}
worktree_path: ${task.worktree_path ?? "null"}
pull_request_url: ${task.pull_request_url ?? "null"}
`;

const session = await client.session.create({
  query: { directory: task.project_path },
  throwOnError: true,
});
```

- [ ] **Step 4: 重新运行 scheduler/coordinator 测试，确认目录语义已经切换**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/opencode-sdk-adapter.test.ts modules/api/test/task-session-coordinator.test.ts modules/api/test/task-session-coordinator-default-adapter.test.ts modules/api/test/task-scheduler.test.ts`

Expected: PASS，所有 fixture 都带 `project_path`，session directory 只使用 `project_path`，`worktree_path` 仅保留在 prompt/任务语义中。

- [ ] **Step 5: 提交 scheduler / session 目录切换**

```bash
git add modules/api/src/opencode-sdk-adapter.ts modules/api/test/opencode-sdk-adapter.test.ts modules/api/test/task-session-coordinator.test.ts modules/api/test/task-session-coordinator-default-adapter.test.ts modules/api/test/task-scheduler.test.ts
git commit -m "feat: use project path for opencode sessions"
```

### Task 4: 更新 CLI、Web 创建链路与 UI 展示

**Files:**
- Modify: `modules/cli/src/commands/task/create.ts`
- Modify: `modules/cli/test/task-command.test.ts`
- Modify: `modules/web/src/features/task-dashboard/api/task-dashboard-api.ts`
- Modify: `modules/web/src/features/task-dashboard/use-task-create-mutation.ts`
- Modify: `modules/web/src/features/task-dashboard/components/create-task-drawer.tsx`
- Modify: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`
- Modify: `modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts`
- Modify: `modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`
- Modify: `modules/web/src/features/task-dashboard/components/task-details-drawer.tsx`
- Modify: `modules/web/test/task-dashboard.spec.ts`
- Modify: `modules/web/test/app.spec.ts`

- [ ] **Step 1: 先补 CLI / Web 失败测试，锁定创建请求体与展示字段**

在 `modules/cli/test/task-command.test.ts` 中更新 `startTaskServer()` 返回的 fake task 与 POST 请求断言；在 `modules/web/test/task-dashboard.spec.ts` 中更新 `buildTask(...)` 返回值，让所有 mocked task 都带 `project_path`，并让 create-flow 断言改成必须发送该字段；在 `modules/web/test/app.spec.ts` 中更新源码断言。示例：

```ts
expect(server.requests[0]).toMatchObject({
  method: "POST",
  path: "/api/tasks",
  json: {
    task_spec: "write spec",
    project_path: "/repo",
    dependencies: ["task-a", "task-b"],
  },
});

await expect
  .poll(() => createRequestBodyText)
  .toEqual(
    JSON.stringify({
      task_spec: "Ship create flow",
      project_path: "/repo",
    }),
  );
```

- [ ] **Step 2: 运行 CLI / Web 定向测试，确认基线先失败**

Run: `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts && pnpm --filter @aim-ai/web exec vitest run --config ../../vitest.workspace.ts --project web modules/web/test/app.spec.ts && pnpm --filter @aim-ai/web exec playwright test modules/web/test/task-dashboard.spec.ts`

Expected: FAIL，当前 CLI 没有 `--project-path`，dashboard 仍只传 `task_spec`，view model 也还没有 `projectPath`。

- [ ] **Step 3: 修改 CLI 与 dashboard 创建链路，让 `project_path` 成为必填输入**

`modules/cli/src/commands/task/create.ts` 增加：

```ts
static override flags = {
  "project-path": Flags.string({ description: "Task project root path" }),
  // ...existing flags
};

const task = await client.createTask({
  task_spec: requireFlag(flags["task-spec"], "task-spec"),
  project_path: requireFlag(flags["project-path"], "project-path"),
  // ...existing fields
});
```

`modules/web/src/features/task-dashboard/use-task-create-mutation.ts` 把 mutation input 改成对象；`task-dashboard-api.ts` 改成：

```ts
export const createTaskFromDashboard = async ({
  projectPath,
  taskSpec,
}: {
  projectPath: string;
  taskSpec: string;
}): Promise<Task> => {
  const client = createWebApiClient();

  return client.createTask({
    project_path: projectPath,
    task_spec: taskSpec,
  });
};
```

`create-task-drawer.tsx` 新增 `Project Path` 文本输入并把 `onSubmit` 改成接收 `{ projectPath, taskSpec }`；`dashboard-page.tsx` 用同样的对象透传给 mutation。

- [ ] **Step 4: 更新 dashboard 视图模型与详情展示，消费始终返回的 `project_path`**

`modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts` 和 `task-dashboard-adapter.ts` 增加 `projectPath`；`task-details-drawer.tsx` 展示该字段。示例：

```ts
export type DashboardTask = {
  id: string;
  title: string;
  taskSpec: string;
  projectPath: string;
  sessionId: string | null;
  worktreePath: string | null;
  // ...
};

export const adaptDashboardTask = (task: Task): DashboardTask => ({
  id: task.task_id,
  title: summarizeTaskSpec(task.task_spec),
  taskSpec: task.task_spec,
  projectPath: task.project_path,
  // ...
});
```

在抽屉中增加：

```tsx
<Text>Project Path: {task.projectPath}</Text>
```

- [ ] **Step 5: 重新运行 CLI / Web 测试，确认创建链路与展示闭环**

Run: `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts && pnpm --filter @aim-ai/web exec vitest run --config ../../vitest.workspace.ts --project web modules/web/test/app.spec.ts && pnpm --filter @aim-ai/web exec playwright test modules/web/test/task-dashboard.spec.ts`

Expected: PASS，CLI 和 dashboard 都会发送 `project_path`，详情抽屉可以显示该字段，源码断言从旧的 `client.createTask({ task_spec: taskSpec })` 更新为带 `project_path` 的新调用。

- [ ] **Step 6: 提交上游调用方与 UI 变更**

```bash
git add modules/cli/src/commands/task/create.ts modules/cli/test/task-command.test.ts modules/web/src/features/task-dashboard/api/task-dashboard-api.ts modules/web/src/features/task-dashboard/use-task-create-mutation.ts modules/web/src/features/task-dashboard/components/create-task-drawer.tsx modules/web/src/features/task-dashboard/components/dashboard-page.tsx modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts modules/web/src/features/task-dashboard/components/task-details-drawer.tsx modules/web/test/task-dashboard.spec.ts modules/web/test/app.spec.ts
git commit -m "feat: thread task project_path through clients"
```

### Task 5: 运行全链路验证并收口生成产物差异

**Files:**
- Modify: `modules/contract/generated/**`（如 Task 1 后仍有未提交差异）
- Modify: `modules/api/test/**` / `modules/cli/test/**` / `modules/web/test/**`（仅在前面步骤修正测试名或 fixture 不一致时）

- [ ] **Step 1: 运行 contract、api、cli、web 的最小闭环验证**

Run: `pnpm --filter @aim-ai/contract run generate:check && pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts modules/api/test/task-repository.test.ts modules/api/test/opencode-sdk-adapter.test.ts modules/api/test/task-session-coordinator.test.ts modules/api/test/task-session-coordinator-default-adapter.test.ts modules/api/test/task-scheduler.test.ts && pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts && pnpm --filter @aim-ai/web exec vitest run --config ../../vitest.workspace.ts --project web modules/web/test/app.spec.ts && pnpm --filter @aim-ai/web exec playwright test modules/web/test/task-dashboard.spec.ts`

Expected: PASS，`project_path` 在 contract/API/UI/CLI/session adapter 闭环一致，且没有生成产物漂移。

- [ ] **Step 2: 运行仓库级 OpenAPI 校验，确认共享事实源没有偏离**

Run: `pnpm run openapi:check`

Expected: PASS，根级脚本可以从构建后的 `@aim-ai/contract` 读取到包含 `project_path` 的 `/tasks` 和 `/tasks/{taskId}` 契约。

- [ ] **Step 3: 若验证暴露命名或类型不一致，立即就地修正后重跑同一命令**

重点检查：

```ts
type Task = {
  project_path: string;
  worktree_path: string | null;
};

type DashboardTask = {
  projectPath: string;
  worktreePath: string | null;
};
```

不要留下 `projectRoot`、`repoPath`、`workspacePath` 之类与 spec 不一致的新命名。

- [ ] **Step 4: 提交最终验证通过后的剩余修正**

```bash
git add modules/contract/generated modules/api modules/cli modules/web
git commit -m "test: cover task project_path flow"
```
