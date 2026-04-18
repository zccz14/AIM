# SQLite Task Runtime Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `.opencode/plugins` 内落地一个固定使用 `<project_dir>/aim.sqlite` 的 SQLite-backed Task Runtime 插件，自动完成数据库文件与 `tasks` 表的基础 bootstrap，暴露 6 个最小 tools，并以 `sessionID` 绑定 Task 完成调度、恢复与状态写回闭环。

**Architecture:** 插件入口保持很薄，只负责注册 6 个 tools，并把 SQLite bootstrap、读写、session 绑定解析、dispatch 决策与 prompt 生成委托给相邻的小文件。SQLite 仍然是唯一调度真相源；运行时在首次打开 `<project_dir>/aim.sqlite` 时只自动补齐数据库文件与缺失的 `tasks` 表，不引入 schema migration，并继续通过当前 `sessionID` 解析绑定 Task、调用宿主 session API 恢复或创建 session，再把 `status`、`worktree_path`、`pull_request_url`、`updated_at`、`done` 回写到同一数据库。

**Tech Stack:** TypeScript、Node.js 24 `node:sqlite`、OpenCode plugin runtime、Vitest、pnpm workspace

---

## 文件结构与职责映射

**新增文件**
- `.opencode/plugins/task-runtime-sqlite.ts`：插件入口，注册 `dispatch-tasks`、`list-processing-tasks`、`get-current-task`、`mark-task-status`、`setup-worktree-path`、`setup-pull-request-url` 六个 tools，并组装相邻运行时模块。
- `.opencode/plugins/task-runtime-sqlite/database.ts`：固定解析 `<project_dir>/aim.sqlite`，创建 SQLite 连接，并在首次打开时只自动补齐数据库文件与缺失的 `tasks` 表；若已有 schema 不兼容则直接失败，同时封装共享行映射与时间戳写入辅助函数。
- `.opencode/plugins/task-runtime-sqlite/task-repository.ts`：封装 `tasks` 表查询与更新，包括 `done = false` 扫描、按 `session_id` 绑定查询、状态写回、`worktree_path`/`pull_request_url` 写回、重认领 `session_id`。
- `.opencode/plugins/task-runtime-sqlite/session-runtime.ts`：封装插件对宿主 session 能力的最小适配，负责查询 session 是否存在、是否 busy、恢复已有 session、创建新 session、发送 prompt。
- `.opencode/plugins/task-runtime-sqlite/prompt-builder.ts`：把 Task 快照转换为首条 prompt 与跟进 prompt，保证只暴露 `task_id`、`task_spec`、`status`、`worktree_path`、`pull_request_url` 等运行快照，不暴露 SQLite / `dbPath` / SQL 细节。
- `test/repo/sqlite-task-runtime-plugin.test.ts`：repo-level Vitest 测试，覆盖 SQLite 行读写、基于 `sessionID` 的 Task 绑定、终态 `done` 派生、dispatch 的认领/恢复/跳过/重认领分支，以及 prompt 内容边界。

**修改文件**
- 无预设必须修改文件；实现与验证都收敛在新增插件文件和 `test/repo/sqlite-task-runtime-plugin.test.ts`，不计划引入额外配置改动。

**只读参考文件**
- `docs/superpowers/specs/2026-04-18-sqlite-task-runtime-design.md`：本次 plan 的唯一需求来源，后续实现不得扩展到 daemon、跨 project、额外 tools 或可配置 `dbPath`。
- `vitest.workspace.ts`：确认 `test/repo/**/*.test.ts` 已被 repo project 收录，因此新增测试文件无需再改 Vitest 发现路径。
- `package.json`：确认仓库已要求 Node 24，可直接使用 `node:sqlite`，避免新增 SQLite 第三方依赖。

## 实施约束

