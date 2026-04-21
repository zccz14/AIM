# Task Lifecycle Pino Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `modules/api` 内引入最小 pino JSON logger，并且只在五个既有生命周期动作真实成功后记录 `task_created`、`task_session_bound`、`task_session_continued`、`task_resolved`、`task_rejected` 五类成功事件，不改动任何 API contract 或生命周期语义。

**Architecture:** 继续沿用当前 `modules/api` 的薄装配结构：在 `src/logger.ts` 集中创建基础 pino logger 与 task-event payload helper，由 `server.ts` 负责实例化，再把 logger 传给 route 注册和 scheduler。路由侧只在 repository 成功返回后的分支记录 create/resolve/reject，scheduler 侧继续保留 logger 注入能力，在 assignment 与 continue 调用真正成功后记录 bind/continue；测试沿用现有 route black-box 和 scheduler spy 风格做最小断言，避免新增独立日志基础设施或改动 contract 包。

**Tech Stack:** TypeScript、Hono、pino、Vitest、pnpm workspace

---

## 文件结构与职责映射

**新增文件**
- `modules/api/src/logger.ts`：封装 `createApiLogger()`、task 成功事件枚举、`buildTaskLogFields()` / `buildTaskResultPreview()` 等最小 helper，统一生成稳定扁平的 pino `info` payload。

**修改文件**
- `modules/api/package.json`：增加 `pino` 运行时依赖，保持脚本不变。
- `pnpm-lock.yaml`：记录 `modules/api` 新增 `pino` 依赖解析结果。
- `modules/api/src/app.ts`：给 `createApp()` 增加可选 logger 参数，并把它传给 `registerTaskRoutes()`；默认行为保持不变。
- `modules/api/src/routes/tasks.ts`：扩展 `registerTaskRoutes()` 签名以接收 logger；只在 `createTask()` / `resolveTask()` / `rejectTask()` 成功 payload 返回后写 success 日志，不触碰 `PATCH /tasks/{id}`。
- `modules/api/src/task-scheduler.ts`：把注入 logger 类型从 `error|warn` 扩成 `error|warn|info`，在 assignment 真正确认成功后记录 `task_session_bound`，在 `sendContinuePrompt()` resolve 后记录 `task_session_continued`。
- `modules/api/src/server.ts`：创建基础 pino logger，并把它同时传给 `createApp()` 与 `createTaskScheduler()`；其余启动行为不变。
- `modules/api/test/task-routes.test.ts`：增加 route 成功路径日志断言，验证 create、resolve、reject 的 event 名称、字段集合与 success-after-action 触发点。
- `modules/api/test/task-scheduler.test.ts`：增加 scheduler 成功日志断言，验证 bind 和 continue 仅在真实成功后记录，跳过/失败路径不误记 success。
- `modules/api/test/server.test.ts`：锁定 server 会创建一次 logger 并向 app/scheduler 传入同一个 logger，同时不改变 scheduler disabled 分支。

**预期不修改文件**
- `modules/api/src/task-repository.ts`：本任务只消费 repository 成功快照做日志，不改变存储 schema 或 repository contract。
- `modules/contract/**`：spec 明确禁止 contract 变更，本次不新增 schema、path 或响应字段。
- `modules/api/test/task-repository.test.ts`：日志触发点都在 route/scheduler 装配层，repository 测试无需感知日志。
- `modules/cli/**`、`modules/web/**`、`modules/opencode-plugin/**`：本次日志能力严格限定在 `modules/api`。

**只读参考文件**
- `docs/superpowers/specs/2026-04-21-task-lifecycle-pino-logs-design.md`：唯一 scope 来源；不得扩展到失败日志、额外事件、contract 变更或跨模块 logger 抽象。
- `modules/api/src/routes/tasks.ts`：现有 create/resolve/reject 成功分支和错误返回风格参考。
- `modules/api/src/task-scheduler.ts`：现有 logger 注入与 per-task isolation 风格参考。
- `modules/api/test/task-routes.test.ts`、`modules/api/test/task-scheduler.test.ts`、`modules/api/test/server.test.ts`：新增断言必须贴合当前测试组织方式。

