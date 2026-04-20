# Session Message State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Session 状态判定责任下沉到 OpenCode adapter，基于消息序列保守返回 AIM 级 `idle | running`，并保持 coordinator / scheduler 只消费这两态。

**Architecture:** 实现分成三层最小边界：`modules/api/src/session-message-state.ts` 负责把 OpenCode `session.messages` payload 收敛为 AIM 两态；`modules/api/src/opencode-sdk-adapter.ts` 负责拉取消息并调用该分类器；`modules/api/src/task-session-coordinator.ts` 仅保留 action-scoped 错误包装与透传。`modules/api/src/task-scheduler.ts` 不引入 OpenCode 细节，只通过回归测试锁定“`running` 就跳过、`idle` 才 continue”的既有契约。

**Tech Stack:** TypeScript、Node.js 24、Vitest、pnpm workspace、`@opencode-ai/sdk`

---

## 文件结构与职责映射

- Create: `modules/api/src/session-message-state.ts` - 以 OpenCode `session.messages` 返回的 `Array<{ info, parts }>` 为输入，保守判定最后一条 assistant 消息是否已明确完成，并输出 AIM `idle | running`。
- Modify: `modules/api/src/opencode-sdk-adapter.ts` - 把 adapter 接口从 `getSession()` 调整为 `getSessionState()`，内部改为调用 `client.session.messages()` 并委托给消息分类器；`createSession()` / `sendPrompt()` 语义保持不变。
- Modify: `modules/api/src/task-session-coordinator.ts` - 删除原始 `status` / `type` 解析逻辑，只透传 adapter 返回的 `idle | running`，并继续包装 `createSession`、`getSessionState`、`sendContinuePrompt` 的 action-scoped error。
- Modify: `modules/api/src/task-scheduler.ts` - 预期无需行为变更；仅在类型调整迫使 import / type 修正时做最小修改，不新增 OpenCode 细节分支。
- Create: `modules/api/test/session-message-state.test.ts` - 直接覆盖消息分类规则，包括明确完成、无 assistant、assistant 未完成、结构畸形、未知 message shape 等保守回退路径。
- Modify: `modules/api/test/opencode-sdk-adapter.test.ts` - 覆盖 adapter 调用 `session.messages()`、只返回 AIM 两态、API 失败向上抛错、`createSession()` / `sendPrompt()` 不退化。
- Modify: `modules/api/test/task-session-coordinator.test.ts` - 覆盖 coordinator 仅透传 `idle | running`、不再解析原始 payload、错误继续包装为 `Task session coordinator failed during getSessionState`。
- Modify: `modules/api/test/task-session-coordinator-default-adapter.test.ts` - 同步默认 adapter mock 接口，从 `getSession` 更新为 `getSessionState`。
- Modify: `modules/api/test/task-scheduler.test.ts` - 回归锁定 scheduler 只依赖 `idle | running`，并证明 ambiguous message 被 adapter 保守映射为 `running` 时不会重复注入 continue prompt。

## 实施约束

- 只允许 AIM 对外暴露 `idle | running`；不得把 OpenCode 原始 `status`、`type`、message payload 向 coordinator 或 scheduler 泄漏。
- 分类器必须以消息 payload 的显式完成信号判定 `idle`，不得使用自然语言结尾、消息条数、时间差等弱启发式。
- 首版“明确完成”规则固定为：最后一条 assistant 消息同时满足 `info.time.completed` 为有限数值，且存在显式终结信号 `info.finish` 或 `parts` 中至少一个 `step-finish`；否则一律 `running`。
- 若最后一条 assistant 消息含有 `tool` part，则这些 tool 的 `state.status` 必须全部为终态 `completed` 或 `error`；只要仍有 `pending` / `running`，即使存在 `completed` 时间也仍按 `running`。
- `session.messages()` 调用失败属于异常；消息结构未知、缺字段、字段类型错误、缺少完成信号都不是异常，而是保守返回 `running`。
- 不新增 `queued`、`unknown`、`retrying` 等 AIM 新状态，不改 scheduler 的轮询模型、continue prompt 文案或 duplicate session 防护逻辑。

### Task 1: 落地独立的消息状态分类器