- 固定读取 `${projectDir}/aim.sqlite`；不新增 `dbPath` 参数、环境变量或插件配置项。
- 运行时只自动创建 `<project_dir>/aim.sqlite` 与缺失的 `tasks` 表；不新增 schema migration、自动修表或兼容性回填逻辑。
- 插件对外只暴露题述 6 个 tools，不新增调试、迁移、schema 管理或手工 `task_id` 操作工具。
- 所有 task-bound tools 都只能从当前 tool context 的 `sessionID` 反查绑定 Task；若不存在唯一绑定，必须显式失败。
- `mark-task-status` 只允许一个 `status` 参数，并由插件统一维护 `updated_at` 与 `done` 派生关系。
- `dispatch-tasks` 必须覆盖 5 条分支：扫描 `done = false`、恢复已有 session、busy session 跳过、失效 session 重认领、未绑定 task 创建并绑定新 session 后发送首条 prompt。
- prompt 只能暴露 Task 快照，不得出现 `aim.sqlite`、`dbPath`、`SELECT`、`UPDATE`、表名或 SQL 规则。
- 若数据库可打开但现有 `tasks` schema 与运行时要求不兼容，相关入口必须显式失败，不尝试迁移。
- 验证只补最小 repo-level harness，不扩大到 daemon、e2e 平台联调或新的 workspace 包。

### Task 1: 建立 SQLite task runtime 插件骨架与 repo 级失败测试

**Files:**
- Create: `.opencode/plugins/task-runtime-sqlite.ts`
- Create: `.opencode/plugins/task-runtime-sqlite/database.ts`
- Create: `.opencode/plugins/task-runtime-sqlite/task-repository.ts`
- Create: `.opencode/plugins/task-runtime-sqlite/session-runtime.ts`
- Create: `.opencode/plugins/task-runtime-sqlite/prompt-builder.ts`
- Create: `test/repo/sqlite-task-runtime-plugin.test.ts`

- [ ] **Step 1: 先写 repo 级失败测试，锁定插件入口与 6 个 tools 的公开边界**

在 `test/repo/sqlite-task-runtime-plugin.test.ts` 新增一个源码约束测试，要求插件入口存在，并且只注册题述 6 个 tool 名称。测试中直接读取源码，先给后续实现提供明确失败信号。示例：

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("sqlite task runtime plugin", () => {
  it("registers the approved six tools", async () => {
    const pluginSource = await readFile(
      `${process.cwd()}/.opencode/plugins/task-runtime-sqlite.ts`,
      "utf8",
    );

    expect(pluginSource).toContain('"dispatch-tasks"');
    expect(pluginSource).toContain('"list-processing-tasks"');
    expect(pluginSource).toContain('"get-current-task"');
    expect(pluginSource).toContain('"mark-task-status"');
    expect(pluginSource).toContain('"setup-worktree-path"');
    expect(pluginSource).toContain('"setup-pull-request-url"');
  });
});
```

- [ ] **Step 2: 运行单个 repo 测试，确认在插件文件尚不存在时先失败**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project repo --testNamePattern "registers the approved six tools"`

Expected: FAIL，报 `.opencode/plugins/task-runtime-sqlite.ts` 不存在，或源码中还没有六个目标 tool 名称。

- [ ] **Step 3: 建立最小插件骨架与相邻运行时文件**

先只创建文件与最小导出，让测试从“文件缺失”前进到“行为待补齐”，不要在这一步实现完整逻辑。建议骨架如下：

```ts
// .opencode/plugins/task-runtime-sqlite.ts
import { createTaskRepository } from "./task-runtime-sqlite/task-repository.js";
import { createPromptBuilder } from "./task-runtime-sqlite/prompt-builder.js";
import { createSessionRuntime } from "./task-runtime-sqlite/session-runtime.js";

export const sqliteTaskRuntimePlugin = {
  name: "sqlite-task-runtime",
  tools: {
    "dispatch-tasks": {},
    "list-processing-tasks": {},
    "get-current-task": {},
    "mark-task-status": {},
    "setup-worktree-path": {},
    "setup-pull-request-url": {},
  },
};
```

```ts
// .opencode/plugins/task-runtime-sqlite/database.ts
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

export const getTaskRuntimeDatabasePath = (projectDir: string) =>
  join(projectDir, "aim.sqlite");

export const openTaskRuntimeDatabase = (projectDir: string) =>
  new DatabaseSync(getTaskRuntimeDatabasePath(projectDir));
```

其他三个相邻文件此时先导出空工厂函数：`createTaskRepository()`、`createSessionRuntime()`、`createPromptBuilder()`，返回后续 Task 会补齐的方法对象。

