# OpenCode SDK Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `modules/api` 内把占位版 `createTaskSessionCoordinator()` 替换为 OpenCode SDK-backed 实现，并只新增 scheduler 当前需要的三项最小能力与启动期显式配置注入。

**Architecture:** 保持 scheduler 只依赖 `createTaskSessionCoordinator(config)`，不直接接触 SDK。实现分成两层：`modules/api/src/opencode-sdk-adapter.ts` 负责初始化 `@opencode-ai/sdk` client 并发起原始 API 调用，`modules/api/src/task-session-coordinator.ts` 负责 config 校验、动作级错误语义和 AIM 类型映射；`modules/api/src/server.ts` 只在 scheduler 启用时读取环境变量并显式传入 config。

**Tech Stack:** TypeScript、Node.js 24、Vitest、pnpm workspace、`@opencode-ai/sdk`

---

## 文件结构与职责映射

- Modify: `modules/api/package.json` - 为 `@aim-ai/api` 增加 `@opencode-ai/sdk` 运行时依赖。
- Create: `modules/api/src/opencode-sdk-adapter.ts` - 封装 `Opencode` client 初始化、`session.create`、`session.chat` 和原始 session 状态查询。
- Modify: `modules/api/src/task-session-coordinator.ts` - 导出 `TaskSessionCoordinatorConfig`，接收显式 config，调用 adapter，并把远端结果收敛为 `{ sessionId }`、`idle | running`、`void`。
- Modify: `modules/api/src/server.ts` - 仅在 `TASK_SCHEDULER_ENABLED === "true"` 时读取 `OPENCODE_BASE_URL`、`OPENCODE_PROVIDER_ID`、`OPENCODE_MODEL_ID`，再传给 `createTaskSessionCoordinator(config)`。
- Create: `modules/api/test/task-session-coordinator.test.ts` - 覆盖 config 校验、`createSession`、`getSessionState`、`sendContinuePrompt` 的成功与失败语义。
- Modify: `modules/api/test/server.test.ts` - 覆盖 scheduler 开启/关闭时的 config 读取边界和 fail-fast 行为。

## 实施约束

- 严格保持 scope 只包含 `createSession`、`getSessionState`、`sendContinuePrompt` 三项能力。
- `createTaskSessionCoordinator` 及 adapter 不得直接读取 `process.env`；只有 `server.ts` 可以读环境变量。
- adapter 必须使用 `new Opencode({ baseURL, maxRetries: 0 })`，显式禁用 SDK 默认重试，避免超出 spec 的 retry 行为。
- `getSessionState` 只允许映射 `idle` 和 `running`；任何其他远端 `status` 都必须抛错。
- 不新增恢复、诊断、取消、事件流、生命周期管理或额外 runtime 开关。

### Task 1: 建立 coordinator 配置边界与测试注入缝

**Files:**
- Modify: `modules/api/src/task-session-coordinator.ts`
- Create: `modules/api/test/task-session-coordinator.test.ts`

- [ ] **Step 1: 先写 coordinator 的失败测试，锁定显式 config 和动作级依赖注入缝**

```ts
import type { Task } from "@aim-ai/contract";
import { describe, expect, it, vi } from "vitest";

import {
  createTaskSessionCoordinator,
  type TaskSessionCoordinatorConfig,
} from "../src/task-session-coordinator.js";

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  dependencies: [],
  done: false,
  pull_request_url: null,
  session_id: null,
  status: "created",
  task_id: "task-1",
  task_spec: "Implement the OpenCode SDK coordinator.",
  updated_at: "2026-04-20T00:00:00.000Z",
  worktree_path: "/repo/.worktrees/task-1",
  ...overrides,
});

const config: TaskSessionCoordinatorConfig = {
  baseUrl: "http://127.0.0.1:54321",
  modelId: "claude-sonnet-4-5",
  providerId: "anthropic",
};

describe("task session coordinator", () => {
  it("fails fast when baseUrl is blank", () => {
    expect(() =>
      createTaskSessionCoordinator({
        ...config,
        baseUrl: "   ",
      }),
    ).toThrow("Task session coordinator requires a non-empty baseUrl");
  });

  it("returns only the injected session id shape", async () => {
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn().mockResolvedValue({ id: "session-1" }),
      getSession: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await expect(coordinator.createSession(createTask())).resolves.toEqual({
      sessionId: "session-1",
    });
  });
});
```