**Files:**
- Create: `modules/api/src/session-message-state.ts`
- Create: `modules/api/test/session-message-state.test.ts`

- [ ] **Step 1: 先写分类器失败测试，锁定保守判定规则**

```ts
import { describe, expect, it } from "vitest";

import { classifySessionMessageState } from "../src/session-message-state.js";

const createAssistantRecord = (overrides: Record<string, unknown> = {}) => ({
  info: {
    cost: 0,
    id: "assistant-1",
    mode: "build",
    modelID: "claude-sonnet-4-5",
    parentID: "user-1",
    path: { cwd: "/repo", root: "/repo" },
    providerID: "anthropic",
    role: "assistant",
    sessionID: "session-1",
    time: { created: 1_000, completed: 2_000 },
    tokens: {
      cache: { read: 0, write: 0 },
      input: 0,
      output: 0,
      reasoning: 0,
    },
    finish: "stop",
    ...overrides,
  },
  parts: [
    {
      id: "part-1",
      messageID: "assistant-1",
      sessionID: "session-1",
      type: "step-finish",
      reason: "stop",
      cost: 0,
      tokens: {
        cache: { read: 0, write: 0 },
        input: 0,
        output: 0,
        reasoning: 0,
      },
    },
  ],
});

describe("session message state classifier", () => {
  it("returns idle only when the last assistant message is explicitly complete", () => {
    expect(classifySessionMessageState([createAssistantRecord()])).toBe("idle");
  });

  it("returns running when no assistant message exists", () => {
    expect(
      classifySessionMessageState([
        {
          info: { id: "user-1", role: "user", sessionID: "session-1", time: { created: 1_000 }, agent: "general", model: { modelID: "m", providerID: "p" } },
          parts: [],
        },
      ]),
    ).toBe("running");
  });

  it("returns running when the last assistant message has no completed timestamp", () => {
    expect(
      classifySessionMessageState([
        createAssistantRecord({ time: { created: 1_000 } }),
      ]),
    ).toBe("running");
  });

  it("returns running when the last assistant message lacks finish markers", () => {
    expect(
      classifySessionMessageState([
        createAssistantRecord({ finish: undefined }),
      ]),
    ).toBe("running");
  });

  it("returns running when a tool part is still pending", () => {
    expect(
      classifySessionMessageState([
        {
          ...createAssistantRecord(),
          parts: [
            {
              id: "tool-1",
              callID: "call-1",
              messageID: "assistant-1",
              metadata: {},
              sessionID: "session-1",
              tool: "bash",
              type: "tool",
              state: { status: "running", input: {}, time: { start: 1_500 } },
            },
          ],
        },
      ]),
    ).toBe("running");
  });

  it("returns running for malformed records instead of throwing", () => {
    expect(classifySessionMessageState(null)).toBe("running");
    expect(classifySessionMessageState([{ info: { role: "assistant" }, parts: "bad" }])).toBe("running");
  });
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/session-message-state.test.ts`

Expected: FAIL，提示 `session-message-state.ts` 尚不存在，且分类函数未定义。

- [ ] **Step 2: 用最小实现写出分类器，只识别显式完成信号**

```ts
import type { Part } from "@opencode-ai/sdk";

import type { TaskSessionState } from "./task-session-coordinator.js";

type SessionMessageRecord = {
  info?: {
    finish?: string;
    role?: string;
    time?: { completed?: number };
  };
  parts?: Array<Part | Record<string, unknown>>;
};

const isTerminalToolState = (status: unknown) =>
  status === "completed" || status === "error";

const hasExplicitAssistantCompletion = (record: SessionMessageRecord) => {
  const completed = record.info?.time?.completed;
  const parts = Array.isArray(record.parts) ? record.parts : [];
  const hasStepFinish = parts.some(
    (part) => typeof part === "object" && part !== null && part.type === "step-finish",
  );
  const hasFinish = typeof record.info?.finish === "string" && record.info.finish.length > 0;
  const hasRunningTool = parts.some(
    (part) =>
      typeof part === "object" &&
      part !== null &&
      part.type === "tool" &&
      !isTerminalToolState(part.state?.status),
  );

  return Number.isFinite(completed) && (hasFinish || hasStepFinish) && !hasRunningTool;
};

export const classifySessionMessageState = (records: unknown): TaskSessionState => {
  if (!Array.isArray(records)) {
    return "running";
  }

  const assistantRecords = records.filter(
    (record): record is SessionMessageRecord =>
      typeof record === "object" &&
      record !== null &&
      typeof record.info === "object" &&
      record.info !== null &&
      record.info.role === "assistant",
  );

  const lastAssistantRecord = assistantRecords.at(-1);

  if (!lastAssistantRecord) {
    return "running";
  }

  return hasExplicitAssistantCompletion(lastAssistantRecord) ? "idle" : "running";
};
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/session-message-state.test.ts`