- [ ] **Step 4: 重新运行同一条 repo 测试，确认插件入口骨架已建立**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project repo --testNamePattern "registers the approved six tools"`

Expected: PASS。

- [ ] **Step 5: 提交插件骨架与测试基线**

```bash
git add .opencode/plugins/task-runtime-sqlite.ts .opencode/plugins/task-runtime-sqlite/database.ts .opencode/plugins/task-runtime-sqlite/task-repository.ts .opencode/plugins/task-runtime-sqlite/session-runtime.ts .opencode/plugins/task-runtime-sqlite/prompt-builder.ts test/repo/sqlite-task-runtime-plugin.test.ts
git commit -m "feat: add sqlite task runtime plugin scaffold"
```

### Task 2: 实现固定 SQLite 路径、基础 bootstrap、Task 仓储与基于 `sessionID` 的绑定规则

**Files:**
- Modify: `.opencode/plugins/task-runtime-sqlite/database.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite/task-repository.ts`
- Modify: `test/repo/sqlite-task-runtime-plugin.test.ts`

- [ ] **Step 1: 先补仓储失败测试，锁定固定 `aim.sqlite` 路径、基础 bootstrap、`done = false` 扫描与唯一绑定规则**

在 `test/repo/sqlite-task-runtime-plugin.test.ts` 新增五组单测，直接对 `database.ts` 与 `task-repository.ts` 的导出函数建约束：

```ts
it("always opens aim.sqlite under the project directory", () => {
  expect(getTaskRuntimeDatabasePath("/repo/worktree")).toBe(
    "/repo/worktree/aim.sqlite",
  );
});

it("bootstraps aim.sqlite and the tasks table for an empty project", () => {
  const repository = createTaskRepository({ projectDir, now: () => isoNow });

  expect(existsSync(join(projectDir, "aim.sqlite"))).toBe(true);
  expect(repository.listUnfinishedTasks()).toEqual([]);
});

it("fails fast when an existing tasks table schema is incompatible", () => {
  seedIncompatibleTasksSchema();

  expect(() =>
    createTaskRepository({ projectDir, now: () => isoNow }).listUnfinishedTasks(),
  ).toThrow("Existing tasks table schema is incompatible with sqlite task runtime");
});

it("lists only unfinished tasks from sqlite", () => {
  const repository = createTaskRepository({ projectDir, now: () => isoNow });

  seedTasks([
    { task_id: "task-1", task_spec: "one", done: 0, status: "created" },
    { task_id: "task-2", task_spec: "two", done: 1, status: "succeeded" },
  ]);

  expect(repository.listUnfinishedTasks().map((task) => task.task_id)).toEqual([
    "task-1",
  ]);
});

it("resolves exactly one task for the current session id", () => {
  const repository = createTaskRepository({ projectDir, now: () => isoNow });

  seedTasks([
    {
      task_id: "task-1",
      task_spec: "one",
      done: 0,
      status: "running",
      session_id: "session-1",
    },
  ]);

  expect(repository.getTaskBySessionID("session-1")?.task_id).toBe("task-1");
  expect(() => repository.getRequiredTaskBySessionID("missing-session")).toThrow(
    "Current session is not bound to a task",
  );
});
```

测试内使用 `node:sqlite` 在 repo 内临时目录（例如 `test/repo/.tmp/sqlite-task-runtime-plugin/<case>/aim.sqlite`）建表和插入样例行，避免把数据库写到仓库外；其中空项目用例不要手工预建 `aim.sqlite` 或 `tasks` 表，以验证仓储入口自己的 bootstrap 行为。

- [ ] **Step 2: 运行仓储相关测试，确认当前实现先失败**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project repo --testNamePattern "aim.sqlite|bootstraps aim.sqlite|incompatible|unfinished tasks|current session id"`

Expected: FAIL，提示 `createTaskRepository` 缺少 bootstrap/校验逻辑，或绑定规则/扫描逻辑尚未实现。

- [ ] **Step 3: 在 `database.ts` 与 `task-repository.ts` 中补齐最小仓储能力**

