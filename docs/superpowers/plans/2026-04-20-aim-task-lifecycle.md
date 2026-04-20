# AIM Task Lifecycle Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `@aim-ai/opencode-plugin` 中新增 `aim-task-lifecycle` packaged skill，并同步更新包内文档与发布验证，使技能文档完整覆盖 AIM Task 生命周期事实回报规则。

**Architecture:** 本次实现仍然保持 `modules/opencode-plugin` 的“静态 packaged skill + 文档 + 包装验证”边界，不新增运行时 plugin hook、bootstrap prompt 或其他 AIM workflow 自动化。实现以 TDD 方式推进：先扩展包级测试锁定新 skill 的存在、README 描述和 tarball 分发内容，再补齐 `SKILL.md` 与 README 文案，最后运行最小必要验证，确认发布产物和文档规则与 spec 一致。

**Tech Stack:** Markdown、TypeScript、Vitest、Node.js `fs/url/child_process` API、pnpm pack

---

## 文件结构与职责映射

**新增文件**
- `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`：新增 packaged skill 正文，定义适用场景、必需输入、默认环境、生命周期状态、必报时点、PATCH 请求格式、规则与失败处理。

**修改文件**
- `modules/opencode-plugin/skills/README.md`：把 `skills/` 目录描述从“仅 placeholder”更新为“已包含真实 AIM reporting skill 与 placeholder”，并强调仍然只是 packaged skill 边界，不引入运行时自动化。
- `modules/opencode-plugin/README.md`：更新包级 README，说明插件当前分发的 skills 中已包含 `aim-task-lifecycle`，但插件本身仍只负责分发静态资源与 skills path 注册。
- `modules/opencode-plugin/test/opencode-plugin.test.ts`：先写失败测试，再锁定新 skill 文件存在、`pnpm pack` 产物包含新 skill、README 文案不违背 spec 的包边界定位。

**预期不修改文件**
- `modules/opencode-plugin/package.json`：现有 `files` 已包含整个 `skills/` 目录，新增 skill 文件不需要再改发布白名单。
- `modules/opencode-plugin/src/index.ts`、`modules/opencode-plugin/tsdown.config.ts`：本 spec 明确不引入新的运行时 plugin 行为，因此不应修改。
- 任何 server / API / contract / schema 文件：本次仅新增 packaged skill 文档与验证，不扩展到运行时上报实现。

**只读参考文件**
- `docs/superpowers/specs/2026-04-20-aim-task-lifecycle-design.md`：唯一 scope 来源；实现和测试断言不得超出该设计。
- `modules/opencode-plugin/skills/aim-placeholder/SKILL.md`：frontmatter 与 packaged skill 最小结构参考。

## 实施约束

- `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md` 必须是文档型 skill，不得伪装成自动执行器或声称会替代仓库 AGENTS 中的 worktree / PR / merge 规则。
- skill 正文必须显式声明默认 `SERVER_BASE_URL=http://localhost:8192`，且唯一上报通道是 `PATCH ${SERVER_BASE_URL}/tasks/${task_id}` 更新既有 Task。
- skill 正文必须覆盖 `status`、`done`、`worktree_path`、`pull_request_url` 四个字段，并明确未知字段省略、不得写空字符串占位。
- skill 正文必须覆盖以下状态及转换边界：`created`、`waiting_assumptions`、`running`、`outbound`、`pr_following`、`closing`、`succeeded`、`failed`。
- skill 正文必须覆盖七个必报时点：开始执行、worktree 创建后、PR 创建后、PR follow-up、closing、成功、失败；并额外说明 `waiting_assumptions` 的阻塞上报语义。
- skill 正文必须区分 task failure 与 reporting failure；最多总尝试 3 次，建议短退避 1 秒 / 5 秒；重试耗尽后必须显式暴露 blocker，不能伪造成 `failed` 终态。
- `modules/opencode-plugin/README.md` 与 `modules/opencode-plugin/skills/README.md` 的更新只能表达 packaged docs/discovery 边界，不得引入“插件会自动向 AIM 回报任务状态”之类的运行时承诺。
- 测试与验证仅检查文档覆盖度、包分发内容和 README 定位；不要扩展到 HTTP 集成测试、SDK 封装或新的构建脚本。