Expected: PASS，全部分类器测试通过，且未知 / 畸形输入全部保守回落到 `running`。

- [ ] **Step 3: 补一条“最后一条 assistant 决定结果”的回归测试，避免误读更早已完成消息**

```ts
it("uses only the last assistant message when earlier assistant output was complete", () => {
  expect(
    classifySessionMessageState([
      createAssistantRecord({ id: "assistant-1", finish: "stop", time: { created: 1_000, completed: 2_000 } }),
      createAssistantRecord({
        id: "assistant-2",
        finish: undefined,
        parentID: "assistant-1",
        time: { created: 3_000 },
      }),
    ]),
  ).toBe("running");
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/session-message-state.test.ts --testNamePattern "last assistant message"`

Expected: 先 FAIL，分类器若只找“任意一个已完成 assistant”会暴露问题；修正后 PASS。

- [ ] **Step 4: 提交 Task 1**

```bash
git add modules/api/src/session-message-state.ts modules/api/test/session-message-state.test.ts
git commit -m "feat: add conservative session message classifier"
```

### Task 2: 让 adapter 直接返回 AIM `idle | running`

**Files:**
- Modify: `modules/api/src/opencode-sdk-adapter.ts`
- Modify: `modules/api/test/opencode-sdk-adapter.test.ts`

- [ ] **Step 1: 先写 adapter 失败测试，锁定消息 API 调用和 AIM-level 返回值**

```ts
it("reads session messages and returns idle for an explicitly completed assistant message", async () => {
  const messages = vi.fn().mockResolvedValue({
    data: [
      {
        info: {
          cost: 0,
          finish: "stop",
          id: "assistant-1",
          mode: "build",
          modelID: "claude-sonnet-4-5",
          parentID: "user-1",
          path: { cwd: "/repo", root: "/repo" },
          providerID: "anthropic",
          role: "assistant",
          sessionID: "session-1",
          time: { created: 1_000, completed: 2_000 },
          tokens: { cache: { read: 0, write: 0 }, input: 0, output: 0, reasoning: 0 },
        },
        parts: [
          {
            id: "part-1",
            messageID: "assistant-1",
            sessionID: "session-1",
            type: "step-finish",
            reason: "stop",
            cost: 0,
            tokens: { cache: { read: 0, write: 0 }, input: 0, output: 0, reasoning: 0 },
          },
        ],
      },
    ],
  });

  mockCreateOpencodeClient.mockReturnValue({
    session: { create: vi.fn(), messages, promptAsync: vi.fn(), status: vi.fn() },
  });

  const { createOpenCodeSdkAdapter } = await import("../src/opencode-sdk-adapter.js");
  const adapter = createOpenCodeSdkAdapter(config);

  await expect(adapter.getSessionState("session-1", "/repo")).resolves.toBe("idle");
  expect(messages).toHaveBeenCalledWith({
    path: { id: "session-1" },
    query: { directory: "/repo", limit: 20 },
    throwOnError: true,
  });
});

it("returns running when message payload is ambiguous instead of exposing raw data", async () => {
  const messages = vi.fn().mockResolvedValue({ data: [{ info: { role: "assistant" }, parts: [] }] });
  mockCreateOpencodeClient.mockReturnValue({
    session: { create: vi.fn(), messages, promptAsync: vi.fn(), status: vi.fn() },
  });

  const { createOpenCodeSdkAdapter } = await import("../src/opencode-sdk-adapter.js");
  const adapter = createOpenCodeSdkAdapter(config);

  await expect(adapter.getSessionState("session-1", "/repo")).resolves.toBe("running");
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/opencode-sdk-adapter.test.ts --testNamePattern "reads session messages|returns running when message payload is ambiguous"`