1. 在 `database.ts` 定义共享 `TaskRecord` 类型，字段至少包含 `task_id`、`task_spec`、`session_id`、`worktree_path`、`pull_request_url`、`status`、`done`、`updated_at`。
2. 在 `database.ts` 补齐 `openTaskRuntimeDatabase(projectDir)` 的最小 bootstrap：若 `aim.sqlite` 不存在则直接打开并创建；若 `tasks` 表不存在则按 spec 要求建表；若表已存在但列集合或关键列类型不兼容，则抛出 `Existing tasks table schema is incompatible with sqlite task runtime`，不要做 migration。
3. 在 `task-repository.ts` 导出 `createTaskRepository({ projectDir, now })`，并实现：
   - `listUnfinishedTasks()`：查询 `done = 0`。
   - `listProcessingTasks()`：查询 `done = 0` 的摘要视图。
   - `getTaskBySessionID(sessionID)`：按 `session_id = ?` 查询零条或一条。
   - `getRequiredTaskBySessionID(sessionID)`：零条时报 `Current session is not bound to a task`，多条时报 `Multiple tasks are bound to session <id>`。
   - `assignSession(taskID, sessionID)`：给 task 写入新的 `session_id`。

建议核心接口如下：

```ts
export type TaskRecord = {
  task_id: string;
  task_spec: string;
  session_id: string | null;
  worktree_path: string | null;
  pull_request_url: string | null;
  status: string | null;
  done: boolean;
  updated_at: string | null;
};

export type TaskRepository = {
  listUnfinishedTasks(): TaskRecord[];
  listProcessingTasks(): Array<
    Pick<
      TaskRecord,
      | "task_id"
      | "status"
      | "session_id"
      | "worktree_path"
      | "pull_request_url"
      | "updated_at"
    >
  >;
  getTaskBySessionID(sessionID: string): TaskRecord | null;
  getRequiredTaskBySessionID(sessionID: string): TaskRecord;
  assignSession(taskID: string, sessionID: string): void;
};
```

- [ ] **Step 4: 重新运行仓储测试，确认固定路径与绑定规则成立**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project repo --testNamePattern "aim.sqlite|bootstraps aim.sqlite|incompatible|unfinished tasks|current session id"`

Expected: PASS，证明仓储入口在空项目下可自动建库建表，且不会对不兼容 schema 做迁移。

- [ ] **Step 5: 提交 SQLite 仓储与绑定规则实现**

```bash
git add .opencode/plugins/task-runtime-sqlite/database.ts .opencode/plugins/task-runtime-sqlite/task-repository.ts test/repo/sqlite-task-runtime-plugin.test.ts
git commit -m "feat: add sqlite task repository"
```

### Task 3: 实现状态写回工具、运行产物写回工具与 prompt 边界

**Files:**
- Modify: `.opencode/plugins/task-runtime-sqlite/task-repository.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite/prompt-builder.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite.ts`
- Modify: `test/repo/sqlite-task-runtime-plugin.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 `mark-task-status` 的参数边界、`done` 派生与 prompt 脱敏**

在 `test/repo/sqlite-task-runtime-plugin.test.ts` 增加四类测试：

```ts
it("marks terminal statuses as done and refreshes updated_at", () => {
  const repository = createTaskRepository({ projectDir, now: () => isoNow });

  seedTasks([
    { task_id: "task-1", task_spec: "one", done: 0, status: "running", session_id: "session-1" },
  ]);

  repository.markTaskStatus({ sessionID: "session-1", status: "succeeded" });

  expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
    status: "succeeded",
    done: true,
    updated_at: isoNow,
  });
});

it("keeps non-terminal statuses unfinished", () => {
  repository.markTaskStatus({ sessionID: "session-1", status: "pr_following" });
  expect(repository.getRequiredTaskBySessionID("session-1").done).toBe(false);
});

it("stores worktree path and pull request url for the current session", () => {
  repository.setupWorktreePath({ sessionID: "session-1", worktreePath: "/repo/.worktrees/task-1" });
  repository.setupPullRequestURL({ sessionID: "session-1", pullRequestURL: "https://github.com/acme/repo/pull/1" });
});

it("builds prompts from task snapshots without sqlite internals", () => {
  const prompt = buildInitialTaskPrompt({
    task_id: "task-1",
    task_spec: "Fix the failing repo test",
    status: "created",
    worktree_path: null,
    pull_request_url: null,
  });

  expect(prompt).toContain("task-1");
  expect(prompt).toContain("Fix the failing repo test");
  expect(prompt).not.toContain("aim.sqlite");
  expect(prompt).not.toContain("dbPath");
  expect(prompt).not.toContain("SELECT");
  expect(prompt).not.toContain("UPDATE tasks");
});
```