Run: `pnpm --filter @aim-ai/api exec vitest run modules/api/test/task-session-coordinator.test.ts --testNamePattern "fails fast when baseUrl is blank|returns only the injected session id shape"`

Expected: FAIL，提示 `TaskSessionCoordinatorConfig` 还不存在，且 `createTaskSessionCoordinator` 还不接受 config / adapter 参数。

- [ ] **Step 2: 写最小实现，先把 config、adapter seam 和基础 shape 落出来**

```ts
import type { Task } from "@aim-ai/contract";

import {
  createOpenCodeSdkAdapter,
  type OpenCodeSdkAdapter,
} from "./opencode-sdk-adapter.js";

export type TaskSessionState = "idle" | "running";

export type TaskSessionCoordinatorConfig = {
  baseUrl: string;
  modelId: string;
  providerId: string;
};

export type TaskSessionCoordinator = {
  createSession(task: Task): Promise<{ sessionId: string }>;
  getSessionState(sessionId: string): Promise<TaskSessionState>;
  sendContinuePrompt(sessionId: string, prompt: string): Promise<void>;
};

const requireNonEmpty = (value: string, name: keyof TaskSessionCoordinatorConfig) => {
  if (!value.trim()) {
    throw new Error(`Task session coordinator requires a non-empty ${name}`);
  }
};

export const createTaskSessionCoordinator = (
  config: TaskSessionCoordinatorConfig,
  adapter: OpenCodeSdkAdapter = createOpenCodeSdkAdapter(config),
): TaskSessionCoordinator => {
  requireNonEmpty(config.baseUrl, "baseUrl");
  requireNonEmpty(config.modelId, "modelId");
  requireNonEmpty(config.providerId, "providerId");

  return {
    async createSession(task) {
      const session = await adapter.createSession(task);
      return { sessionId: session.id };
    },
    async getSessionState() {
      throw new Error("Task session coordinator failed during getSessionState");
    },
    async sendContinuePrompt() {
      throw new Error("Task session coordinator failed during sendContinuePrompt");
    },
  };
};
```

Run: `pnpm --filter @aim-ai/api exec vitest run modules/api/test/task-session-coordinator.test.ts --testNamePattern "fails fast when baseUrl is blank|returns only the injected session id shape"`

Expected: PASS，两条测试都通过；其余行为仍可继续通过后续 failing test 推进。

- [ ] **Step 3: 提交 Task 1**

```bash
git add modules/api/src/task-session-coordinator.ts modules/api/test/task-session-coordinator.test.ts
git commit -m "refactor: define coordinator config seam"
```

### Task 2: 用 failing test 锁定 `createSession` 和 `sendContinuePrompt` 的动作语义

**Files:**
- Modify: `modules/api/src/task-session-coordinator.ts`
- Modify: `modules/api/test/task-session-coordinator.test.ts`

- [ ] **Step 1: 追加 `createSession` / `sendContinuePrompt` 的成功与失败测试**

```ts
it("wraps createSession adapter failures with action-specific context", async () => {
  const coordinator = createTaskSessionCoordinator(config, {
    createSession: vi.fn().mockRejectedValue(new Error("connection refused")),
    getSession: vi.fn(),
    sendPrompt: vi.fn(),
  });

  await expect(coordinator.createSession(createTask())).rejects.toThrow(
    "Task session coordinator failed during createSession",
  );
});

it("delegates continue prompts and resolves void", async () => {
  const sendPrompt = vi.fn().mockResolvedValue(undefined);
  const coordinator = createTaskSessionCoordinator(config, {
    createSession: vi.fn(),
    getSession: vi.fn(),
    sendPrompt,
  });

  await expect(
    coordinator.sendContinuePrompt("session-1", "Continue the task."),
  ).resolves.toBeUndefined();
  expect(sendPrompt).toHaveBeenCalledWith("session-1", "Continue the task.");
});

it("wraps sendContinuePrompt adapter failures with action-specific context", async () => {
  const coordinator = createTaskSessionCoordinator(config, {
    createSession: vi.fn(),
    getSession: vi.fn(),
    sendPrompt: vi.fn().mockRejectedValue(new Error("write failed")),
  });

  await expect(
    coordinator.sendContinuePrompt("session-1", "Continue the task."),
  ).rejects.toThrow("Task session coordinator failed during sendContinuePrompt");
});
```