Expected: FAIL，当前 adapter 仍调用 `session.status()` 且返回原始 payload。

- [ ] **Step 2: 改 adapter 接口与实现，收敛到 `getSessionState()`**

```ts
import { classifySessionMessageState } from "./session-message-state.js";
import type { TaskSessionCoordinatorConfig, TaskSessionState } from "./task-session-coordinator.js";

export type OpenCodeSdkAdapter = {
  createSession(task: Task): Promise<{ id: string }>;
  getSessionState(sessionId: string, projectPath: string): Promise<TaskSessionState>;
  sendPrompt(sessionId: string, prompt: string): Promise<void>;
};

async getSessionState(sessionId, projectPath) {
  const response = await client.session.messages({
    path: { id: sessionId },
    query: { directory: projectPath, limit: 20 },
    throwOnError: true,
  });

  return classifySessionMessageState(response.data);
},
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/opencode-sdk-adapter.test.ts`

Expected: 先看到新加 state 测试 PASS；若旧测试仍断言 `status()` 或 `getSession()`，它们会失败，留到下一步一起收口。

- [ ] **Step 3: 清理旧状态测试并补齐 API failure 回归，确认 `createSession()` / `sendPrompt()` 保持不变**

```ts
it("rethrows SDK message fetch failures", async () => {
  const sdkError = new Error("opencode unavailable");
  const messages = vi.fn().mockRejectedValue(sdkError);

  mockCreateOpencodeClient.mockReturnValue({
    session: { create: vi.fn(), messages, promptAsync: vi.fn(), status: vi.fn() },
  });

  const { createOpenCodeSdkAdapter } = await import("../src/opencode-sdk-adapter.js");
  const adapter = createOpenCodeSdkAdapter(config);

  await expect(adapter.getSessionState("session-1", "/repo")).rejects.toBe(sdkError);
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/opencode-sdk-adapter.test.ts`

Expected: PASS，adapter 测试只验证 AIM-level 返回值与消息 API 调用，`createSession()` / `sendPrompt()` 既有断言继续通过。

- [ ] **Step 4: 提交 Task 2**

```bash
git add modules/api/src/opencode-sdk-adapter.ts modules/api/test/opencode-sdk-adapter.test.ts
git commit -m "refactor: derive session state from messages"
```

### Task 3: 精简 coordinator 为动作级包装层

**Files:**
- Modify: `modules/api/src/task-session-coordinator.ts`
- Modify: `modules/api/test/task-session-coordinator.test.ts`
- Modify: `modules/api/test/task-session-coordinator-default-adapter.test.ts`

- [ ] **Step 1: 先写 coordinator 失败测试，锁定“只透传两态、不解析原始 payload”**

```ts
it("passes through adapter idle without inspecting raw status fields", async () => {
  const coordinator = createTaskSessionCoordinator(config, {
    createSession: vi.fn(),
    getSessionState: vi.fn().mockResolvedValue("idle"),
    sendPrompt: vi.fn(),
  });

  await expect(coordinator.getSessionState("session-1", "/repo")).resolves.toBe("idle");
});

it("passes through adapter running without parsing OpenCode payload", async () => {
  const coordinator = createTaskSessionCoordinator(config, {
    createSession: vi.fn(),
    getSessionState: vi.fn().mockResolvedValue("running"),
    sendPrompt: vi.fn(),
  });

  await expect(coordinator.getSessionState("session-1", "/repo")).resolves.toBe("running");
});

it("wraps adapter getSessionState failures with coordinator context", async () => {
  const adapterError = new Error("adapter blew up");
  const coordinator = createTaskSessionCoordinator(config, {
    createSession: vi.fn(),
    getSessionState: vi.fn().mockRejectedValue(adapterError),
    sendPrompt: vi.fn(),
  });

  await expect(coordinator.getSessionState("session-1", "/repo")).rejects.toMatchObject({
    cause: adapterError,
    message: "Task session coordinator failed during getSessionState",
  });
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-session-coordinator.test.ts --testNamePattern "passes through adapter|wraps adapter getSessionState failures"`

