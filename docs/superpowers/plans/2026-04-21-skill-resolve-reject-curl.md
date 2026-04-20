# AIM Task Lifecycle Resolve/Reject Curl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以最小文档改写澄清 `aim-task-lifecycle` skill 中“非终态生命周期更新”与“终态结果上报”的边界，确保 `PATCH /tasks/${task_id}` 只用于非终态，而 `POST /resolve` / `POST /reject` 只用于终态结果。

**Architecture:** 本次只修改 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`，保持现有文档结构不重排，只对环境说明、必报时点、API 调用格式、示例标题与规则段做定向措辞收敛。验证以静态校对为主：先完成文案统一，再用精确搜索和人工通读确认全文没有把 resolve/reject 混写成普通 PATCH 状态更新。

**Tech Stack:** Markdown、ripgrep、git

---

## 文件结构与职责映射

**修改文件**
- `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`：统一术语，明确非终态只走 `PATCH /tasks/${task_id}`，终态只走 `POST /tasks/${task_id}/resolve` 与 `POST /tasks/${task_id}/reject`，并同步修正文中示例标题、规则与说明语境。

**预期不修改文件**
- `modules/opencode-plugin/skills/README.md`：本 spec 只要求迁移 `aim-task-lifecycle` 技能文案，不扩展到 skills 索引说明。
- `modules/opencode-plugin/README.md`：本次不改变 packaged skill 边界描述。
- 任何 `modules/api/**`、`modules/contract/**`、`modules/web/**` 文件：spec 明确排除接口、模型与实现代码改动。

**只读参考文件**
- `docs/superpowers/specs/2026-04-21-skill-resolve-reject-curl-design.md`：唯一 scope 来源，所有文案调整都必须落在该 spec 的最小迁移范围内。

## 实施约束

- 只做术语澄清和示例迁移，不重写整份 skill 结构，不新增生命周期设计，不改任何 API/代码实现。
- `PATCH /tasks/${task_id}` 的文案只能落在非终态语境，不能再把成功/失败终态描述成“普通状态更新”的延伸。
- `POST /tasks/${task_id}/resolve` 与 `POST /tasks/${task_id}/reject` 必须被明确称为“终态结果上报”，并保持请求体中的非空 `result` 语义。
- 规则段、示例标题、环境说明、必报时点、API 调用格式必须使用同一套术语；同一概念不能前后混用“状态更新”和“结果上报”。
- 保持当前文档里的其他生命周期纪律不变，避免超出 spec 做额外措辞漂移。

### Task 1: 定向收敛终态 curl 指引文案

**Files:**
- Modify: `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`
- Test: `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`

- [ ] **Step 1: 按 spec 列出需要改字的现有段落，限定最小改动面**

通读 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`，只锁定以下段落准备修改：

- `## 环境`
- `## 必须上报的时点`
- `## API 调用格式`
- 所有 curl 示例标题与示例正文
- `## 规则`

本步骤完成标准：确认不会重排章节，也不会改动上述范围外与本 spec 无关的生命周期纪律。

- [ ] **Step 2: 把非终态 PATCH 与终态 POST 的术语边界一次性写清楚**

只改 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`，按下面口径定向收敛文案：

- `PATCH ${SERVER_BASE_URL}/tasks/${task_id}` 明确写成“非终态生命周期更新”或等价明确表述，不再泛称所有状态更新。
- `POST ${SERVER_BASE_URL}/tasks/${task_id}/resolve` 与 `POST ${SERVER_BASE_URL}/tasks/${task_id}/reject` 明确写成“终态结果上报”。
- 成功/失败时点只描述通过 `resolve` / `reject` 上报终态结果，不再描述为继续 PATCH 一个最终状态。
- 如果段落里出现“状态更新”或近义词，必须让上下文能明确指向非终态；若会与终态混淆，就直接改成“非终态更新”或“终态结果上报”。

本步骤完成后，文档中应该保留下面这种边界：

```md
- 非终态生命周期更新使用 `PATCH ${SERVER_BASE_URL}/tasks/${task_id}`。
- 成功终态上报使用 `POST ${SERVER_BASE_URL}/tasks/${task_id}/resolve`。
- 失败终态上报使用 `POST ${SERVER_BASE_URL}/tasks/${task_id}/reject`。
```

- [ ] **Step 3: 同步修正示例标题与规则段，避免文档内部术语打架**

继续只改同一文件，确保示例和规则与 Step 2 使用同一套术语：

- 非终态示例继续保留 `PATCH` 示例，例如 `Running 示例`、`Outbound 示例`。
- 终态示例标题明确指向终态结果，例如 `终态成功示例` 与 `Terminal failure example`，正文分别展示 `POST /resolve`、`POST /reject` 与非空 `result`。
- `## 规则` 中明确写出“只能使用 PATCH 更新非终态事实”“只能使用 POST /resolve 或 POST /reject 上报终态结果”，避免出现把 resolve/reject 归类为普通状态更新的总结性语句。

至少保留如下规则边界：

```md
- 只能使用 PATCH 来更新已存在 Task 的非终态事实。
- 只能使用 `POST /resolve` 上报 `succeeded` 终态，且只能使用 `POST /reject` 上报 `failed` 终态。
- 终态上报的请求体必须且只能包含一个非空 `result` 字符串字段。
```

- [ ] **Step 4: 运行最小静态校对，确认全文没有残留混淆表达**

Run: `rg -n 'PATCH \$\{SERVER_BASE_URL\}/tasks/\$\{task_id\}|POST \$\{SERVER_BASE_URL\}/tasks/\$\{task_id\}/(resolve|reject)|状态更新|结果上报' modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`

Expected: 输出同时包含非终态 `PATCH` 与终态 `POST /resolve`、`POST /reject` 的行；凡是“状态更新”表述都处在非终态语境，终态相关行使用“终态结果上报”或等价明确表述。

再运行：`git diff --check -- modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`

Expected: PASS，无空白错误。

- [ ] **Step 5: 手工对照 spec 做一次终稿复核**

按下面清单通读 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`：

- `PATCH /tasks/${task_id}` 是否只出现在非终态语境。
- `resolve` / `reject` 是否只被描述为终态结果上报。
- 环境说明、必报时点、API 调用格式、示例标题、规则段是否全部一致。
- 是否仍保持“最小必要改字”，没有顺手扩展到新流程、新状态或新接口说明。

本步骤完成标准：以上四项全部能明确回答“是”。若有一项不能明确满足，继续在同一文件内修正后再复核。

- [ ] **Step 6: 提交文档迁移改动**

```bash
git add modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md
git commit -m "docs: clarify task lifecycle terminal reporting"
```

## 交付说明

- 本计划只允许由 Sub Agent 在当前 worktree 中执行，禁止切回主工作区做 inline 实现。
- 实施完成后，如需继续出站，后续 Sub Agent 必须继续遵守仓库 `AGENTS.md` 中关于 `git fetch origin`、`git rebase origin/main`、push、PR、auto-merge、follow-up 与收尾清理的完整闭环要求。
