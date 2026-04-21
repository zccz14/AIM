# Task Scheduler List-Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `modules/api/src/task-scheduler.ts` 收缩为串行 `scanOnce()` + `start()` / `stop()` list-watch loop，并把未完成任务的非空 `session_id` 唯一性约束下沉到 repository / SQLite schema。

**Architecture:** 本次实现只动两条边界。`modules/api/src/task-repository.ts` 负责创建并校验“未完成且 `session_id IS NOT NULL` 时唯一”的数据库约束，并把 duplicate-session 正确性测试迁移到 repository / schema 测试；`modules/api/src/task-scheduler.ts` 只保留列出未完成任务、逐条判断、懒绑定 session、给 idle session 写 spec 并发送 continue prompt 的最小职责。后台轮询从 `setInterval` + round/concurrency 改为单后台 async `while` loop，通过 `scanOnce() -> sleep(intervalMs)` 的自然顺序避免重叠扫描，同时保留每任务错误隔离和可等待的 `stop()` 退出语义。

**Tech Stack:** TypeScript、Node.js 24、SQLite (`node:sqlite`)、Vitest、pnpm workspace

---

## 文件结构与职责映射

- Modify: `modules/api/src/task-repository.ts` - 为 `tasks` 表补充部分唯一索引或等价约束，校验旧库是否具备该约束，并继续保留 `assignSessionIfUnassigned()` 的条件更新语义。
- Modify: `modules/api/test/task-repository.test.ts` - 新增 repository/schema 级 duplicate-session 约束测试，删除“重复 session 对 scheduler 可见”的旧预期，补充兼容 schema / 不兼容 schema 校验。
- Modify: `modules/api/src/task-scheduler.ts` - 删除 `concurrency`、`runWithConcurrency()`、`roundPromise`、scheduler 内 duplicate-session 统计与 `setInterval` 轮询；对外改为 `scanOnce()` / `start()` / `stop()`，内部用串行 `while` loop + `sleep`。
- Modify: `modules/api/test/task-scheduler.test.ts` - 把 `runRound()` 断言改为 `scanOnce()`，删除 duplicate-session scheduler 测试，新增串行扫描、非重叠轮询、`stop()` 等待 in-flight 扫描退出、sleep 期间停止不再进入下一轮等生命周期覆盖。
- Verify only: `modules/api/src/server.ts` - 预期无需代码改动；只确认 `start()` / `stop()` 新签名仍兼容 `stopScheduler = () => taskScheduler.stop()`。

## 实施约束

- 只允许 repository / schema 层强制“未完成任务的非空 `session_id` 唯一”；不得在 scheduler 内继续维护 duplicate-session set、warn 分支或 round 内二次仲裁。
- `scanOnce()` 必须保留每任务独立 `try/catch`，任一任务写 spec、查 session 状态或发送 continue prompt 失败时，后续任务仍继续处理。
- 单次扫描必须使用 `for...of` 串行处理，不保留并发参数，不新增 worker pool。
- `start()` 重复调用不得创建多个后台 loop；`stop()` 只请求关闭，不中断已经开始的 `scanOnce()`，并返回 loop 真正退出后才 resolve 的 Promise。
- 测试拆分必须反映职责边界：scheduler 测试只看扫描行为与生命周期，duplicate-session 约束只在 repository/schema 测试中验证。
- 执行阶段只能由 Sub Agent 在当前 worktree / branch 内继续推进；不得切换为 inline execution。

### Task 1: 在 repository / schema 层锁定未完成任务的非空 `session_id` 唯一性

**Files:**
- Modify: `modules/api/src/task-repository.ts`
- Modify: `modules/api/test/task-repository.test.ts`

- [ ] **Step 1: 先写失败测试，定义新的 schema / repository 边界**