### Task 1: 先用包级测试锁定新 skill 分发与 README 边界

**Files:**
- Modify: `modules/opencode-plugin/test/opencode-plugin.test.ts`
- Modify: `modules/opencode-plugin/skills/README.md`
- Modify: `modules/opencode-plugin/README.md`
- Create: `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`

- [ ] **Step 1: 先给包级测试加失败断言，锁定新 skill 文件、tarball 与 README 文案目标**

在 `modules/opencode-plugin/test/opencode-plugin.test.ts` 先扩展常量和断言。把文件顶部常量补成：

```ts
const pluginLifecycleSkillUrl = new URL(
  "../skills/aim-task-lifecycle/SKILL.md",
  import.meta.url,
);
const pluginSkillsReadmeUrl = new URL("../skills/README.md", import.meta.url);
const pluginReadmeUrl = new URL("../README.md", import.meta.url);

let pluginSkillsReadme: string;
let pluginReadme: string;

beforeAll(async () => {
  pluginPackage = JSON.parse(
    await readFile(pluginPackageUrl, "utf8"),
  ) as PluginPackageManifest;
  pluginSource = await readFile(pluginSourceUrl, "utf8");
  pluginSkillsReadme = await readFile(pluginSkillsReadmeUrl, "utf8");
  pluginReadme = await readFile(pluginReadmeUrl, "utf8");
  pluginModule = (await import(
    pathToFileURL(fileURLToPath(pluginEntryUrl)).href
  )) as { default: { id?: string; server: unknown } };
});
```

然后新增三个测试：

```ts
it("ships the aim-task-lifecycle skill resource", async () => {
  await expect(access(pluginLifecycleSkillUrl)).resolves.toBeUndefined();
});

it("packs the lifecycle skill into the publishable tarball", async () => {
  await expect(listPackedFiles()).resolves.toContain(
    "package/skills/aim-task-lifecycle/SKILL.md",
  );
});

it("documents lifecycle reporting as packaged documentation only", () => {
  expect(pluginSkillsReadme).toContain("aim-task-lifecycle");
  expect(pluginSkillsReadme).toContain("reporting");
  expect(pluginReadme).toContain("aim-task-lifecycle");
  expect(pluginReadme).toContain("static");
  expect(pluginReadme).not.toContain("auto-report");
  expect(pluginReadme).not.toContain("automatic AIM sync");
});
```

同时把现有 tarball 全量断言数组改为包含新条目：

```ts
expect(await listPackedFiles()).toEqual([
  "package/LICENSE",
  "package/README.md",
  "package/agents/README.md",
  "package/agents/aim-placeholder.md",
  "package/dist/index.d.ts",
  "package/dist/index.d.ts.map",
  "package/dist/index.js",
  "package/dist/index.js.map",
  "package/package.json",
  "package/skills/README.md",
  "package/skills/aim-placeholder/SKILL.md",
  "package/skills/aim-task-lifecycle/SKILL.md",
]);
```

- [ ] **Step 2: 运行定向测试，确认这些新断言在实现前先失败**

Run: `pnpm --filter @aim-ai/opencode-plugin exec vitest run --config ../../vitest.workspace.ts --project opencode-plugin`

Expected: FAIL，至少应报出 `skills/aim-task-lifecycle/SKILL.md` 不存在，或 tarball 内容缺少 `package/skills/aim-task-lifecycle/SKILL.md`，以及 README 文案尚未包含新 skill。

- [ ] **Step 3: 提交测试基线提交，单独记录“先写失败测试”**

```bash
git add modules/opencode-plugin/test/opencode-plugin.test.ts
git commit -m "test: cover aim task lifecycle skill packaging"
```

### Task 2: 编写 `aim-task-lifecycle` skill 正文并同步包内 README

**Files:**
- Create: `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`
- Modify: `modules/opencode-plugin/skills/README.md`
- Modify: `modules/opencode-plugin/README.md`

- [ ] **Step 1: 创建 skill 文件，完整落下 frontmatter 和文档骨架**

新建 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`，先写成下面这个完整骨架，章节名必须与 spec 的“技能文档结构要求”对齐：

```md
---
name: aim-task-lifecycle
description: Report AIM task lifecycle facts to the existing Task record via PATCH.
---