同时增加一个源码约束测试，要求 `.opencode/plugins/task-runtime-sqlite.ts` 中 `mark-task-status` 的 schema 只有 `status` 一个参数键，不接受 `task_id`、`done`、`updated_at`。

- [ ] **Step 2: 运行状态写回与 prompt 测试，确认当前实现先失败**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project repo --testNamePattern "terminal statuses|non-terminal statuses|worktree path|pull request url|without sqlite internals|schema only"`

Expected: FAIL，提示仓储缺少状态写回方法、prompt builder 仍未实现，或插件入口尚未锁定 `mark-task-status` 参数边界。

- [ ] **Step 3: 补齐仓储写回接口、prompt builder 与 task-bound tools 注册**

1. 在 `task-repository.ts` 新增：
   - `markTaskStatus({ sessionID, status })`
   - `setupWorktreePath({ sessionID, worktreePath })`
   - `setupPullRequestURL({ sessionID, pullRequestURL })`
2. 三个接口都必须先通过 `getRequiredTaskBySessionID(sessionID)` 解析绑定 Task，再更新对应行并写入 `updated_at = now()`。
3. `markTaskStatus` 必须派生：`status === "succeeded" || status === "failed"` 时 `done = 1`，否则 `done = 0`。
4. 在 `prompt-builder.ts` 导出：
   - `buildInitialTaskPrompt(task)`
   - `buildFollowUpTaskPrompt(task)`
5. 两个 prompt builder 都只拼装 Task 快照与“继续推进当前任务”的文字，不写任何 SQLite/SQL/`dbPath` 语句。
6. 在 `.opencode/plugins/task-runtime-sqlite.ts` 中把 `get-current-task`、`mark-task-status`、`setup-worktree-path`、`setup-pull-request-url` 实际绑定到上述仓储方法；所有 task-bound tools 都从 `context.sessionID` 取值。

建议 `markTaskStatus` 的核心逻辑如下：

```ts
const done = status === "succeeded" || status === "failed";

statement.run(status, done ? 1 : 0, now(), task.task_id);
```

- [ ] **Step 4: 重新运行状态写回与 prompt 测试，确认工具边界符合 spec**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project repo --testNamePattern "terminal statuses|non-terminal statuses|worktree path|pull request url|without sqlite internals|schema only"`

Expected: PASS。

- [ ] **Step 5: 提交状态写回工具与 prompt builder**

```bash
git add .opencode/plugins/task-runtime-sqlite.ts .opencode/plugins/task-runtime-sqlite/task-repository.ts .opencode/plugins/task-runtime-sqlite/prompt-builder.ts test/repo/sqlite-task-runtime-plugin.test.ts
git commit -m "feat: add task runtime status tools"
```

### Task 4: 实现 `dispatch-tasks` 的恢复、跳过、重认领与首条 prompt 流程

**Files:**
- Modify: `.opencode/plugins/task-runtime-sqlite/session-runtime.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite/task-repository.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite/prompt-builder.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite.ts`
- Modify: `test/repo/sqlite-task-runtime-plugin.test.ts`

- [ ] **Step 1: 先写 dispatch 失败测试，逐条锁定五种调度分支**

在 `test/repo/sqlite-task-runtime-plugin.test.ts` 使用 fake session runtime（`vi.fn()` 模拟 `getSession`、`createSession`、`sendPrompt`）新增以下测试：