```ts
it("allows multiple unfinished tasks with NULL session_id", async () => {
  const projectRoot = await createProjectRoot("null-session-duplicates-allowed");
  process.env.AIM_PROJECT_ROOT = projectRoot;

  const repository = createTaskRepository();

  const firstTask = await repository.createTask({
    task_spec: "first null session",
    project_path: "/repo/null/first",
    status: "created",
  });
  const secondTask = await repository.createTask({
    task_spec: "second null session",
    project_path: "/repo/null/second",
    status: "running",
  });

  await expect(repository.listUnfinishedTasks()).resolves.toEqual([
    firstTask,
    secondTask,
  ]);
});

it("rejects a second unfinished task with the same non-null session_id", async () => {
  const projectRoot = await createProjectRoot("rejects-duplicate-unfinished-session");
  process.env.AIM_PROJECT_ROOT = projectRoot;

  const repository = createTaskRepository();

  await repository.createTask({
    task_spec: "first shared session",
    project_path: "/repo/shared/first",
    session_id: "shared-session",
    status: "running",
  });

  await expect(
    repository.createTask({
      task_spec: "second shared session",
      project_path: "/repo/shared/second",
      session_id: "shared-session",
      status: "created",
    }),
  ).rejects.toThrow(/session_id|unique|constraint/i);
});

it("allows reusing a session_id after the earlier task is done", async () => {
  const projectRoot = await createProjectRoot("allows-session-reuse-after-done");
  process.env.AIM_PROJECT_ROOT = projectRoot;

  const repository = createTaskRepository();

  await repository.createTask({
    task_spec: "completed shared session",
    project_path: "/repo/shared/done",
    session_id: "shared-session",
    status: "succeeded",
  });

  await expect(
    repository.createTask({
      task_spec: "new unfinished shared session",
      project_path: "/repo/shared/new",
      session_id: "shared-session",
      status: "created",
    }),
  ).resolves.toMatchObject({
    done: false,
    session_id: "shared-session",
    status: "created",
  });
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-repository.test.ts -t "session_id|NULL session"`

Expected: FAIL，当前 schema 允许重复的非空 unfinished `session_id`，且还保留“duplicate session rows visible to the scheduler scan”的旧预期。

- [ ] **Step 2: 用最小 schema 改动落实唯一索引并校验现有数据库是否兼容**

```ts
const unfinishedSessionIndexName = "tasks_unfinished_session_id_unique";

const createTasksTable = (database: ReturnType<typeof openTaskDatabase>) => {
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
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${unfinishedSessionIndexName}
    ON ${tasksTableName}(session_id)
    WHERE done = 0 AND session_id IS NOT NULL
  `);
};

const validateTasksSchema = (database: ReturnType<typeof openTaskDatabase>) => {
  const rows = database
    .prepare(`PRAGMA table_info(${tasksTableName})`)
    .all() as TableInfoRow[];

  if (rows.length === 0) {
    throw buildSchemaError();
  }

  const columns = new Map(rows.map((row) => [row.name, row]));

  for (const expectedColumn of requiredColumns) {
    const actualColumn = columns.get(expectedColumn.name);

    if (
      !actualColumn ||
      normalizeColumnType(actualColumn.type) !== expectedColumn.type ||
      ("defaultValue" in expectedColumn &&
        actualColumn.dflt_value !== expectedColumn.defaultValue) ||
      (expectedColumn.pk === 0 &&
        actualColumn.notnull !== expectedColumn.notnull) ||
      actualColumn.pk !== expectedColumn.pk
    ) {
      throw buildSchemaError();
    }
  }

  const indexRows = database
    .prepare(`PRAGMA index_list(${tasksTableName})`)
    .all() as Array<{ name: string; unique: 0 | 1; partial: 0 | 1 }>;

  const uniqueSessionIndex = indexRows.find(
    (row) => row.name === unfinishedSessionIndexName,
  );

  if (!uniqueSessionIndex || uniqueSessionIndex.unique !== 1 || uniqueSessionIndex.partial !== 1) {
    throw buildSchemaError();
  }
};
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-repository.test.ts -t "session_id|NULL session|compatible schema|schema is incompatible"`

Expected: 之前新增的三条测试转绿；已有兼容 schema 测试会先失败，提示旧 fixture 少了新索引约束。

- [ ] **Step 3: 补齐 schema fixture，确保 repository 测试完整覆盖新边界**

```ts
database.exec(`
  CREATE TABLE tasks (
    task_id text PRIMARY KEY,
    task_spec varchar(255) NOT NULL,
    project_path varchar(255) NOT NULL,
    session_id text,
    worktree_path text,
    pull_request_url text,
    dependencies text NOT NULL,
    result text NOT NULL default '',
    done int NOT NULL,
    status varchar(32) NOT NULL,
    created_at datetime NOT NULL,
    updated_at datetime NOT NULL
  );
  CREATE UNIQUE INDEX tasks_unfinished_session_id_unique
  ON tasks(session_id)
  WHERE done = 0 AND session_id IS NOT NULL;
`);

