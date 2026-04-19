# Task CRUD SQLite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `modules/api` 中把现有 Task CRUD stub 路由替换为真实 SQLite 持久化，并在首次访问时自动创建 `<project_dir>/aim.sqlite` 与缺失的 `tasks` 表，同时对不兼容 schema 快速失败。

**Architecture:** 保持 API 侧薄路由结构：`routes/tasks.ts` 只负责 HTTP 校验、错误映射与响应输出，SQLite 路径解析和连接创建下沉到 `task-database.ts`，CRUD、bootstrap、schema 校验和行映射下沉到 `task-repository.ts`。测试继续以 route 黑盒为主，但通过 repo 内临时项目目录驱动真实 `aim.sqlite` 文件，另补一个 repository 级测试文件锁定 bootstrap 与 schema-fast-fail 行为。

**Tech Stack:** TypeScript、Hono、Node `node:sqlite` `DatabaseSync`、Vitest、pnpm workspace

---

## 文件结构与职责映射

**修改文件**
- `modules/api/src/routes/tasks.ts`：移除 stub task 生成逻辑，保留 contract request/query 校验与 `TASK_VALIDATION_ERROR` / `TASK_NOT_FOUND` 映射，并把 CRUD 行为委托给 repository。
- `modules/api/test/task-routes.test.ts`：把 stub 断言改成真实 SQLite 持久化断言；每个测试在仓库内临时项目目录下创建隔离的 `aim.sqlite`，覆盖 POST/GET/PATCH/DELETE、过滤、done 派生、404 和 schema fast-fail。

**新增文件**
- `modules/api/src/task-database.ts`：固定解析 `<project_dir>/aim.sqlite`，提供一个测试期可控的 project-root 解析切口，并返回 `DatabaseSync` 连接与数据库路径。
- `modules/api/src/task-repository.ts`：负责 `tasks` 表建表、schema 兼容性校验、Task 行映射、`done` 派生、CRUD 与过滤查询。
- `modules/api/test/task-repository.test.ts`：覆盖数据库文件自动创建、缺表自动建表、以及不兼容 schema 立即抛错。

**只读参考文件**
- `docs/superpowers/specs/2026-04-19-task-crud-sqlite-design.md`：本计划唯一 scope 来源，后续实现不得扩展到 migration、plugin runtime 或可配置 db path。
- `docs/superpowers/specs/2026-04-19-task-crud-openapi-design.md`：确认 route 请求/响应字段与错误模型继续复用 contract。
- `docs/superpowers/specs/2026-04-18-sqlite-task-runtime-design.md`：确认 `<project_dir>/aim.sqlite`、缺库/缺表自动初始化与 schema 不兼容快速失败的既有约束。
- `modules/api/src/app.ts`：确认 `createApp()` 仍然只注册 route，不引入额外 service 容器。
- `modules/contract/src/index.ts`：确认 API 继续只消费包级 contract 边界。
- `package.json` 与 `vitest.workspace.ts`：确认最终验证命令与 Vitest project 名称。

## 实施约束

- 只处理 `modules/api` 当前的 Task CRUD + SQLite bootstrap，不增加 migration、调度逻辑、分页、排序、模糊搜索或新的 endpoint。
- 生产路径固定为 `<project_dir>/aim.sqlite`；不要把数据库路径开放成业务配置。测试只允许通过“project root 解析切口”把 `<project_dir>` 指向仓库内临时目录。
- `routes/tasks.ts` 必须继续只依赖 `@aim-ai/contract` 的 schema、type 和 path 常量，不直接依赖 contract 生成产物。
- `done` 始终由最终 `status` 推导：`succeeded` / `failed` 为 `true`，其余状态为 `false`；不要把 `done` 当成独立写入字段。
- SQLite 初始化失败、建表失败、schema 不兼容或底层 SQL 异常都应直接冒泡成 5xx，不映射成 `TASK_*` 业务错误。
- 测试产生的目录和数据库文件都必须位于当前仓库内，例如 `.tmp/modules-api-task-routes/<case-name>/aim.sqlite`。

### Task 1: 锁定数据库入口与 bootstrap 行为

**Files:**
- Create: `modules/api/src/task-database.ts`
- Create: `modules/api/src/task-repository.ts`
- Create: `modules/api/test/task-repository.test.ts`

- [ ] **Step 1: 先写 repository 级失败测试，锁定自动建库、自动建表和 schema fast-fail**

在 `modules/api/test/task-repository.test.ts` 新增最小黑盒测试，直接调用尚未实现的 repository API。测试里把 project root 指向仓库内临时目录，并断言 `aim.sqlite` 文件与 `tasks` 表行为。示例：