```ts
it("continues an existing idle session for an unfinished task", async () => {
  seedTasks([
    { task_id: "task-1", task_spec: "one", done: 0, status: "running", session_id: "session-1" },
  ]);

  sessionRuntime.getSession.mockReturnValue({ id: "session-1", busy: false });

  const result = await dispatchTasks();

  expect(result).toEqual([
    { taskID: "task-1", action: "continued", sessionID: "session-1" },
  ]);
  expect(sessionRuntime.sendPrompt).toHaveBeenCalledWith(
    "session-1",
    expect.stringContaining("task-1"),
  );
});

it("skips a busy session without sending a duplicate prompt", async () => {
  sessionRuntime.getSession.mockReturnValue({ id: "session-1", busy: true });
  await dispatchTasks();
  expect(sessionRuntime.sendPrompt).not.toHaveBeenCalled();
});

it("reclaims a task when its previous session no longer exists", async () => {
  sessionRuntime.getSession.mockReturnValue(null);
  sessionRuntime.createSession.mockResolvedValue({ id: "session-2" });
  await dispatchTasks();
  expect(repository.getTaskBySessionID("session-2")?.task_id).toBe("task-1");
});

it("creates and assigns a new session for an unbound unfinished task", async () => {
  seedTasks([{ task_id: "task-2", task_spec: "two", done: 0, status: "created", session_id: null }]);
  sessionRuntime.createSession.mockResolvedValue({ id: "session-3" });
  await dispatchTasks();
  expect(repository.getTaskBySessionID("session-3")?.task_id).toBe("task-2");
});

it("returns processing task summaries with the required fields", () => {
  expect(repository.listProcessingTasks()[0]).toEqual({
    task_id: "task-1",
    status: "running",
    session_id: "session-1",
    worktree_path: "/repo/.worktrees/task-1",
    pull_request_url: "https://github.com/acme/repo/pull/1",
    updated_at: isoNow,
  });
});
```

再补一个空项目调度测试，要求 `dispatch-tasks` 在数据库文件和 `tasks` 表都尚未存在时也能正常返回空数组而不是报错；并补一个 prompt 断言，要求 follow-up prompt 以“继续推进当前 Task”为中心，但不出现 `session_id =`、`tasks` 表名、数据库路径。

- [ ] **Step 2: 运行 dispatch 相关测试，确认当前实现先失败**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project repo --testNamePattern "idle session|busy session|reclaims a task|creates and assigns|processing task summaries|empty project|follow-up prompt"`

Expected: FAIL，提示 `dispatch-tasks` 逻辑、session runtime 适配层、空项目 bootstrap 接入或摘要返回尚未实现。

- [ ] **Step 3: 在插件入口与 session runtime 中补齐调度流程**

1. 在 `session-runtime.ts` 导出 `createSessionRuntime(host)`，最少提供：
   - `getSession(sessionID)`
   - `createSession()`
   - `sendPrompt(sessionID, prompt)`
2. 在 `.opencode/plugins/task-runtime-sqlite.ts` 中实现 `dispatch-tasks`：
    - 调 `repository.listUnfinishedTasks()`。
    - 让插件入口直接复用仓储打开数据库时的 bootstrap 行为，因此空项目下第一次调用也能得到空数组结果。
    - 遍历每条 task，若存在 `session_id`，先 `getSession(session_id)`。
   - session 存在且 `busy === true` 时返回 `action: "skipped_busy"`，不发 prompt。
   - session 存在且不 busy 时发送 `buildFollowUpTaskPrompt(task)`，返回 `action: "continued"`。
   - session 不存在时创建新 session、`assignSession(task.task_id, newSession.id)`、发送 `buildInitialTaskPrompt()`，返回 `action: "reclaimed"`。
   - 没有 `session_id` 时创建新 session、绑定并发送首条 prompt，返回 `action: "created"`。
3. `list-processing-tasks` 直接返回 `repository.listProcessingTasks()` 的摘要数组，不附带数据库实现细节。

建议调度分支骨架如下：

```ts
for (const task of repository.listUnfinishedTasks()) {
  if (task.session_id) {
    const session = await sessionRuntime.getSession(task.session_id);

    if (session?.busy) {
      results.push({ taskID: task.task_id, action: "skipped_busy", sessionID: task.session_id });
      continue;
    }

    if (session) {
      await sessionRuntime.sendPrompt(session.id, buildFollowUpTaskPrompt(task));
      results.push({ taskID: task.task_id, action: "continued", sessionID: session.id });
      continue;
    }
  }

  const session = await sessionRuntime.createSession();
  repository.assignSession(task.task_id, session.id);
  await sessionRuntime.sendPrompt(session.id, buildInitialTaskPrompt({ ...task, session_id: session.id }));
  results.push({ taskID: task.task_id, action: task.session_id ? "reclaimed" : "created", sessionID: session.id });
}
```

- [ ] **Step 4: 重新运行 dispatch 相关测试，确认恢复/跳过/重认领闭环成立**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project repo --testNamePattern "idle session|busy session|reclaims a task|creates and assigns|processing task summaries|empty project|follow-up prompt"`