const repository = createTaskRepository();
const createdTask = await repository.createTask({
  task_spec: "compatible schema bootstrap",
  project_path: "/repo/compatible-schema",
});

await expect(repository.getTaskById(createdTask.task_id)).resolves.toEqual(
  createdTask,
);
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-repository.test.ts`

Expected: PASS，repository 测试现在只允许 NULL 重复、拒绝 unfinished 非空重复 `session_id`，并且旧库缺索引时会 fail fast。

- [ ] **Step 4: 提交 repository / schema 改动**

```bash
git add modules/api/src/task-repository.ts modules/api/test/task-repository.test.ts
git commit -m "test: lock unfinished session uniqueness"
```

### Task 2: 把 scheduler 单次扫描收缩为 `scanOnce()` 串行流程

**Files:**
- Modify: `modules/api/src/task-scheduler.ts`
- Modify: `modules/api/test/task-scheduler.test.ts`

- [ ] **Step 1: 先把 scheduler 单测改成 `scanOnce()`，并删除 duplicate-session 旧职责**

```ts
await scheduler.scanOnce();

it("continues processing later tasks after one task fails", async () => {
  const firstTask = createTask({ task_id: "task-1", session_id: "session-1" });
  const secondTask = createTask({ task_id: "task-2", session_id: "session-2" });

  await expect(scheduler.scanOnce()).resolves.toBeUndefined();
  expect(sendContinuePrompt).toHaveBeenCalledTimes(2);
});

it("processes unfinished tasks sequentially within one scan", async () => {
  const observedOrder: string[] = [];
  coordinator.getSessionState.mockImplementation(async (sessionId) => {
    observedOrder.push(`state:${sessionId}`);
    return "idle";
  });
  coordinator.sendContinuePrompt.mockImplementation(async (sessionId) => {
    observedOrder.push(`continue:${sessionId}`);
  });

  await scheduler.scanOnce();

  expect(observedOrder).toEqual([
    "state:session-1",
    "continue:session-1",
    "state:session-2",
    "continue:session-2",
  ]);
});
```

Delete these tests entirely from `modules/api/test/task-scheduler.test.ts`:

```ts
it("refuses duplicate unfinished tasks that share one session_id", async () => {
  /* delete this test */
});