Run: `pnpm --filter @aim-ai/api exec vitest run modules/api/test/task-session-coordinator.test.ts --testNamePattern "createSession|continue prompts|sendContinuePrompt"`

Expected: FAIL，当前 `createSession` 直接透传 adapter error，`sendContinuePrompt` 还是占位抛错。

- [ ] **Step 2: 用最小实现补齐两个动作，不引入额外 helper 层级**

```ts
const wrapActionError = (action: string, cause: unknown) =>
  new Error(`Task session coordinator failed during ${action}`, { cause });

return {
  async createSession(task) {
    try {
      const session = await adapter.createSession(task);
      return { sessionId: session.id };
    } catch (error) {
      throw wrapActionError("createSession", error);
    }
  },
  async getSessionState() {
    throw new Error("Task session coordinator failed during getSessionState");
  },
  async sendContinuePrompt(sessionId, prompt) {
    try {
      await adapter.sendPrompt(sessionId, prompt);
    } catch (error) {
      throw wrapActionError("sendContinuePrompt", error);
    }
  },
};
```

Run: `pnpm --filter @aim-ai/api exec vitest run modules/api/test/task-session-coordinator.test.ts --testNamePattern "createSession|continue prompts|sendContinuePrompt"`

Expected: PASS，`createSession` 只返回 `{ sessionId }`，`sendContinuePrompt` 成功时返回 `void`，两类 adapter failure 都变成动作级错误。

- [ ] **Step 3: 提交 Task 2**

```bash
git add modules/api/src/task-session-coordinator.ts modules/api/test/task-session-coordinator.test.ts
git commit -m "feat: add coordinator action errors"
```

### Task 3: 落地 `getSessionState` 的显式状态映射与未知状态错误

**Files:**
- Modify: `modules/api/src/task-session-coordinator.ts`
- Modify: `modules/api/test/task-session-coordinator.test.ts`

- [ ] **Step 1: 先写已知状态映射和未知状态失败测试**

```ts
it.each([
  { remote: "idle", expected: "idle" },
  { remote: "running", expected: "running" },
] as const)("maps %s to AIM session state", async ({ remote, expected }) => {
  const coordinator = createTaskSessionCoordinator(config, {
    createSession: vi.fn(),
    getSession: vi.fn().mockResolvedValue({ status: remote }),
    sendPrompt: vi.fn(),
  });

  await expect(coordinator.getSessionState("session-1")).resolves.toBe(expected);
});

it("fails on an unknown remote session status", async () => {
  const coordinator = createTaskSessionCoordinator(config, {
    createSession: vi.fn(),
    getSession: vi.fn().mockResolvedValue({ status: "paused" }),
    sendPrompt: vi.fn(),
  });

  await expect(coordinator.getSessionState("session-1")).rejects.toThrow(
    'Unknown OpenCode session status: paused',
  );
});

it("wraps getSessionState adapter failures with action-specific context", async () => {
  const coordinator = createTaskSessionCoordinator(config, {
    createSession: vi.fn(),
    getSession: vi.fn().mockRejectedValue(new Error("503 Service Unavailable")),
    sendPrompt: vi.fn(),
  });

  await expect(coordinator.getSessionState("session-1")).rejects.toThrow(
    "Task session coordinator failed during getSessionState",
  );
});
```

Run: `pnpm --filter @aim-ai/api exec vitest run modules/api/test/task-session-coordinator.test.ts --testNamePattern "maps|unknown remote session status|getSessionState"`

Expected: FAIL，`getSessionState` 仍是占位实现，无法返回 `idle | running`，也不会对未知远端状态报错。