## 实施约束

- 只允许五个 success event：`task_created`、`task_session_bound`、`task_session_continued`、`task_resolved`、`task_rejected`；禁止顺手补第六个事件、开始事件或失败事件。
- 所有 success 日志都必须在对应动作真实成功之后写出：route 侧以 repository 返回 payload 为准，scheduler 侧以 `assignSessionIfUnassigned()` 返回带 `session_id` 快照与 `sendContinuePrompt()` resolve 为准。
- 日志字段至少包含 `event`、`task_id`；仅在快照存在值时附加 `session_id`、`status`、`project_path`，`result_preview` 只用于 resolve/reject，且必须做固定长度截断，不能输出完整长文本。
- `PATCH /tasks/{id}`、not found、validation error、running skip、duplicate session skip、done task skip、throw error 路径都不能产出 success 日志。
- scheduler 现有 `warn` / `error` 行为必须保留；新增 `info` 仅用于上述成功事件。
- 允许为了测试注入 spy logger，但不创建新的日志 transport、环境开关或跨 package 抽象。

### Task 1: 引入最小 logger 模块与依赖边界

**Files:**
- Modify: `modules/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `modules/api/src/logger.ts`
- Test: `modules/api/test/server.test.ts`

- [ ] **Step 1: 先在 server 测试中锁定 logger 装配边界**

在 `modules/api/test/server.test.ts` 先新增 logger mock，确保 `startServer()` 会创建一个 logger，并把同一个对象分别传给 `createApp()` 和 `createTaskScheduler()`。示例：

```ts
const mockCreateApiLogger = vi.fn();

vi.mock("../src/logger.js", () => ({
  createApiLogger: mockCreateApiLogger,
}));

it("creates one api logger and passes it to app and scheduler", async () => {
  process.env.TASK_SCHEDULER_ENABLED = "true";
  process.env.OPENCODE_BASE_URL = "http://127.0.0.1:54321";
  process.env.OPENCODE_PROVIDER_ID = "anthropic";
  process.env.OPENCODE_MODEL_ID = "claude-sonnet-4-5";

  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  const server = { close: vi.fn(), once: vi.fn() };
  const scheduler = { start: vi.fn(), stop: vi.fn() };

  mockCreateApiLogger.mockReturnValue(logger);
  mockCreateApp.mockReturnValue({ fetch: vi.fn() });
  mockServe.mockReturnValue(server);
  mockCreateTaskRepository.mockReturnValue({});
  mockCreateTaskScheduler.mockReturnValue(scheduler);
  mockCreateTaskSessionCoordinator.mockReturnValue({});

  const { startServer } = await import("../src/server.js");

  startServer();

  expect(mockCreateApiLogger).toHaveBeenCalledTimes(1);
  expect(mockCreateApp).toHaveBeenCalledWith({ logger });
  expect(mockCreateTaskScheduler).toHaveBeenCalledWith(
    expect.objectContaining({ logger }),
  );
});
```

- [ ] **Step 2: 运行 server 定向测试，确认断言先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/server.test.ts -t "creates one api logger and passes it to app and scheduler"`

Expected: FAIL，提示 `../src/logger.js` 尚不存在，或 `createApp()` / `createTaskScheduler()` 尚未接收 `logger` 参数。

- [ ] **Step 3: 在 `modules/api` 依赖和 logger 模块中定义最小 pino 边界**

先在 `modules/api/package.json` 增加依赖：

```json
"dependencies": {
  "@aim-ai/contract": "workspace:*",
  "@hono/node-server": "^1.19.6",
  "@opencode-ai/sdk": "^1.14.18",
  "hono": "^4.10.5",
  "pino": "^9.7.0"
}
```