```ts
import { access, mkdir, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { createTaskRepository } from "../src/task-repository.js";

const tempRoot = join(process.cwd(), ".tmp/modules-api-task-repository");

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);
  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });
  return projectRoot;
};

describe("task repository bootstrap", () => {
  beforeEach(async () => {
    await mkdir(tempRoot, { recursive: true });
  });

  it("creates aim.sqlite and the tasks table on first write", async () => {
    const projectRoot = await createProjectRoot("creates-db");
    const repository = createTaskRepository({ projectRoot });

    const task = repository.createTask({ task_spec: "write tests" });

    await expect(access(join(projectRoot, "aim.sqlite"))).resolves.toBeUndefined();
    expect(task.task_spec).toBe("write tests");
  });

  it("fails fast when the existing tasks table schema is incompatible", async () => {
    const projectRoot = await createProjectRoot("schema-mismatch");
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    database.exec("create table tasks (id text primary key, task_spec text not null)");
    database.close();

    const repository = createTaskRepository({ projectRoot });

    expect(() => repository.listTasks({})).toThrow(/tasks schema/i);
  });
});
```

- [ ] **Step 2: 运行 repository 定向测试，确认当前基线先失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-repository.test.ts`

Expected: FAIL，提示 `../src/task-repository.js` 不存在，或 `createTaskRepository` 未导出。

- [ ] **Step 3: 实现固定数据库入口与 project-root 测试切口**

在 `modules/api/src/task-database.ts` 中新增一个小型入口，只负责把 `<project_dir>/aim.sqlite` 解析并打开。不要暴露任意 `dbPath`；只允许调用方传测试用 `projectRoot`，否则默认从文件位置向上定位仓库根。示例实现：

```ts
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export type TaskDatabaseOptions = {
  projectRoot?: string;
};

export type TaskDatabase = {
  database: DatabaseSync;
  databasePath: string;
};

export const resolveTaskProjectRoot = ({ projectRoot }: TaskDatabaseOptions = {}) =>
  projectRoot ?? process.env.AIM_PROJECT_ROOT ?? defaultProjectRoot;

export const openTaskDatabase = (
  options: TaskDatabaseOptions = {},
): TaskDatabase => {
  const resolvedProjectRoot = resolveTaskProjectRoot(options);
  const databasePath = join(resolvedProjectRoot, "aim.sqlite");

  return {
    database: new DatabaseSync(databasePath),
    databasePath,
  };
};
```

- [ ] **Step 4: 实现 repository bootstrap、schema 校验和最小 Task 映射**

在 `modules/api/src/task-repository.ts` 中实现：
1. `createTaskRepository({ projectRoot? })`
2. 首次访问时调用 `openTaskDatabase()`。
3. `create table if not exists tasks (...)`。
4. `PRAGMA table_info(tasks)` 校验关键列、主键和可空规则；不兼容时抛出 `Error("tasks schema is incompatible")`。
5. `createTask()` 与 `listTasks()` 两个最小方法，足够让当前测试先通过。

建议初始骨架如下：

```ts
import { randomUUID } from "node:crypto";

import { taskSchema, type CreateTaskRequest, type Task, type TaskStatus } from "@aim-ai/contract";

import { openTaskDatabase, type TaskDatabaseOptions } from "./task-database.js";

const createTableSql = `
  create table if not exists tasks (
    task_id text primary key,
    task_spec text not null,
    session_id text,
    worktree_path text,
    pull_request_url text,
    dependencies text not null,
    status text not null,
    done integer not null,
    created_at text not null,
    updated_at text not null
  )
`;

const deriveDone = (status: TaskStatus) =>
  status === "succeeded" || status === "failed";

export type TaskRepository = {
  createTask(input: CreateTaskRequest): Task;
  listTasks(filters: { status?: TaskStatus; done?: boolean; session_id?: string }): Task[];
};