## When to use

Use this skill when the current work maps to an existing AIM Task and the agent must keep AIM updated with lifecycle facts as they happen.

Do not use this skill to create tasks, replace repository AGENTS rules, or automate worktree / PR decisions.

## Required inputs

- `task_id` for the existing AIM Task record. If it is missing, stop and expose the missing input instead of sending a request.
- A current fact snapshot with the lifecycle status and any known `worktree_path` / `pull_request_url` values.

## Environment

- `SERVER_BASE_URL` defaults to `http://localhost:8192`.
- The only reporting target in v1 is `PATCH ${SERVER_BASE_URL}/tasks/${task_id}`.

## Lifecycle statuses

### Status meanings

- `created`: the Task already exists, but execution has not started.
- `waiting_assumptions`: execution is blocked on missing assumptions or user input; `done` must stay `false`.
- `running`: work has started, but the task has not reached the PR outbound stage yet.
- `outbound`: a PR exists and `pull_request_url` is known.
- `pr_following`: the agent is following PR checks, reviews, mergeability, or auto-merge state.
- `closing`: the task is in cleanup or final closing actions.
- `succeeded`: the task finished successfully and must be reported with `done = true`.
- `failed`: the task ended in a failure terminal state and must be reported with `done = true`.

### Allowed transitions

- `created -> running`
- `created -> waiting_assumptions`
- `waiting_assumptions -> running`
- `running -> outbound`
- `running -> failed`
- `outbound -> pr_following`
- `outbound -> closing`
- `outbound -> failed`
- `pr_following -> pr_following`
- `pr_following -> closing`
- `pr_following -> failed`
- `closing -> succeeded`
- `closing -> failed`

### `done` rules

- `done` must be `false` for `created`, `waiting_assumptions`, `running`, `outbound`, `pr_following`, and `closing`.
- `done` must be `true` only for `succeeded` and `failed`.
- Never report `done = true` with a non-terminal status.
- After a successful terminal write, do not move back to a non-terminal status.

## Required reporting moments

1. Start of execution: report `running` with `done = false`.
2. After worktree creation: report the known `worktree_path` while staying in `running`.
3. After PR creation: report `outbound`, `done = false`, and `pull_request_url`.
4. During PR follow-up: report `pr_following`, `done = false`, and preserve known `pull_request_url` / `worktree_path`.
5. During closing: report `closing`, `done = false`, and preserve all known facts.
6. On success: report `succeeded`, `done = true`, and preserve all known facts.
7. On failure: report `failed`, `done = true`, and preserve all known facts.

Also report `waiting_assumptions` immediately when the task is blocked on missing assumptions or input.

## API call format

Every PATCH must include `status` and `done`. Add `worktree_path` and `pull_request_url` only when they are already known.

Unknown is not an empty string. Omit unknown fields instead of sending `""` or fabricated `null` placeholders.

### Running example

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "running",
    "done": false
  }'
```

### Outbound example

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "outbound",
    "done": false,
    "worktree_path": "/repo/.worktrees/task-123",
    "pull_request_url": "https://github.com/org/repo/pull/123"
  }'
```

### Terminal success example

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "succeeded",
    "done": true,
    "worktree_path": "/repo/.worktrees/task-123",
    "pull_request_url": "https://github.com/org/repo/pull/123"
  }'
```

## Rules

- Use PATCH only to update an existing Task.
- Keep `status` and `done` aligned with the lifecycle rules above.
- Continue carrying known `worktree_path` and `pull_request_url` in later reports when they are still true.
- Do not claim AIM has the latest fact unless the PATCH actually succeeded.
- This skill is a reporting discipline, not an execution orchestrator.

## Failure handling

Separate task failure from reporting failure.

- Task failure: the work itself has failed, so report `status = failed` and `done = true`.
- Reporting failure: the PATCH request failed due to network, timeout, connection, 5xx, or unexpected response problems. Do not convert this into a task failure.

Use at most three attempts total for one reporting moment: the initial request plus up to two retries. A short retry pattern such as 1 second then 5 seconds is acceptable. If the server returns a clear 4xx input error, stop retrying and expose the input problem.

If all retries fail, explicitly surface the reporting blocker with the task id, target URL, reporting moment, and the final error summary. State that the business fact happened but AIM was not successfully updated.
```

