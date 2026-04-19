# Task CLI CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `@aim-ai/cli` 增加服务端优先的 `aim task create|list|get|update|delete` 首版能力，让 Agent 能用统一的 JSON envelope 调用 Task CRUD，而不直接接触 SQLite 或本地领域逻辑。

**Architecture:** 继续沿用仓库当前的 contract-first 方向：先把 `@aim-ai/contract` 的公共 `createContractClient()` 边界从 health-only 扩展到 Task CRUD，再在 `modules/cli/src/commands/task/` 下按命令拆分薄命令文件。CLI 共享层只保留 `--base-url` 解析、相对 URL 转绝对 URL、JSON success/error envelope 输出、flag 到 contract 请求的最小映射，不新增 Task service、repository 或状态推断层。

**Tech Stack:** TypeScript、oclif、`@aim-ai/contract`、Vitest、Node.js child_process 黑盒 CLI 测试、pnpm workspace

---

## 文件结构与职责映射

**修改文件**
- `modules/contract/src/client.ts`：把公共 contract client 从 `getHealth()` 扩展到 `listTasks()`、`createTask()`、`getTaskById()`、`patchTaskById()`、`deleteTaskById()`，并继续在 fetch-only 边界上做 response/error schema parse。
- `modules/contract/src/index.ts`：暴露 Task CRUD client 相关类型，确保 CLI 只从 `@aim-ai/contract` 根入口消费事实。
- `modules/contract/test/contract-package.test.ts`：新增 Task client helper 的公开边界断言与 typed runtime 行为断言。
- `modules/cli/src/index.ts`：注册 `task:create`、`task:list`、`task:get`、`task:update`、`task:delete` 五个命令到显式 `commands` 映射。
- `modules/cli/package.json`：把 Task CLI 黑盒测试与 smoke 验证接入现有 CLI 测试编排。

**新增文件**
- `modules/cli/src/lib/task-command.ts`：放置 Task CLI 薄共享工具，包括 base URL 解析、contract fetch 转发、CLI 本地错误构造、统一 JSON envelope 输出、flag 值校验辅助函数。
- `modules/cli/src/commands/task/create.ts`：实现 `aim task create`。
- `modules/cli/src/commands/task/list.ts`：实现 `aim task list`。
- `modules/cli/src/commands/task/get.ts`：实现 `aim task get`。
- `modules/cli/src/commands/task/update.ts`：实现 `aim task update`，包含显式 `clear-*` 语义与冲突校验。
- `modules/cli/src/commands/task/delete.ts`：实现 `aim task delete`。
- `modules/cli/test/task-command.test.ts`：以黑盒方式覆盖命令注册、请求映射、JSON envelope、`clear-*` 语义、服务端错误透传、CLI 本地错误和 contract 根边界约束。

**只读参考文件**
- `docs/superpowers/specs/2026-04-20-task-cli-crud-design.md`：唯一 scope 来源；不得扩展到分页、排序、批量操作、文件输入、stdin、env/config 默认值、SQLite 直连或动作型命令。
- `modules/cli/src/commands/health.ts`：现有 CLI 命令模式参考，尤其是 `createContractClient()` + 自定义 fetch 转发的实现方式。
- `modules/cli/test/health-command.test.ts`：现有 CLI 黑盒测试模式参考，Task CLI 测试应保持同样的 spawn + 本地 HTTP server 风格。
- `modules/contract/generated/_client/sdk.gen.ts`：确认生成 client 的真实函数名是 `listTasks`、`createTask`、`getTaskById`、`patchTaskById`、`deleteTaskById`。
- `modules/contract/src/index.ts`：确认 `taskSchema`、`taskStatusSchema`、`taskListResponseSchema`、`taskErrorSchema` 等根边界已存在，可直接复用。

## 实施约束

- CLI 成功输出统一为 `{"ok": true, "data": ...}`，写到 `stdout`；所有失败都写 `{"ok": false, "error": {"code": "...", "message": "..."}}` 到 `stderr`，并以退出码 `1` 结束。
- `--base-url` 在五个命令上都必须显式传入；不要使用环境变量、配置文件、默认地址或自动发现。
- 为了保持 JSON 失败 envelope 稳定，Task 命令里的必填 flag 不要依赖 oclif 的 `required: true` 默认报错；统一在命令实现内手动校验，并输出 `CLI_USAGE_ERROR`、`CLI_INVALID_BASE_URL`、`CLI_INVALID_FLAG_VALUE` 或 `UNAVAILABLE`。
- `task create` 和 `task update` 只允许映射 spec 批准的六个可写字段：`task_spec`、`session_id`、`worktree_path`、`pull_request_url`、`dependencies`、`status`。
- `task update` 的清空只能通过 `--clear-session-id`、`--clear-worktree-path`、`--clear-pull-request-url`、`--clear-dependencies` 表达；禁止把空字符串解释成清空。
- `--pull-request-url` 可以重复传入，但请求体里只写最后一个值；`--dependency` 保持重复 flag 映射为字符串数组。
- 共享层只能是薄工具函数；不要新增 Task domain layer、状态机知识、离线缓存或额外 repository。
- CLI 测试必须是黑盒：通过 `node ./bin/dev.js ...` 真实启动 CLI，断言 HTTP 请求、退出码和 stdout/stderr；不要在测试里直接调用命令类方法。