it("warns and skips when assignment returns a duplicate session snapshot", async () => {
  /* delete this test */
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-scheduler.test.ts -t "scanOnce|sequentially|fails|duplicate unfinished"`

Expected: FAIL，当前导出还是 `runRound()`，且实现里仍包含 duplicate-session warn 分支与并发 round 结构。

- [ ] **Step 2: 用最小重构把单次扫描改成串行 `for...of`，保留每任务错误隔离**

```ts
type CreateTaskSchedulerOptions = {
  coordinator: TaskSessionCoordinator;
  logger?: ApiLogger;
  taskRepository: SchedulerTaskRepository;
};

const processTask = async (task: Task) => {
  try {
    let latestTask = task;
    let boundInScan = false;

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
      boundInScan = assignedTask.session_id === sessionId;
    }

    if (!latestTask.session_id || latestTask.done) {
      return;
    }

    const sessionState = await options.coordinator.getSessionState(
      latestTask.session_id,
      latestTask.project_path,
    );

    if (boundInScan && sessionState === "idle") {
      logger.info(buildTaskLogFields("task_session_bound", latestTask));
    }

    if (sessionState !== "idle") {
      return;
    }

    const specFile = getTaskSpecFilename(latestTask);
    await mkdir(dirname(specFile), { recursive: true });
    await writeFile(specFile, latestTask.task_spec, "utf-8");
    await options.coordinator.sendContinuePrompt(
      latestTask.session_id,
      buildContinuePrompt(latestTask),
    );
    logger.info(buildTaskLogFields("task_session_continued", latestTask));
  } catch (error) {
    logger.error(
      { err: error, taskId: task.task_id },
      `Task scheduler failed while processing task ${task.task_id}`,
    );
  }
};

const scanOnce = async () => {
  const tasks = await options.taskRepository.listUnfinishedTasks();

  for (const task of tasks) {
    await processTask(task);
  }
};
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-scheduler.test.ts -t "scanOnce|sequentially|fails|running to idle|unbound unfinished"`

Expected: PASS，单次扫描行为全部基于 `scanOnce()` 通过，且 duplicate-session scheduler 测试已经移除，不再要求 warn / skip。

- [ ] **Step 3: 提交单次扫描重构**

```bash
git add modules/api/src/task-scheduler.ts modules/api/test/task-scheduler.test.ts
git commit -m "refactor: simplify task scheduler scanning"
```

### Task 3: 把后台轮询改成单 async loop，并锁定 `start()` / `stop()` 生命周期

**Files:**
- Modify: `modules/api/src/task-scheduler.ts`
- Modify: `modules/api/test/task-scheduler.test.ts`
- Verify only: `modules/api/src/server.ts`

- [ ] **Step 1: 先写失败测试，定义 loop 生命周期而不是 `setInterval` 行为**

```ts
it("does not start more than one polling loop", async () => {
  vi.useFakeTimers();
  const listUnfinishedTasks = vi.fn().mockResolvedValue([]);

  scheduler.start({ intervalMs: 1_000 });
  scheduler.start({ intervalMs: 1_000 });
  await vi.runOnlyPendingTimersAsync();

  expect(listUnfinishedTasks).toHaveBeenCalledTimes(1);
  await scheduler.stop();
  vi.useRealTimers();
});

it("waits for an in-flight scan to finish before stop resolves", async () => {
  vi.useFakeTimers();
  let releaseScan: (() => void) | undefined;
  const listUnfinishedTasks = vi.fn(
    () =>
      new Promise<Task[]>((resolve) => {
        releaseScan = () => resolve([createTask({ session_id: "session-1" })]);
      }),
  );

  scheduler.start({ intervalMs: 1_000 });
  const stopPromise = scheduler.stop();

  await expect(Promise.race([stopPromise, Promise.resolve("pending")])).resolves.toBe("pending");
  releaseScan?.();
  await expect(stopPromise).resolves.toBeUndefined();
  vi.useRealTimers();
});

it("stops during sleep without entering another scan", async () => {
  vi.useFakeTimers();
  const listUnfinishedTasks = vi.fn().mockResolvedValue([]);

  scheduler.start({ intervalMs: 1_000 });
  await vi.runOnlyPendingTimersAsync();
  const stopPromise = scheduler.stop();
  await vi.advanceTimersByTimeAsync(5_000);

  await expect(stopPromise).resolves.toBeUndefined();
  expect(listUnfinishedTasks).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-scheduler.test.ts -t "polling loop|stop resolves|sleep"`

Expected: FAIL，当前实现仍依赖 `setInterval`，`stop()` 也不会返回等待 loop 退出的 Promise。

- [ ] **Step 2: 用单后台 Promise + `while` loop 落实 start/stop 语义**

```ts
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let loopPromise: Promise<void> | null = null;
let shouldStop = false;

const runLoop = async (intervalMs: number) => {
  while (!shouldStop) {
    await scanOnce();

    if (shouldStop) {
      return;
    }

    await sleep(intervalMs);
  }
};

return {
  scanOnce,
  start({ intervalMs }: StartOptions) {
    if (loopPromise) {
      return;
    }

    shouldStop = false;
    loopPromise = runLoop(intervalMs)
      .catch((error) => {
        logger.error({ err: error }, "Task scheduler failed while scanning unfinished tasks");
      })
      .finally(() => {
        loopPromise = null;
      });
  },
  stop() {
    shouldStop = true;
    return loopPromise ?? Promise.resolve();
  },
};
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-scheduler.test.ts -t "polling loop|stop resolves|sleep|startup disabled|OpenCode integration"`

Expected: PASS，生命周期测试与已有 startup / coordinator boundary 回归继续通过；`modules/api/src/server.ts` 无需跟随改动。

- [ ] **Step 3: 提交轮询生命周期重构**

```bash
git add modules/api/src/task-scheduler.ts modules/api/test/task-scheduler.test.ts
git commit -m "refactor: switch scheduler to async loop"
```

### Task 4: 运行聚合验证并做最终清理

**Files:**
- Modify if needed: `modules/api/test/task-repository.test.ts`
- Modify if needed: `modules/api/test/task-scheduler.test.ts`
- Verify: `modules/api/src/task-repository.ts`
- Verify: `modules/api/src/task-scheduler.ts`

- [ ] **Step 1: 运行两个受影响测试文件，确认迁移后的职责边界稳定**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-repository.test.ts modules/api/test/task-scheduler.test.ts`

Expected: PASS，repository 只负责 duplicate-session 约束，scheduler 只负责 list-watch 扫描与生命周期。

- [ ] **Step 2: 运行完整 API 测试，防止 build / lint / typecheck 回归**

Run: `pnpm --filter @aim-ai/api test`

Expected: PASS，包含 `typecheck`、`biome check`、contract build、API build 与完整 `api` Vitest project。

- [ ] **Step 3: 如有失败，先最小修正再重跑对应命令；通过后提交收尾 commit**

```bash
git add modules/api/src/task-repository.ts modules/api/src/task-scheduler.ts modules/api/test/task-repository.test.ts modules/api/test/task-scheduler.test.ts
git commit -m "test: cover scheduler list-watch lifecycle"
```

## 自检结果

- Spec coverage: `scanOnce()` / `start()` / `stop()`、串行 `for...of`、每任务错误隔离、非重叠轮询、scheduler 删除 duplicate-session 处理、repository / schema 强制 unfinished 非空 `session_id` 唯一、duplicate-session 测试迁移、start/stop 生命周期测试，全部分别落在 Task 1-4。
- Placeholder scan: 文档中没有 `TODO`、`TBD`、"handle appropriately" 之类空泛步骤；每个任务都给出明确文件、命令、预期失败 / 通过结果和 commit 动作。
- Type / API consistency: 计划统一使用 `scanOnce()` 命名，不再出现 `runRound()`、`concurrency` 或 scheduler duplicate-session API；`stop()` 始终按 `Promise<void>` 可等待语义编写测试与实现。

## Execution Handoff

计划已可执行。根据仓库 `AGENTS.md`，后续实现必须继续由 Sub Agent 在当前 worktree `/.worktrees/task-scheduler-list-watch-spec` 与当前分支 `design/task-scheduler-list-watch-spec` 上逐任务推进；不得改为 inline execution，也不得拆到其他 worktree 或 PR。