Expected: FAIL，当前测试夹具和实现仍基于 `getSession()` + 原始 `status` / `type` 解析。

- [ ] **Step 2: 删除 coordinator 内部状态映射，只保留 action wrapper**

```ts
type TaskSessionCoordinatorAdapter = {
  createSession(task: Task): Promise<TaskSessionRecord>;
  getSessionState(sessionId: string, projectPath: string): Promise<TaskSessionState>;
  sendPrompt(sessionId: string, prompt: string): Promise<unknown>;
};

async getSessionState(sessionId, projectPath) {
  try {
    return await adapter.getSessionState(sessionId, projectPath);
  } catch (error) {
    throw actionError("getSessionState", error);
  }
},
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-session-coordinator.test.ts`

Expected: 新透传测试 PASS；旧的“missing remote session entry is idle”“maps remote retry sessions”之类 raw-payload 测试 FAIL，提示还需要清理旧断言。

- [ ] **Step 3: 更新默认 adapter 测试与旧断言，确认默认注入链路同步改名**

```ts
mockCreateOpenCodeSdkAdapter.mockReturnValue({
  createSession,
  getSessionState: vi.fn().mockResolvedValue("running"),
  sendPrompt: vi.fn(),
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-session-coordinator.test.ts modules/api/test/task-session-coordinator-default-adapter.test.ts`

Expected: PASS，coordinator 测试只剩 action-scoped wrapper 与透传语义；默认 adapter 测试也改为新接口名。

- [ ] **Step 4: 提交 Task 3**

```bash
git add modules/api/src/task-session-coordinator.ts modules/api/test/task-session-coordinator.test.ts modules/api/test/task-session-coordinator-default-adapter.test.ts
git commit -m "refactor: simplify coordinator session state passthrough"
```

### Task 4: 用回归测试锁定 scheduler 仍只依赖 `idle | running`

**Files:**
- Modify: `modules/api/test/task-scheduler.test.ts`
- Modify: `modules/api/src/task-scheduler.ts`（仅当类型修正必需时）

- [ ] **Step 1: 先补“保守 running 不会重复 prompt”测试，覆盖 ambiguous state 场景**

```ts
it("does not send continue prompts across rounds while session state stays running", async () => {
  const task = createTask({ session_id: "session-1" });
  const coordinator = createCoordinator();
  coordinator.getSessionState.mockResolvedValue("running");
  const scheduler = createTaskScheduler({
    coordinator,
    taskRepository: {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
    },
  });

  await scheduler.runRound();
  await scheduler.runRound();

  expect(coordinator.getSessionState).toHaveBeenCalledTimes(2);
  expect(coordinator.sendContinuePrompt).not.toHaveBeenCalled();
});

it("sends only one continue prompt after state changes from running to idle", async () => {
  const task = createTask({ session_id: "session-1" });
  const coordinator = createCoordinator();
  coordinator.getSessionState
    .mockResolvedValueOnce("running")
    .mockResolvedValueOnce("idle");
  const scheduler = createTaskScheduler({
    coordinator,
    taskRepository: {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
    },
  });

  await scheduler.runRound();
  await scheduler.runRound();

  expect(coordinator.sendContinuePrompt).toHaveBeenCalledTimes(1);
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-scheduler.test.ts --testNamePattern "across rounds while session state stays running|state changes from running to idle"`

Expected: PASS；如果失败，只允许做最小修正，不得把 message 细节拉进 scheduler。

- [ ] **Step 2: 补一条 duplicate session 回归，证明本次状态改造不影响现有跳过逻辑**

```ts
it("still skips duplicate session ids before any state lookup", async () => {
  const firstTask = createTask({ task_id: "task-1", session_id: "shared-session" });
  const secondTask = createTask({ task_id: "task-2", session_id: "shared-session" });
  const coordinator = createCoordinator();
  const logger = { error: vi.fn(), warn: vi.fn() };
  const scheduler = createTaskScheduler({
    coordinator,
    logger,
    taskRepository: {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([firstTask, secondTask]),
    },
  });

  await scheduler.runRound();

  expect(coordinator.getSessionState).not.toHaveBeenCalled();
  expect(coordinator.sendContinuePrompt).not.toHaveBeenCalled();
});
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-scheduler.test.ts --testNamePattern "still skips duplicate session ids before any state lookup"`