- [ ] **Step 2: 补全 skill 文案中的 spec 细节，避免骨架版遗漏硬约束**

在上面的完整骨架基础上，把以下细节直接写进正文对应章节，而不是只写在注释里：

```md
- In `Required inputs`, add that the current fact snapshot must at least include the current lifecycle status plus any known `worktree_path` / `pull_request_url` values.
- In `Lifecycle statuses`, explicitly note that `pr_following -> pr_following` is valid for repeated follow-up reports.
- In `Lifecycle statuses`, explicitly say that `running -> closing` is not a standard v1 path and should not be documented as a normal transition.
- In `Required reporting moments`, say that reporting must happen during the lifecycle and must not be deferred until only the final terminal state.
- In `API call format`, say that the first version does not require field-clearing behavior.
- In `Failure handling`, explicitly say that after retry exhaustion the agent must not claim the phase was synced and must expose an AIM reporting blocker.
```

完成后，人工检查一遍整篇 `SKILL.md`，确保没有 `TODO`、`TBD`、`xxx`、占位链接、未定义术语，且没有任何一句话暗示“插件会自动发 HTTP 请求”。

- [ ] **Step 3: 更新 `modules/opencode-plugin/skills/README.md`，说明 skills 目录现在包含真实 reporting skill**

把 `modules/opencode-plugin/skills/README.md` 改成下面的完整内容：

```md
# Skills Boundary

This directory is packaged with `@aim-ai/opencode-plugin`.

The package ships static skill documentation only:

- `aim-placeholder`: packaging placeholder for discovery boundaries.
- `aim-task-lifecycle`: AIM task lifecycle reporting guidance for updating an existing Task via HTTP PATCH.

These files define packaging and discovery boundaries only. The plugin does not auto-run workflow automation or background AIM reporting.
```

- [ ] **Step 4: 更新 `modules/opencode-plugin/README.md`，让包级 README 与 spec 范围一致**

把 `modules/opencode-plugin/README.md` 的 scope 段落更新为下列完整文案，保留现有 usage 示例：

```md
# `@aim-ai/opencode-plugin`

`@aim-ai/opencode-plugin` is the v1 OpenCode-specific plugin skeleton for AIM.

## Scope

- Registers the packaged `skills/` directory into OpenCode config.
- Ships static `skills/` and `agents/` resources, including the `aim-task-lifecycle` packaged skill document.
- Does not inject bootstrap prompts, session context, workflow automation, or runtime AIM reporting behavior.

## Usage

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@aim-ai/opencode-plugin"]
}
```
```

- [ ] **Step 5: 运行测试，确认 skill 文档、README 与 tarball 分发全部通过**

Run: `pnpm --filter @aim-ai/opencode-plugin test`

Expected: PASS。`vitest` 应通过新加的 skill 文件存在性、README 文案和 tarball 内容断言；构建与 lint 不应要求修改 plugin runtime 代码。

- [ ] **Step 6: 提交实现提交，单独记录文档与测试已落地**

```bash
git add modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md modules/opencode-plugin/skills/README.md modules/opencode-plugin/README.md modules/opencode-plugin/test/opencode-plugin.test.ts
git commit -m "feat: add aim task lifecycle packaged skill"
```

### Task 3: 做 spec 对照检查与最小发布验证，防止文档和测试各说各话

**Files:**
- Modify: `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`
- Modify: `modules/opencode-plugin/test/opencode-plugin.test.ts`
- Modify: `modules/opencode-plugin/skills/README.md`
- Modify: `modules/opencode-plugin/README.md`

- [ ] **Step 1: 逐项对照 spec，人工核对 skill 文档是否覆盖全部验收点**

按下面清单逐项检查 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`，如有缺口立刻直接补文档，不要留 follow-up 备注：