### Task 1: 先补 Task CRUD 的 contract 公共 client 边界

**Files:**
- Modify: `modules/contract/src/client.ts`
- Modify: `modules/contract/src/index.ts`
- Modify: `modules/contract/test/contract-package.test.ts`

- [ ] **Step 1: 先写 contract 级失败测试，锁定 Task CRUD public client surface**

在 `modules/contract/test/contract-package.test.ts` 新增两组测试：
1. 包级导出断言，确认 `createContractClient()` 返回的对象上可访问五个 Task CRUD helper。
2. fetch-only runtime 断言，确认这些 helper 使用 `/tasks`、`/tasks/{taskId}` 相对路径，并把成功数据 parse 成根边界类型，把错误 parse 成 `ContractClientError` + `taskErrorSchema`。

建议追加如下测试片段：

```ts
it("creates typed task CRUD client helpers", async () => {
  const task = {
    task_id: "task-1",
    task_spec: "write spec",
    session_id: null,
    worktree_path: null,
    pull_request_url: null,
    dependencies: [],
    done: false,
    status: "created",
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
  };
  const fetcher = vi.fn((input: Parameters<typeof fetch>[0]) => {
    const request = input instanceof Request ? input : new Request(String(input));
    const url = new URL(request.url, "http://contract.test");

    if (request.method === "GET" && url.pathname === "/tasks") {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }

    if (request.method === "POST" && url.pathname === "/tasks") {
      return Promise.resolve(
        new Response(JSON.stringify(task), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    }

    if (request.method === "GET" && url.pathname === "/tasks/task-1") {
      return Promise.resolve(
        new Response(JSON.stringify(task), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }

    if (request.method === "PATCH" && url.pathname === "/tasks/task-1") {
      return Promise.resolve(
        new Response(JSON.stringify({ ...task, status: "running" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }

    if (request.method === "DELETE" && url.pathname === "/tasks/task-1") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    throw new Error(`unexpected request: ${request.method} ${url.pathname}`);
  });

  const client = contractModule.createContractClient({ fetch: fetcher });

  await expect(client.listTasks({ status: "created" })).resolves.toEqual({
    items: [],
  });
  await expect(
    client.createTask({ task_spec: "write spec", dependencies: [] }),
  ).resolves.toMatchObject({
    task_id: "task-1",
    task_spec: "write spec",
    status: "created",
  });
  await expect(client.getTaskById("task-1")).resolves.toMatchObject({
    task_id: "task-1",
  });
  await expect(client.patchTaskById("task-1", { status: "running" })).resolves
    .toMatchObject({ task_id: "task-1", status: "running" });
  await expect(client.deleteTaskById("task-1")).resolves.toBeUndefined();
});

it("throws ContractClientError with task error payloads", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ code: "TASK_NOT_FOUND", message: "missing task" }),
      {
        status: 404,
        headers: { "content-type": "application/json" },
      },
    ),
  );

  const client = contractModule.createContractClient({ fetch: fetcher });

  await expect(client.getTaskById("missing")).rejects.toMatchObject({
    status: 404,
    error: { code: "TASK_NOT_FOUND", message: "missing task" },
  });
});
```

- [ ] **Step 2: 运行 contract 定向测试，确认当前基线先失败**

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "task CRUD client helpers|task error payloads"`

Expected: FAIL，报错点应集中在 `createContractClient()` 仍然只有 `getHealth()`，或缺少 `taskErrorSchema` 路径上的 parse 行为。

- [ ] **Step 3: 扩展 `modules/contract/src/client.ts`，把 Task CRUD helper 暴露到根边界**

在 `modules/contract/src/client.ts` 中：
1. 从 `../generated/client.js` 补充 import `listTasks`、`createTask`、`getTaskById`、`patchTaskById`、`deleteTaskById`。
2. 从 `../generated/types.js` 补充相应 response/error 类型。
3. 复用现有 `createGeneratedClient()` + `adaptGeneratedRequestForPublicFetch()` 逻辑，不引入第二套 fetch client。
4. 用 `schemas.Task`、`schemas.TaskListResponse`、`schemas.ErrorResponse` parse 成功与错误负载。

核心实现应接近：

```ts
export type ContractClient = {
  getHealth(): Promise<HealthResponse>;
  listTasks(query?: {
    status?: TaskStatus;
    done?: boolean;
    session_id?: string;
  }): Promise<TaskListResponse>;
  createTask(input: CreateTaskRequest): Promise<Task>;
  getTaskById(taskId: string): Promise<Task>;
  patchTaskById(taskId: string, input: PatchTaskRequest): Promise<Task>;
  deleteTaskById(taskId: string): Promise<void>;
};