- [ ] **Step 2: 用显式 `switch` 收敛状态，不做任何宽松映射**

```ts
const toTaskSessionState = (status: string): TaskSessionState => {
  switch (status) {
    case "idle":
      return "idle";
    case "running":
      return "running";
    default:
      throw new Error(`Unknown OpenCode session status: ${status}`);
  }
};

return {
  async createSession(task) {
    try {
      const session = await adapter.createSession(task);
      return { sessionId: session.id };
    } catch (error) {
      throw wrapActionError("createSession", error);
    }
  },
  async getSessionState(sessionId) {
    try {
      const session = await adapter.getSession(sessionId);
      return toTaskSessionState(session.status);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Unknown OpenCode session status:")
      ) {
        throw error;
      }
      throw wrapActionError("getSessionState", error);
    }
  },
  async sendContinuePrompt(sessionId, prompt) {
    try {
      await adapter.sendPrompt(sessionId, prompt);
    } catch (error) {
      throw wrapActionError("sendContinuePrompt", error);
    }
  },
};
```

Run: `pnpm --filter @aim-ai/api exec vitest run modules/api/test/task-session-coordinator.test.ts`

Expected: PASS，coordinator 单测完整覆盖 config 校验、三个动作的成功路径、动作级错误和未知远端状态错误。

- [ ] **Step 3: 提交 Task 3**

```bash
git add modules/api/src/task-session-coordinator.ts modules/api/test/task-session-coordinator.test.ts
git commit -m "feat: map opencode session states"
```

### Task 4: 新增薄 SDK adapter，并把 server 启动路径改成显式配置注入

**Files:**
- Modify: `modules/api/package.json`
- Create: `modules/api/src/opencode-sdk-adapter.ts`
- Modify: `modules/api/src/task-session-coordinator.ts`
- Modify: `modules/api/src/server.ts`
- Modify: `modules/api/test/server.test.ts`

- [ ] **Step 1: 先补 server 启动边界测试，锁定“只在 scheduler 启用时读取配置”**

```ts
it("passes explicit OpenCode config only when scheduler is enabled", async () => {
  process.env.TASK_SCHEDULER_ENABLED = "true";
  process.env.OPENCODE_BASE_URL = "http://127.0.0.1:54321";
  process.env.OPENCODE_PROVIDER_ID = "anthropic";
  process.env.OPENCODE_MODEL_ID = "claude-sonnet-4-5";

  const server = { close: vi.fn(), once: vi.fn() };
  mockServe.mockReturnValue(server);
  mockCreateTaskRepository.mockReturnValue({});
  mockCreateTaskScheduler.mockReturnValue({ start: vi.fn(), stop: vi.fn() });

  const { startServer } = await import("../src/server.js");

  startServer();

  expect(mockCreateTaskSessionCoordinator).toHaveBeenCalledWith({
    baseUrl: "http://127.0.0.1:54321",
    modelId: "claude-sonnet-4-5",
    providerId: "anthropic",
  });
});

it("does not read or pass OpenCode config when scheduler is disabled", async () => {
  delete process.env.TASK_SCHEDULER_ENABLED;
  delete process.env.OPENCODE_BASE_URL;
  delete process.env.OPENCODE_PROVIDER_ID;
  delete process.env.OPENCODE_MODEL_ID;

  mockServe.mockReturnValue({ close: vi.fn(), once: vi.fn() });

  const { startServer } = await import("../src/server.js");

  startServer();

  expect(mockCreateTaskRepository).not.toHaveBeenCalled();
  expect(mockCreateTaskSessionCoordinator).not.toHaveBeenCalled();
  expect(mockCreateTaskScheduler).not.toHaveBeenCalled();
});

it("fails fast when scheduler is enabled but OpenCode config is missing", async () => {
  process.env.TASK_SCHEDULER_ENABLED = "true";
  delete process.env.OPENCODE_BASE_URL;
  process.env.OPENCODE_PROVIDER_ID = "anthropic";
  process.env.OPENCODE_MODEL_ID = "claude-sonnet-4-5";

  mockServe.mockReturnValue({ close: vi.fn(), once: vi.fn() });

  const { startServer } = await import("../src/server.js");

  expect(() => startServer()).toThrow(
    "OPENCODE_BASE_URL is required when TASK_SCHEDULER_ENABLED=true",
  );
});
```