```text
1. 默认 SERVER_BASE_URL 是否写成 http://localhost:8192。
2. 是否明确唯一上报方式是 PATCH /tasks/{task_id} 更新既有 Task。
3. 是否显式覆盖 status、done、worktree_path、pull_request_url。
4. 是否写明 done=true 仅允许配合 succeeded/failed。
5. 是否写明 created、waiting_assumptions、running、outbound、pr_following、closing、succeeded、failed 的含义。
6. 是否写明允许的状态转换，并包含 pr_following -> pr_following。
7. 是否覆盖七个必报时点和 waiting_assumptions 的阻塞上报语义。
8. 是否区分 task failure 与 reporting failure，并写出最多 3 次尝试和显式暴露 blocker。
9. 是否至少包含 running、outbound、terminal example 三个 curl 示例。
10. 是否没有 TODO/TBD/xxx/占位链接/未定义术语。
```

- [ ] **Step 2: 用内容断言补强测试，避免 README 或 skill 文案未来回归到错误语义**

如果 Task 1 / Task 2 的测试还只检查文件存在与 tarball 条目，再补一组内容断言到 `modules/opencode-plugin/test/opencode-plugin.test.ts`：

```ts
const pluginLifecycleSkillText = await readFile(pluginLifecycleSkillUrl, "utf8");

expect(pluginLifecycleSkillText).toContain("http://localhost:8192");
expect(pluginLifecycleSkillText).toContain("PATCH ${SERVER_BASE_URL}/tasks/${task_id}");
expect(pluginLifecycleSkillText).toContain("waiting_assumptions");
expect(pluginLifecycleSkillText).toContain("pr_following");
expect(pluginLifecycleSkillText).toContain("\"status\": \"outbound\"");
expect(pluginLifecycleSkillText).toContain("\"status\": \"succeeded\"");
expect(pluginLifecycleSkillText).toContain("done = true");
expect(pluginLifecycleSkillText).toContain("reporting blocker");
expect(pluginLifecycleSkillText).not.toContain("TODO");
expect(pluginLifecycleSkillText).not.toContain("TBD");
```

建议把它放进一个单独测试：

```ts
it("documents lifecycle reporting rules and failure split", async () => {
  const pluginLifecycleSkillText = await readFile(pluginLifecycleSkillUrl, "utf8");

  expect(pluginLifecycleSkillText).toContain("http://localhost:8192");
  expect(pluginLifecycleSkillText).toContain("PATCH ${SERVER_BASE_URL}/tasks/${task_id}");
  expect(pluginLifecycleSkillText).toContain("waiting_assumptions");
  expect(pluginLifecycleSkillText).toContain("pr_following");
  expect(pluginLifecycleSkillText).toContain("\"status\": \"outbound\"");
  expect(pluginLifecycleSkillText).toContain("\"status\": \"succeeded\"");
  expect(pluginLifecycleSkillText).toContain("done = true");
  expect(pluginLifecycleSkillText).toContain("reporting blocker");
  expect(pluginLifecycleSkillText).not.toContain("TODO");
  expect(pluginLifecycleSkillText).not.toContain("TBD");
});
```

- [ ] **Step 3: 重新运行最小必要验证，确认最终发布边界仍成立**

Run: `pnpm --filter @aim-ai/opencode-plugin test && pnpm --filter @aim-ai/opencode-plugin exec pnpm pack --pack-destination .artifacts/final-pack-check`

Expected: PASS。测试通过，且生成的 tarball 中仍包含 `package/skills/aim-task-lifecycle/SKILL.md`，同时没有额外 runtime 文件变更需求。

- [ ] **Step 4: 提交最终自检修正提交，只在确有修正时执行**

```bash
git add modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md modules/opencode-plugin/test/opencode-plugin.test.ts modules/opencode-plugin/skills/README.md modules/opencode-plugin/README.md
git commit -m "test: lock aim task lifecycle skill docs"
```

## 自检结论

- Spec coverage: 计划已覆盖 skill 新增、README 集成、包分发验证、文档规则验证和失败分流检查，对应 spec 的目标、验收标准与最小验证要求。
- Placeholder scan: 本计划正文没有 `TODO`、`TBD`、`implement later`、`similar to task` 之类占位语句；每个修改步骤都给了具体文件、文本或命令。
- Consistency: 所有任务统一使用 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`、`status` / `done` / `worktree_path` / `pull_request_url`、`SERVER_BASE_URL` 和 `PATCH ${SERVER_BASE_URL}/tasks/${task_id}` 这些命名，没有引入额外 runtime 组件或未定义接口。