然后新增 `modules/api/src/logger.ts`，把字段整形收敛到一个很薄的模块：

```ts
import pino from "pino";
import type { Task } from "@aim-ai/contract";

export type TaskSuccessEvent =
  | "task_created"
  | "task_session_bound"
  | "task_session_continued"
  | "task_resolved"
  | "task_rejected";

export type ApiLogger = Pick<pino.Logger, "info" | "warn" | "error">;

const resultPreviewLimit = 200;

export const createApiLogger = (): ApiLogger => pino();

export const buildTaskResultPreview = (result: string) =>
  result.slice(0, resultPreviewLimit);

export const buildTaskLogFields = (
  event: TaskSuccessEvent,
  task: Pick<
    Task,
    "task_id" | "session_id" | "status" | "project_path" | "result"
  >,
) => ({
  event,
  task_id: task.task_id,
  ...(task.session_id ? { session_id: task.session_id } : {}),
  ...(task.status ? { status: task.status } : {}),
  ...(task.project_path ? { project_path: task.project_path } : {}),
  ...((event === "task_resolved" || event === "task_rejected") &&
  typeof task.result === "string"
    ? { result_preview: buildTaskResultPreview(task.result) }
    : {}),
});
```

这里不要增加 child logger 工厂之外的额外配置；如果实现里想用 `logger.child({ component: ... })`，也必须保持 helper 只负责 payload 整形，不引入新的 transport、redaction 或 env-based branching。

- [ ] **Step 4: 在 `server.ts` 中装配 logger，并保持启动语义不变**

在 `modules/api/src/server.ts` 最小接线：

```ts
import { createApiLogger } from "./logger.js";

export const startServer = () => {
  const logger = createApiLogger();
  const isTaskSchedulerEnabled = process.env.TASK_SCHEDULER_ENABLED !== "false";
  let scheduler: ReturnType<typeof createTaskScheduler> | undefined;
  let stopScheduler: (() => void) | undefined;

  if (isTaskSchedulerEnabled) {
    const taskScheduler = createTaskScheduler({
      coordinator: createTaskSessionCoordinator(coordinatorConfig),
      logger,
      taskRepository,
    });
    scheduler = taskScheduler;
    stopScheduler = () => taskScheduler.stop();
  }

  const server = serve({ fetch: createApp({ logger }).fetch, port });
  // 其余逻辑保持原样
};
```

- [ ] **Step 5: 安装依赖并重新运行 server 测试，确认装配边界通过**

Run: `pnpm install --lockfile-only && pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/server.test.ts`

Expected: PASS，且原有 server startup 用例继续通过，说明 logger 装配没有破坏 scheduler enable/disable 语义。

- [ ] **Step 6: Commit**

```bash
git add modules/api/package.json pnpm-lock.yaml modules/api/src/logger.ts modules/api/src/server.ts modules/api/test/server.test.ts
git commit -m "feat: add api logger wiring"
```

### Task 2: 为 task routes 增加 create/resolve/reject 成功日志

**Files:**
- Modify: `modules/api/src/app.ts`
- Modify: `modules/api/src/routes/tasks.ts`
- Test: `modules/api/test/task-routes.test.ts`

- [ ] **Step 1: 先在 route 测试中锁定三条 success event 的字段与时机**

在 `modules/api/test/task-routes.test.ts` 先把 vitest import 扩成 `import { afterEach, describe, expect, it, vi } from "vitest";`，再新增可复用 logger spy，并通过 `createApp({ logger })` 断言 create、resolve、reject 成功后才会写日志。示例：