Run: `pnpm --filter @aim-ai/api exec vitest run modules/api/test/server.test.ts`

Expected: FAIL，当前 `server.ts` 仍然调用 `createTaskSessionCoordinator()` 无参版本，且不会读取任何 OpenCode 配置。

- [ ] **Step 2: 添加 SDK 依赖，并实现保持“薄”的 adapter 文件**

```json
{
  "dependencies": {
    "@aim-ai/contract": "workspace:*",
    "@hono/node-server": "^1.19.6",
    "@opencode-ai/sdk": "^1.14.18",
    "hono": "^4.10.5"
  }
}
```

```ts
import type { Task } from "@aim-ai/contract";
import Opencode from "@opencode-ai/sdk";

import type { TaskSessionCoordinatorConfig } from "./task-session-coordinator.js";

export type OpenCodeSdkAdapter = {
  createSession(task: Task): Promise<{ id: string }>;
  getSession(sessionId: string): Promise<{ status: string }>;
  sendPrompt(sessionId: string, prompt: string): Promise<void>;
};

const buildInitialPrompt = (task: Task) => `Continue the assigned task session.

task_id: ${task.task_id}
task_spec: ${task.task_spec}
status: ${task.status}
worktree_path: ${task.worktree_path ?? "null"}
pull_request_url: ${task.pull_request_url ?? "null"}

Start this task from scratch and follow the normal session workflow. If you cannot continue, write the task's failure state. When the task is complete, write done=true.`;

export const createOpenCodeSdkAdapter = (
  config: TaskSessionCoordinatorConfig,
): OpenCodeSdkAdapter => {
  const client = new Opencode({
    baseURL: config.baseUrl,
    maxRetries: 0,
  });

  return {
    async createSession(task) {
      const session = await client.session.create();
      await client.session.chat(session.id, {
        modelID: config.modelId,
        providerID: config.providerId,
        parts: [{ type: "text", text: buildInitialPrompt(task) }],
      });
      return { id: session.id };
    },
    async getSession(sessionId) {
      return client.get<{ status: string }>(`/session/${sessionId}`);
    },
    async sendPrompt(sessionId, prompt) {
      await client.session.chat(sessionId, {
        modelID: config.modelId,
        providerID: config.providerId,
        parts: [{ type: "text", text: prompt }],
      });
    },
  };
};
```

Run: `pnpm --filter @aim-ai/api add @opencode-ai/sdk && pnpm --filter @aim-ai/api exec vitest run modules/api/test/server.test.ts modules/api/test/task-session-coordinator.test.ts`

Expected: server test 仍可能因 `server.ts` 未接线而失败，但 `@opencode-ai/sdk` 依赖已进入 `modules/api/package.json`，并且 adapter 文件可以被 TypeScript 解析。

- [ ] **Step 3: 把 server 显式 config 注入和 coordinator 默认 adapter 接上线**

```ts
const readRequiredEnv = (
  name: "OPENCODE_BASE_URL" | "OPENCODE_PROVIDER_ID" | "OPENCODE_MODEL_ID",
) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when TASK_SCHEDULER_ENABLED=true`);
  }
  return value;
};

export const startServer = () => {
  const isTaskSchedulerEnabled = process.env.TASK_SCHEDULER_ENABLED === "true";
  let scheduler: ReturnType<typeof createTaskScheduler> | undefined;
  let stopScheduler: (() => void) | undefined;

  if (isTaskSchedulerEnabled) {
    const coordinatorConfig = {
      baseUrl: readRequiredEnv("OPENCODE_BASE_URL"),
      modelId: readRequiredEnv("OPENCODE_MODEL_ID"),
      providerId: readRequiredEnv("OPENCODE_PROVIDER_ID"),
    };
    const taskRepository = createTaskRepository({
      projectRoot: process.env.AIM_PROJECT_ROOT,
    });
    const taskScheduler = createTaskScheduler({
      coordinator: createTaskSessionCoordinator(coordinatorConfig),
      taskRepository,
    });

    scheduler = taskScheduler;
    stopScheduler = () => taskScheduler.stop();
  }

  const server = serve({ fetch: createApp().fetch, port });
  // existing lifecycle code stays unchanged
};
```