async listTasks(query) {
  const result = await listTasks({
    client,
    headers: { accept: "application/json" },
    query,
  });

  if (result.error) {
    throw new ContractClientError(
      result.response.status,
      taskErrorSchema.parse(result.error satisfies ListTasksError),
    );
  }

  return taskListResponseSchema.parse(result.data satisfies ListTasksResponse);
}
```

`deleteTaskById()` 成功时直接 `return;`，不要在 contract client 层虚构 CLI delete envelope。

- [ ] **Step 4: 更新根入口导出，保证 CLI 只依赖 `@aim-ai/contract` 公共边界**

在 `modules/contract/src/index.ts` 保持现有 schema/type 导出不变，并确保新增 `ContractClient` 类型变化能从根入口被 CLI 使用。这里不需要把 generated helper 直接重新导出给 CLI；CLI 只应继续调用 `createContractClient()`。

最小变更应保持类似：

```ts
export type { ContractClient, ContractClientOptions } from "./client.js";
export { ContractClientError, createContractClient } from "./client.js";
```

如果第 3 步只改了 `client.ts` 的 `ContractClient` 类型定义，这一步通常只需要确认 `index.ts` 无额外修改；若测试要求显示导出新类型名，再按测试最小补齐。

- [ ] **Step 5: 重新运行 contract 定向测试，确认根边界可被 CLI 使用**

Run: `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "task CRUD client helpers|task error payloads"`

Expected: PASS，且 fetch 调用的路径分别是 `/tasks`、`/tasks/{taskId}`，没有任何 `contract/generated` 级 import 泄漏到 CLI 计划外边界。

- [ ] **Step 6: 提交 contract client 边界扩展**

```bash
git add modules/contract/src/client.ts modules/contract/src/index.ts modules/contract/test/contract-package.test.ts
git commit -m "feat: expose task crud contract client"
```

### Task 2: 用黑盒测试先锁定命令注册、create/list/get 协议与根边界

**Files:**
- Modify: `modules/cli/src/index.ts`
- Add: `modules/cli/test/task-command.test.ts`

- [ ] **Step 1: 新增黑盒 CLI 测试文件，先让 create/list/get 失败**

在 `modules/cli/test/task-command.test.ts` 新建与 `health-command.test.ts` 同风格的 spawn + 本地 HTTP server 测试，先覆盖三类行为：
1. `aim task create` 会发 `POST /api/tasks`，请求体正确映射 `--task-spec`、重复 `--dependency`、重复 `--pull-request-url` 取最后一个值。
2. `aim task list` 会发 `GET /api/tasks?status=...&done=...&session_id=...`。
3. `aim task get` 会发 `GET /api/tasks/{taskId}` 并输出统一 success envelope。

测试片段建议如下：

```ts
it("registers task create/list/get commands on the oclif entry", async () => {
  const server = await startTaskServer();

  const createResult = await runCli([
    "task",
    "create",
    "--base-url",
    `${server.baseUrl}/api`,
    "--task-spec",
    "write spec",
    "--dependency",
    "task-a",
    "--dependency",
    "task-b",
    "--pull-request-url",
    "https://example.test/pr/1",
    "--pull-request-url",
    "https://example.test/pr/2",
  ]);

  expect(createResult.exitCode).toBe(0);
  expect(server.requests[0]).toMatchObject({
    method: "POST",
    path: "/api/tasks",
    json: {
      task_spec: "write spec",
      dependencies: ["task-a", "task-b"],
      pull_request_url: "https://example.test/pr/2",
    },
  });
  expect(JSON.parse(createResult.stdout)).toMatchObject({
    ok: true,
    data: { task_id: "task-1", task_spec: "write spec" },
  });

  const listResult = await runCli([
    "task",
    "list",
    "--base-url",
    `${server.baseUrl}/api`,
    "--status",
    "running",
    "--done",
    "false",
    "--session-id",
    "session-1",
  ]);

  expect(listResult.exitCode).toBe(0);
  expect(server.requests[1]?.path).toBe(
    "/api/tasks?status=running&done=false&session_id=session-1",
  );

  const getResult = await runCli([
    "task",
    "get",
    "--base-url",
    `${server.baseUrl}/api`,
    "--task-id",
    "task-1",
  ]);

  expect(getResult.exitCode).toBe(0);
  expect(server.requests[2]?.path).toBe("/api/tasks/task-1");
});
```

同文件再补一个边界测试，像 `health-command.test.ts` 一样读取源码，确认 Task CLI 源码不会 import `@aim-ai/contract/generated/*`：

```ts
it("keeps task commands on the contract root boundary", async () => {
  const [indexSource, helperSource] = await Promise.all([
    readFile(new URL("../src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/task-command.ts", import.meta.url), "utf8"),
  ]);

  expect(indexSource).toContain('"task:create"');
  expect(helperSource).toContain('@aim-ai/contract');
  expect(helperSource).not.toContain("contract/generated");
});
```

- [ ] **Step 2: 运行 CLI 定向测试，确认当前命令尚未注册而失败**

Run: `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts`

Expected: FAIL，错误应表明 `task create` / `task list` / `task get` 命令未注册，或 `../src/lib/task-command.ts` 尚不存在。

- [ ] **Step 3: 在 `modules/cli/src/index.ts` 注册五个 Task 命令 key，但先只接入 create/list/get 实现文件**

把 `modules/cli/src/index.ts` 改成显式 commands map，命令 id 使用 oclif explicit strategy 兼容的字符串 key：

```ts
import TaskCreateCommand from "./commands/task/create.js";
import TaskGetCommand from "./commands/task/get.js";
import TaskListCommand from "./commands/task/list.js";
import TaskUpdateCommand from "./commands/task/update.js";
import TaskDeleteCommand from "./commands/task/delete.js";

export const commands = {
  health: HealthCommand,
  "task:create": TaskCreateCommand,
  "task:list": TaskListCommand,
  "task:get": TaskGetCommand,
  "task:update": TaskUpdateCommand,
  "task:delete": TaskDeleteCommand,
} satisfies Record<string, Command.Class>;
```

这里先把五个 key 一次性注册，避免后续测试因为 registry 变化来回改。

- [ ] **Step 4: 为 create/list/get 重新运行黑盒测试，确认现在失败点收敛到“命令文件还没实现”**

Run: `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts`

Expected: FAIL，但失败点应从“命令未注册”收敛为缺少命令文件、空实现或输出不符合 JSON envelope。

- [ ] **Step 5: 提交 create/list/get 测试基线**

```bash
git add modules/cli/src/index.ts modules/cli/test/task-command.test.ts
git commit -m "test: add task cli command coverage"
```

### Task 3: 实现共享薄工具与 create/list/get 命令

**Files:**
- Add: `modules/cli/src/lib/task-command.ts`
- Add: `modules/cli/src/commands/task/create.ts`
- Add: `modules/cli/src/commands/task/list.ts`
- Add: `modules/cli/src/commands/task/get.ts`
- Modify: `modules/cli/test/task-command.test.ts`

- [ ] **Step 1: 先补 CLI 本地错误和 success envelope 的失败测试**

在 `modules/cli/test/task-command.test.ts` 追加三类失败断言：
1. 缺少 `--base-url` 或 `--task-spec` / `--task-id` 时，CLI 直接输出 `CLI_USAGE_ERROR`，并且不会发 HTTP 请求。
2. `--base-url not-a-url` 时，CLI 输出 `CLI_INVALID_BASE_URL`。
3. `--done maybe` 或 `--status unknown` 这类 flag 值非法时，CLI 输出 `CLI_INVALID_FLAG_VALUE`。

建议片段：

```ts
it("returns a JSON usage error before making a request", async () => {
  const server = await startTaskServer();

  const result = await runCli(["task", "create", "--task-spec", "write spec"]);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(
    '{"ok":false,"error":{"code":"CLI_USAGE_ERROR","message":"missing required flag: --base-url"}}\n',
  );
  expect(server.requests).toEqual([]);
});

it("returns a JSON invalid flag error for unsupported filter values", async () => {
  const result = await runCli([
    "task",
    "list",
    "--base-url",
    "http://127.0.0.1:9999",
    "--done",
    "maybe",
  ]);

  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: {
      code: "CLI_INVALID_FLAG_VALUE",
      message: "invalid --done value: expected true or false",
    },
  });
});

it("returns a JSON invalid base url error before creating a client", async () => {
  const result = await runCli([
    "task",
    "list",
    "--base-url",
    "not-a-url",
  ]);

  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: {
      code: "CLI_INVALID_BASE_URL",
      message: "invalid --base-url value: not-a-url",
    },
  });
});
```

- [ ] **Step 2: 运行同一组 CLI 测试，确认新增失败断言先红**

Run: `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts`

Expected: FAIL，错误应表明当前实现仍返回 oclif 默认错误、未输出 JSON envelope，或 create/list/get 代码尚不存在。

- [ ] **Step 3: 新建 `modules/cli/src/lib/task-command.ts`，把公共逻辑收敛到单文件薄工具层**

在共享文件中集中放置：
1. `normalizeBaseUrl()`、`resolveContractUrl()`、`toAbsoluteRequest()`。
2. `parseBaseUrl(rawBaseUrl: string)` 与 `createTaskContractClient(baseUrl: string)`。
3. `writeSuccess(command, data)` / `exitWithFailure(command, error)`。
4. `requireFlag()`、`parseBooleanFlag()`、`parseStatusFlag()`、`pickLastValue()` 等最小 flag 解析辅助。

核心片段建议如下：

```ts
import {
  ContractClientError,
  createContractClient,
  taskStatusSchema,
  type TaskError,
  type TaskStatus,
} from "@aim-ai/contract";
import type { Command } from "@oclif/core";

export type CliSuccess<T> = { ok: true; data: T };
export type CliFailure = { ok: false; error: TaskError };

const cliError = (code: string, message: string): TaskError => ({ code, message });

export const requireFlag = (value: string | undefined, flagName: string) => {
  if (!value) {
    throw cliError("CLI_USAGE_ERROR", `missing required flag: --${flagName}`);
  }

  return value;
};

export const parseBaseUrl = (rawBaseUrl: string): URL => {
  try {
    return new URL(rawBaseUrl);
  } catch {
    throw cliError("CLI_INVALID_BASE_URL", `invalid --base-url value: ${rawBaseUrl}`);
  }
};

export const parseBooleanFlag = (value: string | undefined) => {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw cliError(
    "CLI_INVALID_FLAG_VALUE",
    "invalid --done value: expected true or false",
  );
};

export const parseStatusFlag = (value: string | undefined): TaskStatus | undefined => {
  if (value === undefined) return undefined;
  const parsed = taskStatusSchema.safeParse(value);
  if (!parsed.success) {
    throw cliError("CLI_INVALID_FLAG_VALUE", `invalid --status value: ${value}`);
  }

  return parsed.data;
};

export const writeSuccess = <T>(command: Command, data: T) => {
  command.log(JSON.stringify({ ok: true, data } satisfies CliSuccess<T>));
};

export const createTaskContractClient = (rawBaseUrl: string) => {
  const baseUrl = parseBaseUrl(rawBaseUrl);

  return createContractClient({
    fetch: (input, init) => fetch(toAbsoluteRequest(baseUrl, input, init)),
  });
};

export const exitWithFailure = (command: Command, error: unknown): never => {
  const failure = {
    ok: false,
    error:
      error instanceof ContractClientError
        ? error.error
        : error && typeof error === "object" && "code" in error && "message" in error
          ? (error as TaskError)
          : cliError("UNAVAILABLE", "unexpected error"),
  } satisfies CliFailure;

  process.stderr.write(`${JSON.stringify(failure)}\n`);
  return command.exit(1);
};
```

- [ ] **Step 4: 用最小实现补齐 create/list/get 命令，让黑盒测试转绿**

三个命令都在各自文件中只做四件事：`parse()`、手动校验 flag、调用 contract client、输出统一 success/error envelope。

`modules/cli/src/commands/task/create.ts` 建议核心实现：

```ts
export default class TaskCreateCommand extends Command {
  static override description = "Create a task via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "task-spec": Flags.string({ description: "Task spec string" }),
    "session-id": Flags.string({ description: "Task session id" }),
    "worktree-path": Flags.string({ description: "Task worktree path" }),
    "pull-request-url": Flags.string({ multiple: true, description: "Pull request URL" }),
    dependency: Flags.string({ multiple: true, description: "Task dependency id" }),
    status: Flags.string({ description: "Task status" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskCreateCommand);

    try {
      const client = createTaskContractClient(requireFlag(flags["base-url"], "base-url"));
      const task = await client.createTask({
        task_spec: requireFlag(flags["task-spec"], "task-spec"),
        session_id: flags["session-id"],
        worktree_path: flags["worktree-path"],
        pull_request_url: pickLastValue(flags["pull-request-url"]),
        dependencies: flags.dependency ?? [],
        status: parseStatusFlag(flags.status),
      });

      writeSuccess(this, task);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
```

`modules/cli/src/commands/task/list.ts` 建议把 `--done` 定义为字符串 flag 并手动 parse，避免 oclif 在 parse 阶段产出非 JSON 错误：

```ts
const tasks = await client.listTasks({
  status: parseStatusFlag(flags.status),
  done: parseBooleanFlag(flags.done),
  session_id: flags["session-id"],
});

writeSuccess(this, tasks);
```

`modules/cli/src/commands/task/get.ts` 只要求 `--base-url` 和 `--task-id`：

```ts
const task = await client.getTaskById(requireFlag(flags["task-id"], "task-id"));
writeSuccess(this, task);
```

- [ ] **Step 5: 重新运行 Task CLI 黑盒测试，确认 create/list/get 与本地错误全部通过**

Run: `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts`

Expected: PASS，至少覆盖：命令注册成功、create/list/get 请求路径正确、成功 envelope 正确、缺少必填 flag 时输出 `CLI_USAGE_ERROR`、非法 base URL 时输出 `CLI_INVALID_BASE_URL`、非法 `--done` 或 `--status` 时输出 `CLI_INVALID_FLAG_VALUE`。

- [ ] **Step 6: 提交 create/list/get 实现**

```bash
git add modules/cli/src/lib/task-command.ts modules/cli/src/commands/task/create.ts modules/cli/src/commands/task/list.ts modules/cli/src/commands/task/get.ts modules/cli/test/task-command.test.ts
git commit -m "feat: add task cli read and create commands"
```

### Task 4: 用 TDD 落地 update/delete、`clear-*` 语义与错误透传

**Files:**
- Add: `modules/cli/src/commands/task/update.ts`
- Add: `modules/cli/src/commands/task/delete.ts`
- Modify: `modules/cli/src/lib/task-command.ts`
- Modify: `modules/cli/test/task-command.test.ts`

- [ ] **Step 1: 先写 update/delete 的黑盒失败测试，锁定 patch 语义和错误优先级**

在 `modules/cli/test/task-command.test.ts` 再补四组断言：
1. `task update` 把 `--clear-session-id`、`--clear-worktree-path`、`--clear-pull-request-url`、`--clear-dependencies` 映射成 `null`/`[]`。
2. `task update` 若同时给 `--session-id` 与 `--clear-session-id`，直接本地失败，输出 `CLI_INVALID_FLAG_VALUE`，且不发请求。
3. 服务端 404/400 错误必须原样保留 `code` 与 `message`。
4. 服务端不可用或 fetch 失败时，CLI 回落到 `UNAVAILABLE`。
5. `task delete` 成功时返回 `{"ok": true, "data": {"deleted": true, "task_id": "..."}}`。

建议片段：

```ts
it("maps clear flags to explicit patch null and empty-array values", async () => {
  const server = await startTaskServer();

  const result = await runCli([
    "task",
    "update",
    "--base-url",
    `${server.baseUrl}/api`,
    "--task-id",
    "task-1",
    "--status",
    "running",
    "--clear-session-id",
    "--clear-worktree-path",
    "--clear-pull-request-url",
    "--clear-dependencies",
  ]);

  expect(result.exitCode).toBe(0);
  expect(server.requests[0]).toMatchObject({
    method: "PATCH",
    path: "/api/tasks/task-1",
    json: {
      status: "running",
      session_id: null,
      worktree_path: null,
      pull_request_url: null,
      dependencies: [],
    },
  });
});

it("rejects conflicting update flags before any HTTP request", async () => {
  const server = await startTaskServer();

  const result = await runCli([
    "task",
    "update",
    "--base-url",
    `${server.baseUrl}/api`,
    "--task-id",
    "task-1",
    "--session-id",
    "session-1",
    "--clear-session-id",
  ]);

  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: {
      code: "CLI_INVALID_FLAG_VALUE",
      message: "cannot combine --session-id with --clear-session-id",
    },
  });
  expect(server.requests).toEqual([]);
});

it("preserves server task errors on stderr", async () => {
  const result = await runCli([
    "task",
    "get",
    "--base-url",
    `${failingServer.baseUrl}/api`,
    "--task-id",
    "missing",
  ]);

  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: { code: "TASK_NOT_FOUND", message: "missing task" },
  });
});

it("falls back to UNAVAILABLE when the server cannot be reached", async () => {
  const result = await runCli([
    "task",
    "list",
    "--base-url",
    "http://127.0.0.1:1",
  ]);

  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr)).toEqual({
    ok: false,
    error: { code: "UNAVAILABLE", message: "unexpected error" },
  });
});

it("prints the delete success envelope without inventing extra fields", async () => {
  const result = await runCli([
    "task",
    "delete",
    "--base-url",
    `${server.baseUrl}/api`,
    "--task-id",
    "task-1",
  ]);

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    ok: true,
    data: { deleted: true, task_id: "task-1" },
  });
});
```

- [ ] **Step 2: 运行 CLI 定向测试，确认 update/delete 需求仍然失败**

Run: `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts`

Expected: FAIL，至少会报 `task update` / `task delete` 尚未实现，或 clear flag / delete envelope 与 spec 不一致。

- [ ] **Step 3: 在共享 helper 中补上 patch clear 语义和冲突校验函数**

在 `modules/cli/src/lib/task-command.ts` 加入两个最小 helper：
1. `assertNoConflict(value, clearFlag, flagName, clearFlagName)`。
2. `hasOwnPatchField(patch)`，确保 `task update` 没有任何变更字段时输出 `CLI_USAGE_ERROR`。

建议片段：

```ts
export const assertNoConflict = (
  value: unknown,
  clearSelected: boolean,
  valueFlagName: string,
  clearFlagName: string,
) => {
  if (value !== undefined && clearSelected) {
    throw cliError(
      "CLI_INVALID_FLAG_VALUE",
      `cannot combine --${valueFlagName} with --${clearFlagName}`,
    );
  }
};

export const hasOwnPatchField = (patch: Record<string, unknown>) =>
  Object.keys(patch).length > 0;
```

- [ ] **Step 4: 用最小实现补齐 update/delete 命令**

`modules/cli/src/commands/task/update.ts` 必须做到：
1. 手动校验 `--base-url`、`--task-id`。
2. 校验每对 value/clear flag 不可并存。
3. 如果没有任何 patch 字段，输出 `CLI_USAGE_ERROR`。
4. 调用 `client.patchTaskById()` 并输出 success envelope。

核心实现建议如下：

```ts
const patch: PatchTaskRequest = {};

assertNoConflict(flags["session-id"], flags["clear-session-id"] ?? false, "session-id", "clear-session-id");
assertNoConflict(flags["worktree-path"], flags["clear-worktree-path"] ?? false, "worktree-path", "clear-worktree-path");
assertNoConflict(flags["pull-request-url"]?.length, flags["clear-pull-request-url"] ?? false, "pull-request-url", "clear-pull-request-url");
assertNoConflict(flags.dependency?.length, flags["clear-dependencies"] ?? false, "dependency", "clear-dependencies");

if (flags["task-spec"] !== undefined) patch.task_spec = flags["task-spec"];
if (flags.status !== undefined) patch.status = parseStatusFlag(flags.status);
if (flags["session-id"] !== undefined) patch.session_id = flags["session-id"];
if (flags["clear-session-id"]) patch.session_id = null;
if (flags["worktree-path"] !== undefined) patch.worktree_path = flags["worktree-path"];
if (flags["clear-worktree-path"]) patch.worktree_path = null;
if (flags["pull-request-url"]?.length) patch.pull_request_url = pickLastValue(flags["pull-request-url"]);
if (flags["clear-pull-request-url"]) patch.pull_request_url = null;
if (flags.dependency?.length) patch.dependencies = flags.dependency;
if (flags["clear-dependencies"]) patch.dependencies = [];

if (!hasOwnPatchField(patch)) {
  throw {
    code: "CLI_USAGE_ERROR",
    message: "task update requires at least one patch flag",
  };
}

const task = await client.patchTaskById(requireFlag(flags["task-id"], "task-id"), patch);
writeSuccess(this, task);
```

`modules/cli/src/commands/task/delete.ts` 应保持更薄，只包装 contract delete 成功为 spec 要求的 envelope：

```ts
await client.deleteTaskById(taskId);
writeSuccess(this, { deleted: true, task_id: taskId });
```

- [ ] **Step 5: 重新运行 Task CLI 黑盒测试，确认 update/delete、clear 语义和错误透传全部通过**

Run: `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts`

Expected: PASS，覆盖点至少包括：
1. `task update` 能发送 PATCH。
2. `clear-*` 会映射到 `null`/`[]`。
3. 冲突 flag 会在本地报 `CLI_INVALID_FLAG_VALUE`。
4. 服务端 Task 错误会原样出现在 `stderr`。
5. fetch 失败时会回落到 `UNAVAILABLE`。
6. `task delete` 的 success envelope 是 `{ deleted: true, task_id }`。

- [ ] **Step 6: 提交 update/delete 实现**

```bash
git add modules/cli/src/lib/task-command.ts modules/cli/src/commands/task/update.ts modules/cli/src/commands/task/delete.ts modules/cli/test/task-command.test.ts
git commit -m "feat: add task cli update and delete commands"
```

### Task 5: 把 Task CLI 接入现有测试编排并完成收口验证

**Files:**
- Modify: `modules/cli/package.json`
- Modify: `modules/cli/test/task-command.test.ts`

- [ ] **Step 1: 先补一个 build 后的 smoke 测试断言，锁定发布入口能跑 `aim task list`**

在 `modules/cli/test/task-command.test.ts` 追加一个与 health smoke 同级的黑盒用例，要求从 `bin/dev.js` 启动、命中 `dist/index.mjs`、并能在 build 后成功执行 `task list`：

```ts
it("boots task list from the published bin and prints JSON only", async () => {
  const server = await startTaskServer();

  const result = await runCli([
    "task",
    "list",
    "--base-url",
    `${server.baseUrl}/api`,
  ]);

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({
    ok: true,
    data: { items: expect.any(Array) },
  });
});
```

- [ ] **Step 2: 运行定向测试，确认新 smoke 断言先失败或尚未进入默认编排**

Run: `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts`

Expected: 若 `task list` 路径未进入 build/smoke 编排，则这里可能 PASS；此时继续第 3 步把它接入 `package.json` 的默认测试链路。若这里 FAIL，则先记录失败点并在第 3 步一并修正。

- [ ] **Step 3: 更新 `modules/cli/package.json`，把 Task CLI 验证并入现有 test/smoke 链路**

保持现有 health smoke 不删除，只做最小扩展：
1. 让 `vitest run --project cli` 自然包含新的 `task-command.test.ts`。
2. 把 `test:smoke` 的内联脚本从只跑 `health` 扩展为先跑 `health` 再跑 `task list`，两者都要求零 stderr 与 JSON 输出。

脚本结构应接近：

```json
{
  "scripts": {
    "test": "pnpm run test:type && pnpm run test:lint && pnpm run build && pnpm --dir ../.. exec vitest run --config vitest.workspace.ts --project cli && pnpm run test:smoke",
    "test:smoke": "pnpm --dir ../.. --filter @aim-ai/contract run build && pnpm run build && node --input-type=module --eval \"... spawn(process.execPath, ['./bin/dev.js', 'health', '--base-url', baseUrl]) ... spawn(process.execPath, ['./bin/dev.js', 'task', 'list', '--base-url', baseUrl]) ...\""
  }
}
```

不要额外引入 shell 脚本文件；保持当前 `package.json` 内联 smoke 风格即可。

- [ ] **Step 4: 跑完整 CLI 包验证，确认类型、lint、build、黑盒测试和 smoke 全绿**

Run: `pnpm --filter @aim-ai/cli run test`

Expected: PASS，顺序上会完成 `typecheck`、`biome check`、`build`、CLI project Vitest 和 smoke；输出中应能看到 health 与 task list 都命中本地测试服务并以退出码 `0` 结束。

- [ ] **Step 5: 提交测试编排与收口改动**

```bash
git add modules/cli/package.json modules/cli/test/task-command.test.ts
git commit -m "test: add task cli smoke coverage"
```

## 最终验证清单

- [ ] `pnpm --filter @aim-ai/contract exec vitest run --config ../../vitest.workspace.ts --project contract --testNamePattern "task CRUD client helpers|task error payloads"`
Expected: PASS，确认 CLI 所需 contract client helper 已从根边界可用。

- [ ] `pnpm --filter @aim-ai/cli exec vitest run --config ../../vitest.workspace.ts --project cli modules/cli/test/task-command.test.ts`
Expected: PASS，覆盖 create/list/get/update/delete、success envelope、stderr error envelope、`CLI_USAGE_ERROR`、`CLI_INVALID_BASE_URL`、`CLI_INVALID_FLAG_VALUE`、`UNAVAILABLE`、clear 语义、冲突 flag 和根边界约束。

- [ ] `pnpm --filter @aim-ai/cli run test`
Expected: PASS，说明 Task CLI 已纳入 package 默认验证编排。

## 交付结果

完成后，仓库应具备以下稳定事实：

- `@aim-ai/contract` 根边界提供 Task CRUD client helper，CLI 不需要 import generated client 细节。
- `aim task create|list|get|update|delete` 五个命令都接受显式 `--base-url`，并把请求映射到服务端 Task CRUD endpoint。
- 成功输出统一 `ok=true` JSON envelope；失败输出统一 `ok=false` error envelope 到 `stderr`。
- `task update` 的 `clear-*` 语义、冲突校验和 delete envelope 都被黑盒测试锁定。
- CLI 仍然是 thin contract client，不包含 SQLite、本地 domain layer、分页、排序、bulk、env/config 默认值或 orchestration 命令。