Expected: PASS，证明插件入口同样不依赖手工预建 `tasks` 表。

- [ ] **Step 5: 提交 dispatch 调度实现**

```bash
git add .opencode/plugins/task-runtime-sqlite.ts .opencode/plugins/task-runtime-sqlite/session-runtime.ts .opencode/plugins/task-runtime-sqlite/task-repository.ts .opencode/plugins/task-runtime-sqlite/prompt-builder.ts test/repo/sqlite-task-runtime-plugin.test.ts
git commit -m "feat: add sqlite task dispatch flow"
```

### Task 5: 做插件级回归验证与实现自检

**Files:**
- Modify: `test/repo/sqlite-task-runtime-plugin.test.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite/database.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite/task-repository.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite/session-runtime.ts`
- Modify: `.opencode/plugins/task-runtime-sqlite/prompt-builder.ts`

- [ ] **Step 1: 补一条端到端 repo 测试，串起“创建 session -> 绑定 Task -> 写回终态 done”主路径**

在 `test/repo/sqlite-task-runtime-plugin.test.ts` 增加一条组合测试：先向测试 SQLite 插入一条未绑定 task，执行 `dispatch-tasks` 创建 session，再用同一个 `sessionID` 调 `mark-task-status("succeeded")`，最后断言该行 `done = true`、`updated_at` 已刷新、`list-processing-tasks` 不再返回该 task。并保留一条负向断言，确认预先存在的不兼容 `tasks` schema 会让运行时入口直接失败，而不是尝试迁移。示例：

```ts
it("completes the happy path from dispatch to terminal write-back", async () => {
  seedTasks([{ task_id: "task-1", task_spec: "ship the docs", done: 0, status: "created", session_id: null }]);
  sessionRuntime.createSession.mockResolvedValue({ id: "session-1" });

  await dispatchTasks();
  repository.markTaskStatus({ sessionID: "session-1", status: "succeeded" });

  expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
    status: "succeeded",
    done: true,
  });
  expect(repository.listProcessingTasks()).toEqual([]);
});
```

- [ ] **Step 2: 运行完整 repo project，确认全部 SQLite task runtime 测试一起通过**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project repo`

Expected: PASS，包含原有 `changeset-check.test.ts` 与新增 `sqlite-task-runtime-plugin.test.ts`。

- [ ] **Step 3: 做最小类型与格式校验，确认新增插件文件被当前仓库接受**

Run: `pnpm run typecheck && pnpm run test:lint`

Expected: PASS；若 `typecheck` 或 `Biome` 只因新增插件文件报错，则仅修复 `.opencode/plugins/task-runtime-sqlite*.ts` 与 `test/repo/sqlite-task-runtime-plugin.test.ts` 中的真实类型/格式问题，不扩大范围。

- [ ] **Step 4: 自检 spec 覆盖与命名一致性后提交最终实现**

自检清单：
- 六个 tools 名称是否与 spec 完全一致。
- 空项目首次进入仓储或插件入口时，是否都会自动创建 `aim.sqlite` 与缺失的 `tasks` 表。
- task-bound tools 是否全部只依赖 `sessionID`，没有任何 `task_id` 输入。
- `mark-task-status` 是否仍只有 `status` 参数，并自动写 `updated_at` 与 `done`。
- `dispatch-tasks` 是否覆盖恢复、busy 跳过、失效重认领、未绑定创建四条分支，并只扫描 `done = false`。
- prompt 是否只暴露 Task 快照，没有 `aim.sqlite`、`dbPath`、SQL 细节。
- 是否完全没有引入 schema migration；对不兼容既有 schema 仍然显式失败。

```bash
git add .opencode/plugins/task-runtime-sqlite.ts .opencode/plugins/task-runtime-sqlite/database.ts .opencode/plugins/task-runtime-sqlite/task-repository.ts .opencode/plugins/task-runtime-sqlite/session-runtime.ts .opencode/plugins/task-runtime-sqlite/prompt-builder.ts test/repo/sqlite-task-runtime-plugin.test.ts
git commit -m "feat: finalize sqlite task runtime plugin"
```