```ts
const createLogger = () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
});

it("logs task_created after POST /tasks succeeds", async () => {
  await useProjectRoot("logs-task-created");

  const logger = createLogger();
  const app = apiModule.createApp({ logger });
  const response = await app.request(contractModule.tasksPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project_path: "/repo/main",
      session_id: "session-1",
      status: "running",
      task_spec: "write sqlite-backed route tests",
    }),
  });

  const createdTask = await response.json();

  expect(response.status).toBe(201);
  expect(logger.info).toHaveBeenCalledWith({
    event: "task_created",
    project_path: "/repo/main",
    session_id: "session-1",
    status: "running",
    task_id: createdTask.task_id,
  });
});

it("logs task_resolved with a truncated result preview after repository success", async () => {
  await useProjectRoot("logs-task-resolved");

  const logger = createLogger();
  const app = apiModule.createApp({ logger });
  const createResponse = await app.request(contractModule.tasksPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project_path: "/repo/resolve-target",
      task_spec: "resolve me",
      status: "running",
    }),
  });
  const createdTask = await createResponse.json();
  const longResult = "x".repeat(250);

  const resolveResponse = await app.request(
    resolveTaskResolvePath(createdTask.task_id),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: longResult }),
    },
  );

  expect(resolveResponse.status).toBe(204);
  expect(logger.info).toHaveBeenCalledWith({
    event: "task_resolved",
    project_path: "/repo/resolve-target",
    status: "succeeded",
    task_id: createdTask.task_id,
    result_preview: longResult.slice(0, 200),
  });
});

it("logs task_rejected with a truncated result preview after repository success", async () => {
  await useProjectRoot("logs-task-rejected");

  const logger = createLogger();
  const app = apiModule.createApp({ logger });
  const createResponse = await app.request(contractModule.tasksPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project_path: "/repo/reject-target",
      task_spec: "reject me",
      status: "running",
    }),
  });
  const createdTask = await createResponse.json();
  const longResult = "needs more work ".repeat(20);

  const rejectResponse = await app.request(
    resolveTaskRejectPath(createdTask.task_id),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: longResult }),
    },
  );

  expect(rejectResponse.status).toBe(204);
  expect(logger.info).toHaveBeenCalledWith({
    event: "task_rejected",
    project_path: "/repo/reject-target",
    status: "failed",
    task_id: createdTask.task_id,
    result_preview: longResult.slice(0, 200),
  });
});
```

同一组测试里还要补一条非成功保护断言，例如 `404 resolve` 或 `400 reject` 后 `logger.info` 仍为 0 次，防止日志写在 repository 调用前。

- [ ] **Step 2: 运行 route 定向测试，确认断言先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts -t "logs task_created|logs task_resolved|logs task_rejected"`

Expected: FAIL，提示 `createApp` 还不接收 `logger`，或 route 代码尚未调用 `logger.info()`。

- [ ] **Step 3: 给 `createApp()` 和 `registerTaskRoutes()` 增加 logger 注入参数**

在 `modules/api/src/app.ts` 增加可选 options，但保持默认行为兼容现有调用：

```ts
import type { ApiLogger } from "./logger.js";

type CreateAppOptions = {
  logger?: ApiLogger;
};

export const createApp = (options: CreateAppOptions = {}) => {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));

  registerHealthRoute(app);
  registerTaskRoutes(app, { logger: options.logger });
  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
```

在 `modules/api/src/routes/tasks.ts` 把 logger 接到 success 分支：

```ts
import type { ApiLogger } from "../logger.js";
import { buildTaskLogFields } from "../logger.js";

type RegisterTaskRoutesOptions = {
  logger?: ApiLogger;
};

export const registerTaskRoutes = (
  app: Hono,
  options: RegisterTaskRoutesOptions = {},
) => {
  const logger = options.logger;

  app.post(tasksPath, async (context) => {
    const payload = await getRepository().createTask(input.data);
    logger?.info(buildTaskLogFields("task_created", payload));
    return context.json(payload, 201);
  });

  app.post(taskResolveRoutePath, async (context) => {
    const payload = await getRepository().resolveTask(taskId, input.data.result);
    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }
    logger?.info(buildTaskLogFields("task_resolved", payload));
    return new Response(null, { status: 204 });
  });

  app.post(taskRejectRoutePath, async (context) => {
    const payload = await getRepository().rejectTask(taskId, input.data.result);
    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }
    logger?.info(buildTaskLogFields("task_rejected", payload));
    return new Response(null, { status: 204 });
  });
};
```

不要把 `PATCH /tasks/{id}` 接入通用状态日志 helper，也不要在 validation / not-found 分支写 success event。

- [ ] **Step 4: 运行 route 测试，确认三条 success event 和非成功保护断言通过**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts`