Expected: PASS，duplicate 防护仍先于任何状态查询生效。

- [ ] **Step 3: 跑完整 scheduler 测试文件，只有在类型变更迫使编译失败时才修改 `task-scheduler.ts`**

```ts
// 预期无需行为改动；若 TypeScript 需要显式收窄，仅保留现有两态判断。
if (sessionState !== "idle") {
  return;
}
```

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/task-scheduler.test.ts`

Expected: PASS，scheduler 继续只依赖 `idle | running`，不会因为 ambiguous state 被保守映射为 `running` 而重复 prompt。

- [ ] **Step 4: 提交 Task 4**

```bash
git add modules/api/test/task-scheduler.test.ts modules/api/src/task-scheduler.ts
git commit -m "test: lock scheduler state regressions"
```

### Task 5: 完整验证与收口

**Files:**
- Modify: `modules/api/src/session-message-state.ts`
- Modify: `modules/api/src/opencode-sdk-adapter.ts`
- Modify: `modules/api/src/task-session-coordinator.ts`
- Modify: `modules/api/test/session-message-state.test.ts`
- Modify: `modules/api/test/opencode-sdk-adapter.test.ts`
- Modify: `modules/api/test/task-session-coordinator.test.ts`
- Modify: `modules/api/test/task-session-coordinator-default-adapter.test.ts`
- Modify: `modules/api/test/task-scheduler.test.ts`

- [ ] **Step 1: 跑聚焦验证，快速确认三层边界都成立**

Run: `pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/session-message-state.test.ts modules/api/test/opencode-sdk-adapter.test.ts modules/api/test/task-session-coordinator.test.ts modules/api/test/task-session-coordinator-default-adapter.test.ts modules/api/test/task-scheduler.test.ts`

Expected: PASS，五个测试文件全部通过；输出包含新增 classifier、adapter、coordinator、scheduler 回归场景。

- [ ] **Step 2: 跑 `@aim-ai/api` 包级验证，确认 typecheck / lint / build / api tests 全绿**

Run: `pnpm --filter @aim-ai/api test`

Expected: PASS；顺序完成 `typecheck`、`biome check`、`@aim-ai/contract build`、`@aim-ai/api build`、`vitest --project api`，最终退出码为 `0`。

- [ ] **Step 3: 如包级验证失败，只按失败点做最小修正并重跑对应命令**

```ts
// 允许的收口类型：
// 1. 类型导入 / 导出修正
// 2. 测试夹具与新接口对齐
// 3. 分类器对 unknown 输入的守卫补强
// 禁止借机增加新状态、新调度分支或复杂启发式
```

Run: `pnpm --filter @aim-ai/api test`

Expected: PASS，所有收口修正都局限于本 spec 范围内。

- [ ] **Step 4: 提交 Task 5**

```bash
git add modules/api/src/session-message-state.ts modules/api/src/opencode-sdk-adapter.ts modules/api/src/task-session-coordinator.ts modules/api/src/task-scheduler.ts modules/api/test/session-message-state.test.ts modules/api/test/opencode-sdk-adapter.test.ts modules/api/test/task-session-coordinator.test.ts modules/api/test/task-session-coordinator-default-adapter.test.ts modules/api/test/task-scheduler.test.ts
git commit -m "fix: derive scheduler session idleness from messages"
```

## 自检结果

- [x] **Spec coverage:** adapter 接口收敛、消息分类器、coordinator 简化、scheduler 回归保护、adapter/coordinator/scheduler 测试、验证命令都已有对应 Task。
- [x] **Placeholder scan:** 全文未使用 `TODO`、`TBD`、`implement later`、`类似 Task N` 之类占位表述；每个代码变更步骤都给出具体代码或命令。
- [x] **Consistency:** 对外接口统一使用 `getSessionState()` 与 `idle | running`；分类器名称统一为 `classifySessionMessageState()`；scheduler 全文未引入任何 OpenCode 原始 payload 字段。