export const createTaskRepository = (options: TaskDatabaseOptions = {}): TaskRepository => {
  const { database } = openTaskDatabase(options);
  database.exec(createTableSql);
  assertTaskSchema(database);

  return {
    createTask(input) {
      const now = new Date().toISOString();
      const status = input.status ?? "created";
      const task = taskSchema.parse({
        task_id: randomUUID(),
        task_spec: input.task_spec,
        session_id: input.session_id ?? null,
        worktree_path: input.worktree_path ?? null,
        pull_request_url: input.pull_request_url ?? null,
        dependencies: input.dependencies ?? [],
        status,
        done: deriveDone(status),
        created_at: now,
        updated_at: now,
      });

      database
        .prepare(`insert into tasks (task_id, task_spec, session_id, worktree_path, pull_request_url, dependencies, status, done, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          task.task_id,
          task.task_spec,
          task.session_id,
          task.worktree_path,
          task.pull_request_url,
          JSON.stringify(task.dependencies),
          task.status,
          task.done ? 1 : 0,
          task.created_at,
          task.updated_at,
        );

      return task;
    },
    listTasks(filters) {
      const rows = database.prepare(`select * from tasks order by created_at asc`).all();
      return rows.map(mapTaskRow);
    },
  };
};
```

`assertTaskSchema()` 至少要校验 `task_id`、`task_spec`、`dependencies`、`status`、`done`、`created_at`、`updated_at` 存在，且 `task_id` 是主键；行映射时把 `dependencies` 从 JSON 文本解析回 `string[]`，把 `done` 从整数转成布尔值。

- [ ] **Step 5: 重新运行 repository 测试，确认 bootstrap 与 fast-fail 达标**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-repository.test.ts`

Expected: PASS，且第一条测试会在临时目录下生成 `aim.sqlite`，第二条测试会抛出 `tasks schema is incompatible` 或等价错误。

- [ ] **Step 6: 提交数据库入口与 bootstrap 基线**

```bash
git add modules/api/src/task-database.ts modules/api/src/task-repository.ts modules/api/test/task-repository.test.ts
git commit -m "feat: add sqlite task repository bootstrap"
```

### Task 2: 把 route 测试切到真实 SQLite 持久化

**Files:**
- Modify: `modules/api/test/task-routes.test.ts`

- [ ] **Step 1: 先把 stub route 测试改成真实持久化失败测试**

重写 `modules/api/test/task-routes.test.ts`，不要再断言固定 `task-123` 或 `task-404`。每个用例在仓库内创建单独 project root，设置 `process.env.AIM_PROJECT_ROOT`，再通过 `createApp()` 调用真实路由。至少覆盖：
1. `POST` 后 `GET /tasks` 和 `GET /tasks/{taskId}` 能读到同一条持久化记录。
2. `GET /tasks` 的 `status`、`done`、`session_id` 过滤生效。
3. `PATCH` 合并字段并在 `status=failed` 后得到 `done=true`。
4. `DELETE` 后再次读取返回 `404`。
5. 预置坏表 schema 时请求返回 `500`。

建议先把一个完整端到端用例写出来：

```ts
it("persists created tasks in sqlite and reads them back through both GET routes", async () => {
  const app = apiModule.createApp();
  const createResponse = await app.request(contractModule.tasksPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task_spec: "write sqlite-backed route tests",
      session_id: "session-1",
      status: "running",
    }),
  });

  expect(createResponse.status).toBe(201);
  const createdTask = await createResponse.json();

  const listResponse = await app.request(
    `${contractModule.tasksPath}?session_id=session-1&status=running&done=false`,
  );
  expect(listResponse.status).toBe(200);
  const listPayload = await listResponse.json();

  const detailResponse = await app.request(resolveTaskByIdPath(createdTask.task_id));
  expect(detailResponse.status).toBe(200);
  const detailPayload = await detailResponse.json();

  expect(listPayload.items).toHaveLength(1);
  expect(listPayload.items[0].task_id).toBe(createdTask.task_id);
  expect(detailPayload.task_id).toBe(createdTask.task_id);
  expect(detailPayload.done).toBe(false);
});
```

- [ ] **Step 2: 运行 route 定向测试，确认当前实现仍按 stub 失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts`

Expected: FAIL，至少会出现“期望列表长度为 1 但仍是 stub 响应”或“坏表 schema 请求没有返回 500”。

- [ ] **Step 3: 加入 repo 内临时项目目录辅助函数并确保测试不污染仓库外路径**

在同一个测试文件中加入固定辅助函数，统一创建和清理 `.tmp/modules-api-task-routes/<case>`，并在每个用例结束后恢复 `process.env.AIM_PROJECT_ROOT`。示例：

```ts
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const routesTempRoot = join(process.cwd(), ".tmp/modules-api-task-routes");

const withProjectRoot = async (name: string, run: () => Promise<void>) => {
  const previousRoot = process.env.AIM_PROJECT_ROOT;
  const projectRoot = join(routesTempRoot, name);
  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;

  try {
    await run();
  } finally {
    if (previousRoot === undefined) {
      delete process.env.AIM_PROJECT_ROOT;
    } else {
      process.env.AIM_PROJECT_ROOT = previousRoot;
    }
  }
};
```

把 schema-fast-fail 测试放在 route 文件里时，直接在该 `projectRoot` 下用 `DatabaseSync(join(projectRoot, "aim.sqlite"))` 预建坏表，再发起 `GET /tasks` 断言 `response.status === 500`。

- [ ] **Step 4: 重新运行 route 定向测试，确认测试本身表达了真实持久化目标**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts`

Expected: 仍然 FAIL，但失败信息只剩“实现尚未接入 repository”，不再包含 stub 固定值假设。

- [ ] **Step 5: 提交真实 SQLite route 测试基线**

```bash
git add modules/api/test/task-routes.test.ts
git commit -m "test: cover sqlite-backed task routes"
```

### Task 3: 用 repository 重写 Task 路由并打通 CRUD

**Files:**
- Modify: `modules/api/src/routes/tasks.ts`
- Modify: `modules/api/src/task-repository.ts`

- [ ] **Step 1: 在 route 中先接入 repository API，对齐缺失的方法并让类型报错暴露出来**

把 `routes/tasks.ts` 改成依赖 `createTaskRepository()`，并先按最终目标调用 `getTaskById()`、`updateTask()`、`deleteTask()`。这样在 repository 方法未补齐前，TypeScript 和测试会先失败，避免继续围绕 stub 演进。目标结构如下：

```ts
import {
  createTaskRequestSchema,
  patchTaskRequestSchema,
  taskByIdPath,
  taskErrorSchema,
  taskListResponseSchema,
  taskStatusSchema,
  tasksPath,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import { createTaskRepository } from "../task-repository.js";

const taskByIdRoutePath = taskByIdPath.replace("{taskId}", ":taskId");

const getRepository = () => createTaskRepository();
```

随后把各 handler 的核心逻辑改成：
1. `POST` -> `getRepository().createTask()` -> `201`
2. `GET /tasks` -> `getRepository().listTasks(filters)` -> `200`
3. `GET /tasks/{taskId}` -> `getRepository().getTaskById()`，找不到时 `TASK_NOT_FOUND`
4. `PATCH /tasks/{taskId}` -> `getRepository().updateTask()`，找不到时 `TASK_NOT_FOUND`
5. `DELETE /tasks/{taskId}` -> `getRepository().deleteTask()`，删除成功 `204`，找不到 `TASK_NOT_FOUND`

- [ ] **Step 2: 运行 route 测试，确认 repository 方法缺失而失败**

Run: `pnpm --filter @aim-ai/api exec vitest run --config ../../vitest.workspace.ts --project api modules/api/test/task-routes.test.ts`

Expected: FAIL，提示 `getTaskById` / `updateTask` / `deleteTask` 未实现，或 route 仍然返回 stub 行为。

- [ ] **Step 3: 在 repository 中补齐读/改/删、过滤查询和 done 派生**

扩展 `modules/api/src/task-repository.ts`，实现完整接口：

```ts
export type TaskListFilters = {
  status?: TaskStatus;
  done?: boolean;
  session_id?: string;
};

export type TaskPatch = PatchTaskRequest;

export type TaskRepository = {
  createTask(input: CreateTaskRequest): Task;
  listTasks(filters: TaskListFilters): Task[];
  getTaskById(taskId: string): Task | null;
  updateTask(taskId: string, patch: TaskPatch): Task | null;
  deleteTask(taskId: string): boolean;
};
```

关键实现要求：
1. `listTasks(filters)` 只支持 `status`、`done`、`session_id`，并按 `created_at asc` 返回。
2. `getTaskById(taskId)` 用 `select * from tasks where task_id = ?`。
3. `updateTask(taskId, patch)` 先读取当前 Task，再把 `patch` 中出现的字段合并回完整 Task，刷新 `updated_at`，并根据合并后的最终 `status` 重新计算 `done`。
4. `deleteTask(taskId)` 用 `changes > 0` 判断是否删除成功。

合并逻辑示例：

```ts
const nextStatus = patch.status ?? current.status;
const nextTask = taskSchema.parse({
  ...current,
  ...patch,
  status: nextStatus,
  done: deriveDone(nextStatus),
  updated_at: new Date().toISOString(),
});
```

SQL 过滤拼接保持最小化即可，例如：

```ts
const clauses: string[] = [];
const values: Array<string | number> = [];

if (filters.status !== undefined) {
  clauses.push("status = ?");
  values.push(filters.status);
}
if (filters.done !== undefined) {
  clauses.push("done = ?");
  values.push(filters.done ? 1 : 0);
}
if (filters.session_id !== undefined) {
  clauses.push("session_id = ?");
  values.push(filters.session_id);
}

const whereSql = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
const rows = database
  .prepare(`select * from tasks ${whereSql} order by created_at asc`)
  .all(...values);
```

- [ ] **Step 4: 用 repository 完成 route 侧错误映射与响应输出**

在 `modules/api/src/routes/tasks.ts` 中保留当前请求校验函数，但把 stub 相关 helper 全部删除。不要在模块顶层缓存 repository；测试会在导入 API 模块后切换 `AIM_PROJECT_ROOT`，因此必须在 `registerTaskRoutes()` 内或每个 handler 中读取当前 repository。建议最终 handler 轮廓如下：

```ts
app.get(tasksPath, (context) => {
  const repository = getRepository();
  const validationError = parseListFilters(context.req.raw);
  if (validationError) {
    return context.json(validationError, 400);
  }

  const { searchParams } = new URL(context.req.raw.url);
  const payload = taskListResponseSchema.parse({
    items: repository.listTasks({
      status: (searchParams.get("status") as TaskStatus | null) ?? undefined,
      done:
        searchParams.get("done") === null
          ? undefined
          : searchParams.get("done") === "true",
      session_id: searchParams.get("session_id") ?? undefined,
    }),
  });

  return context.json(payload, 200);
});

app.get(taskByIdRoutePath, (context) => {
  const repository = getRepository();
  const taskId = context.req.param("taskId") ?? "";
  const task = repository.getTaskById(taskId);

  if (!task) {
    return context.json(buildNotFoundError(taskId), 404);
  }

  return context.json(task, 200);
});
```

`PATCH` 和 `DELETE` 同理：不存在映射为 `TASK_NOT_FOUND`，repository 抛出的 SQLite/bootstrap/schema 错误不要吞掉。

- [ ] **Step 5: 运行 API 测试，确认 CRUD、过滤、done 派生与 500 fast-fail 全部通过**

Run: `pnpm --filter @aim-ai/api test`

Expected: PASS，`modules/api/test/task-repository.test.ts` 与 `modules/api/test/task-routes.test.ts` 全绿；`POST/GET/PATCH/DELETE`、`status/done/session_id` 过滤、缺库/缺表自动初始化、schema 不兼容返回 500 全部被覆盖。

- [ ] **Step 6: 提交 SQLite-backed Task 路由实现**

```bash
git add modules/api/src/routes/tasks.ts modules/api/src/task-repository.ts modules/api/test/task-routes.test.ts
git commit -m "feat: back task routes with sqlite"
```

### Task 4: 做最终集成验证并收口最小实现

**Files:**
- Modify: `modules/api/src/task-database.ts`
- Modify: `modules/api/src/task-repository.ts`
- Modify: `modules/api/src/routes/tasks.ts`
- Modify: `modules/api/test/task-repository.test.ts`
- Modify: `modules/api/test/task-routes.test.ts`

- [ ] **Step 1: 运行模块级验证，确认 build、类型和 API 测试一起通过**

Run: `pnpm --filter @aim-ai/api test`

Expected: PASS，包含 `typecheck`、`biome check`、contract build、API build 和 Vitest `api` project。

- [ ] **Step 2: 运行仓库级 API 相关回归，确认 workspace 配置没有被破坏**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api`

Expected: PASS，`api` project 下所有测试通过，没有因为 `AIM_PROJECT_ROOT` 测试切口引入跨用例污染。

- [ ] **Step 3: 运行根级 OpenAPI 与基础仓库校验，确认改动没有越过 API scope**

Run: `pnpm run openapi:check`

Expected: PASS，说明 Task route 仍然通过公共 contract 边界消费 schema，没有破坏现有 contract 产物。

- [ ] **Step 4: 自查最小化与边界约束**

逐项核对：
1. `modules/api/src/task-database.ts` 没有暴露业务级 `dbPath` 配置，只暴露 project-root 测试切口。
2. `modules/api/src/task-repository.ts` 没有引入 migration、ORM、附属表或额外状态机。
3. `modules/api/src/routes/tasks.ts` 没有内联 SQL，且只负责 contract 校验、404/400 映射和 JSON 响应。
4. 测试目录只写入仓库内 `.tmp/**`，没有使用系统临时目录。

- [ ] **Step 5: 提交最终验证通过的收口改动**

```bash
git add modules/api/src/task-database.ts modules/api/src/task-repository.ts modules/api/src/routes/tasks.ts modules/api/test/task-repository.test.ts modules/api/test/task-routes.test.ts
git commit -m "test: verify sqlite task api integration"
```