Expected: PASS，且现有 create/read/patch/resolve/reject/delete 契约测试全部继续通过，说明只新增观测性没有改 response 行为。

- [ ] **Step 5: Commit**

```bash
git add modules/api/src/app.ts modules/api/src/routes/tasks.ts modules/api/test/task-routes.test.ts
git commit -m "feat: log successful task route events"
```

### Task 3: 为 scheduler 增加 session bound / continued 成功日志

**Files:**
- Modify: `modules/api/src/task-scheduler.ts`
- Test: `modules/api/test/task-scheduler.test.ts`

- [ ] **Step 1: 先在 scheduler 测试中锁定 success-only 行为**

在 `modules/api/test/task-scheduler.test.ts` 的现有 logger spy 风格上增加 `info`，并分别锁定 bind 与 continue 成功事件。示例：

```ts
it("logs task_session_bound only after assignment returns a bound snapshot", async () => {
  const initialTask = createTask();
  const boundTask = createTask({ session_id: "session-1" });
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  const scheduler = createTaskScheduler({
    coordinator: createCoordinator(),
    logger,
    taskRepository: {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(boundTask),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    },
  });

  await scheduler.runRound();

  expect(logger.info).toHaveBeenCalledWith({
    event: "task_session_bound",
    project_path: "/repo",
    session_id: "session-1",
    status: "created",
    task_id: initialTask.task_id,
  });
});

it("logs task_session_continued only after continue prompt resolves", async () => {
  const task = createTask({ session_id: "session-1", status: "running" });
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const coordinator = createCoordinator();
  const scheduler = createTaskScheduler({
    coordinator,
    logger,
    taskRepository: {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
    },
  });

  await scheduler.runRound();

  expect(coordinator.sendContinuePrompt).toHaveBeenCalledTimes(1);
  expect(logger.info).toHaveBeenCalledWith({
    event: "task_session_continued",
    project_path: "/repo",
    session_id: "session-1",
    status: "running",
    task_id: task.task_id,
  });
});
```

同文件再补两条保护断言：

```ts
expect(logger.info).not.toHaveBeenCalled();
```

分别覆盖 `assignSessionIfUnassigned()` 返回 `null` / 无 `session_id` 快照，以及 `sendContinuePrompt()` reject 的路径，确保没有乐观 success log。

- [ ] **Step 2: 运行 scheduler 定向测试，确认断言先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-scheduler.test.ts -t "task_session_bound|task_session_continued"`

Expected: FAIL，提示 logger 还没有 `info` 调用，或 `CreateTaskSchedulerOptions.logger` 类型尚未允许 `info`。

- [ ] **Step 3: 在 `task-scheduler.ts` 成功分支补日志，不改变跳过/失败逻辑**

把 logger 类型和 success 记录扩成最小增量：

```ts
import { buildTaskLogFields, type ApiLogger } from "./logger.js";

type CreateTaskSchedulerOptions = {
  coordinator: TaskSessionCoordinator;
  concurrency?: number;
  logger?: ApiLogger;
  taskRepository: SchedulerTaskRepository;
};

if (!latestTask.session_id) {
  const { sessionId } = await options.coordinator.createSession(latestTask);
  const assignedTask = await options.taskRepository.assignSessionIfUnassigned(
    latestTask.task_id,
    sessionId,
  );

  if (!assignedTask?.session_id) {
    return;
  }

  latestTask = assignedTask;
  logger.info(buildTaskLogFields("task_session_bound", latestTask));
}

// duplicate / done / non-idle guard 保持原顺序