Run: `pnpm --filter @aim-ai/api exec vitest run modules/api/test/server.test.ts modules/api/test/task-session-coordinator.test.ts`

Expected: PASS，server 单测验证 scheduler 开/关边界与 fail-fast；coordinator 单测继续保持通过。

- [ ] **Step 4: 提交 Task 4**

```bash
git add modules/api/package.json modules/api/src/opencode-sdk-adapter.ts modules/api/src/task-session-coordinator.ts modules/api/src/server.ts modules/api/test/server.test.ts modules/api/test/task-session-coordinator.test.ts
git commit -m "feat: wire opencode sdk coordinator"
```

### Task 5: 做最小完整验证并提交最终整理

**Files:**
- Verify only: `modules/api/package.json`
- Verify only: `modules/api/src/opencode-sdk-adapter.ts`
- Verify only: `modules/api/src/task-session-coordinator.ts`
- Verify only: `modules/api/src/server.ts`
- Verify only: `modules/api/test/task-session-coordinator.test.ts`
- Verify only: `modules/api/test/server.test.ts`

- [ ] **Step 1: 运行 package 级完整验证，确认没有超出本次 scope 的回归**

Run: `pnpm --filter @aim-ai/api test`

Expected: PASS，至少包含 `typecheck`、`biome check`、`@aim-ai/contract build`、`modules/api build` 和 API Vitest 项目全部通过。

- [ ] **Step 2: 用 diff 自检变更范围，确认只触达 spec 允许的最小边界**

Run: `git diff -- modules/api/package.json modules/api/src/opencode-sdk-adapter.ts modules/api/src/task-session-coordinator.ts modules/api/src/server.ts modules/api/test/task-session-coordinator.test.ts modules/api/test/server.test.ts`

Expected: diff 只体现 SDK 依赖、薄 adapter、显式 config 注入、coordinator 类型/错误收敛，以及对应最小测试；不出现重试、恢复、诊断或 scheduler 直接依赖 SDK 的扩展。

- [ ] **Step 3: 提交最终整理（如果 Task 4 之后还有审查性修正）**

```bash
git add modules/api/package.json modules/api/src/opencode-sdk-adapter.ts modules/api/src/task-session-coordinator.ts modules/api/src/server.ts modules/api/test/task-session-coordinator.test.ts modules/api/test/server.test.ts
git commit -m "test: verify opencode coordinator coverage"
```

Expected: 若 Task 4 后没有新增修正，则跳过此提交；若因完整验证发现需要最小修正，则以这次提交收尾。

## 自检结论

- [x] **Spec coverage:** Task 1 覆盖显式 config 与 coordinator seam；Task 2 覆盖 `createSession` / `sendContinuePrompt` 成功与动作级错误；Task 3 覆盖 `getSessionState` 的 `idle | running` 映射与未知状态错误；Task 4 覆盖 `server.ts` 的按需读 env、fail-fast、薄 adapter 与 SDK 依赖接线；Task 5 覆盖 package 级验证与变更范围约束。
- [x] **Placeholder scan:** 已移除 `TODO` / `TBD` / “similar to previous task” 这类占位表述；每个会改代码的步骤都给出了实际代码片段、命令和预期结果。
- [x] **Type consistency:** 全文统一使用 `TaskSessionCoordinatorConfig`、`OpenCodeSdkAdapter`、`createTaskSessionCoordinator(config, adapter?)`、`createOpenCodeSdkAdapter(config)`、`getSession(sessionId): Promise<{ status: string }>`、`sendPrompt(sessionId, prompt)` 这些名称和签名，没有在后续任务中漂移。
- [x] **Scope check:** 没有把实现扩展到 retries、恢复、诊断、session lifecycle extras、scheduler 直接接 SDK，且 `server.ts` 仍然是唯一环境变量读取点。