await options.coordinator.sendContinuePrompt(
  sessionId,
  buildContinuePrompt(latestTask),
);
logger.info(buildTaskLogFields("task_session_continued", latestTask));
```

注意两点：
- `task_session_bound` 必须基于 `assignedTask`，不能基于 `createSession()` 返回值。
- `task_session_continued` 必须写在 `await sendContinuePrompt(...)` 之后，不能放到调用前。

- [ ] **Step 4: 运行 scheduler 测试，确认 success-only 与现有隔离行为都通过**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-scheduler.test.ts`

Expected: PASS，且 duplicate session、running skip、done task、per-task failure isolation、polling loop 相关旧测试继续通过。

- [ ] **Step 5: Commit**

```bash
git add modules/api/src/task-scheduler.ts modules/api/test/task-scheduler.test.ts
git commit -m "feat: log successful scheduler lifecycle events"
```

### Task 4: 完整回归 `modules/api` 并确认日志范围没有外溢

**Files:**
- Modify: `modules/api/test/server.test.ts`
- Test: `modules/api/test/task-routes.test.ts`
- Test: `modules/api/test/task-scheduler.test.ts`
- Test: `modules/api/test/server.test.ts`

- [ ] **Step 1: 补足 server 测试里的 disabled 分支断言，确认 logger 不会强制构造 scheduler 依赖**

如果 Task 1 的 server 测试只覆盖 enabled 分支，再补一条 disabled 分支断言，确认 `createApp({ logger })` 仍会执行，但 `createTaskRepository()` / `createTaskSessionCoordinator()` / `createTaskScheduler()` 不会因为 logger 接线而被误触发。示例：

```ts
it("does not construct scheduler dependencies when disabled even though app logging is enabled", async () => {
  process.env.TASK_SCHEDULER_ENABLED = "false";

  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const server = { close: vi.fn(), once: vi.fn() };

  mockCreateApiLogger.mockReturnValue(logger);
  mockCreateApp.mockReturnValue({ fetch: vi.fn() });
  mockServe.mockReturnValue(server);

  const { startServer } = await import("../src/server.js");

  expect(() => startServer()).not.toThrow();
  expect(mockCreateApp).toHaveBeenCalledWith({ logger });
  expect(mockCreateTaskRepository).not.toHaveBeenCalled();
  expect(mockCreateTaskScheduler).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行完整 `modules/api` 测试套件，确认没有契约回归**

Run: `pnpm --filter @aim-ai/api test`

Expected: PASS，包含 `typecheck`、`biome check`、`build` 与 `vitest --project api`；若失败，优先修复 logger 类型或测试替身，而不是扩大功能范围。

- [ ] **Step 3: 运行仓库级最小验证，确认 lockfile 与格式一致**

Run: `pnpm --filter @aim-ai/contract build && pnpm --filter @aim-ai/api run test:lint && pnpm --filter @aim-ai/api run test:type`

Expected: PASS，说明新增 `pino` 依赖、logger 模块和测试代码都满足当前 workspace 的构建与 lint 约束。

- [ ] **Step 4: 目检日志范围，确认没有超出 spec**

用代码 review checklist 做一次人工确认：

```text
1. modules/api/src/routes/tasks.ts 里只有 task_created / task_resolved / task_rejected 三处 logger.info。
2. modules/api/src/task-scheduler.ts 里只有 task_session_bound / task_session_continued 两处 logger.info。
3. 没有对 PATCH /tasks/{id}、delete、list、health、error path 增加 success logs。
4. result_preview 只出现在 resolved/rejected payload，且长度固定为 200。
5. 没有新增 contract 字段、API response body 字段或 scheduler algorithm 改动。
```

- [ ] **Step 5: Commit**

```bash
git add modules/api/test/server.test.ts modules/api/test/task-routes.test.ts modules/api/test/task-scheduler.test.ts
git commit -m "test: cover api logger lifecycle events"
```
