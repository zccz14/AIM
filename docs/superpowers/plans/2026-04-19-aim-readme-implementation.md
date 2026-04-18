# AIM README Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将仓库根入口从 `CZ-Stack` 模板 README 切换为面向 `AIM` 的新 README，同时保留旧模板说明、移除 `.opencode/plugins`，并只做这些变更所必需的最小引用修正。

**Architecture:** 先通过 `git mv` 保留现有根 README 内容到 `CZ-Stack.README.md`，再在根目录重写一份完全围绕 `AIM` 定位的新 README。`.opencode/plugins` 的删除与引用修正分开处理：先删目录，再只修正会导致当前仓库文档导航失真或校验失败的最小引用，避免把历史规划文档当成同步重写范围。

**Tech Stack:** Markdown、git worktree、pnpm、Biome、Vitest（仅在插件删除影响 repo 级测试时运行最小相关校验）。

---

## 文件结构与职责映射

- Modify: `README.md` — 重写为 `AIM` 的根入口文档，严格按已批准 spec 的章节顺序与定位写作。
- Create: `CZ-Stack.README.md` — 通过保留当前根 `README.md` 的既有内容，承接 `CZ-Stack` 模板历史说明，避免旧内容丢失。
- Delete: `.opencode/plugins/task-runtime-sqlite.ts` — 删除插件入口，配合目录整体移除。
- Delete: `.opencode/plugins/task-runtime-sqlite/database.ts` — 删除已不再保留的插件数据库实现。
- Delete: `.opencode/plugins/task-runtime-sqlite/task-repository.ts` — 删除已不再保留的插件仓储实现。
- Delete: `.opencode/plugins/task-runtime-sqlite/session-runtime.ts` — 删除已不再保留的插件 session 运行时实现。
- Delete: `.opencode/plugins/task-runtime-sqlite/prompt-builder.ts` — 删除已不再保留的插件 prompt 构造实现。
- Modify or Delete: `test/repo/sqlite-task-runtime-plugin.test.ts` — 若其唯一职责是验证被删除的 `.opencode/plugins` 实现，则直接删除，保证 `pnpm test:repo` 不再引用死路径。
- Modify only if needed: `docs/api/README.md` — 仅当“仓库导航入口”继续指向根 `README.md` 会误导读者进入 `AIM` 文档而非 `CZ-Stack` 模板说明时，才把对应链接切到 `../../CZ-Stack.README.md`。

## 实施约束

- 不修改 `docs/superpowers/specs/2026-04-19-aim-readme-design.md`。
- 新根 `README.md` 必须先服务决策者视角，开发命令、仓库目录、开发者入口只能放在后部补充位置。
- 新根 `README.md` 必须明确 `AIM` 是独立产品，且与 `OpenCode` 的关系只能表述为 API-only 强集成。
- 新根 `README.md` 不能把 `AIM` 写成通用 AI 平台、`OpenCode` 插件、skill 注入方案或 event-hook 集成方案。
- 对 `.opencode/plugins` 的后续处理必须保持最小：只修正真实失效引用，不顺手扩写历史文档、计划文档或无关说明。

### Task 1: 保留旧根 README 为 `CZ-Stack.README.md`

**Files:**
- Create: `CZ-Stack.README.md`
- Modify: `README.md`

- [ ] Step 1: 运行 `git mv README.md CZ-Stack.README.md`，保留当前 `CZ-Stack` 模板说明原文，不在这一步改写内容。

Run: `git mv README.md CZ-Stack.README.md`
Expected: `git status --short` 出现 `R  README.md -> CZ-Stack.README.md`，且仓库根目录不再存在旧名 `README.md`。

- [ ] Step 2: 立即新建一个新的根 `README.md` 空白骨架，先只放标题、一句话定位和章节顺序，确保仓库根入口恢复存在。

```md
# AIM

> AI Agent 的 Manager：面向 Multi-Agent 研发轨道的执行调度与编排层。

## 为什么需要 AIM

## 为什么 AIM 必须是有观点的

## 核心价值

## 系统形态

## 与 OpenCode 的集成边界

## 调度哲学

## 初始项目范围

## 近期路线图

## 非目标

## 来自 CZ-Stack 的项目起源

## 面向开发者的仓库入口
```

Run: `test -f README.md && test -f CZ-Stack.README.md`
Expected: 两个文件都存在，根目录入口已恢复，后续可分别承载 `AIM` 与 `CZ-Stack` 两套叙事。

- [ ] Step 3: 用 `git diff -- README.md CZ-Stack.README.md` 核对这一阶段只有“旧内容被保留到新文件名 + 新根 README 骨架创建”两类变化，没有额外误改。

Run: `git diff -- README.md CZ-Stack.README.md`
Expected: diff 中只出现重命名后的旧内容保留，以及一个新的根 README 骨架，不出现无关仓库文件改动。

### Task 2: 按 approved spec 写完整的 `AIM` 根 README

**Files:**
- Modify: `README.md`

- [ ] Step 1: 完整改写 `README.md` 开篇，明确 `AIM` 是独立产品，第一目标读者是希望提升 AI 研发效率杠杆的决策者/负责人，而不是首先面向 clone 仓库的前线工程师。

```md
# AIM

> AI Agent 的 Manager：面向 Multi-Agent 研发轨道的执行调度与编排层。

AIM 不是一个模板示例仓库，也不是对单个 Agent 的 IDE 增强。
它服务的第一目标读者，是需要决定是否采用多 Agent 研发体系、并希望持续放大 AI 研发效率杠杆的决策者与组织负责人。

在大规模 AI 开发里，最先成为瓶颈的不是代码生成速度，而是人的认知带宽。
AIM 关注的问题不是“如何让单个 Agent 更聪明”，而是如何在人类放弃细节控制的前提下，仍然提升整体研发吞吐、保持可控性，并把系统推向更高程度的无人值守闭环执行。
```

Run: `rg -n "独立产品|认知带宽|决策者|吞吐|无人值守" README.md`
Expected: 能直接命中新 README 开篇中的核心定位语句，确认主叙事已从模板入口切到 `AIM` 产品入口。

- [ ] Step 2: 写出“为什么 AIM 必须是有观点的”“核心价值”“系统形态”“与 OpenCode 的集成边界”四组核心章节，确保以下口径全部落地：吞吐优先、其次可控性、再次无人值守闭环；系统形态为独立 Server / GUI / OpenAPI / CLI；`OpenCode` 仅 API-only 强集成。

```md
## 为什么 AIM 必须是有观点的

AIM 不追求一开始就做成完全通用的平台。
它的优势来自强约束：单线研发推进、强 GitHub 集成、强 OpenCode API 集成、以及围绕基线推进的一阶调度模型。

## 核心价值

1. 第一优先级是吞吐。
2. 第二优先级是可控性。
3. 第三优先级是无人值守闭环。

## 系统形态

1. 独立 Server
2. 独立 GUI
3. 独立 OpenAPI 规范
4. 全局可安装 CLI

## 与 OpenCode 的集成边界

- AIM 强依赖 OpenCode API 集成能力。
- AIM 不是 OpenCode 插件。
- AIM 不依赖 skill 注入。
- AIM 不依赖 event hook。
```

Run: `rg -n "API|插件|skill|hook|吞吐|可控性|无人值守|Server|GUI|CLI" README.md`
Expected: 所有关键边界与价值排序均能在新 README 中被直接定位，不需要读者跨文档猜测。

- [ ] Step 3: 写出“调度哲学”“初始项目范围”“近期路线图”“非目标”四组章节，并与 `docs/scheduler.md` 的现有定义保持一致，尤其是 Task 成功必须满足“PR merged + worktree 清理 + 主工作区基线刷新”。

```md
## 调度哲学

Task 不是普通待办事项，而是一次基线迭代增量。
调度器只有一个目标：尽快把基线推进到目标状态。
Task 的成功不等于代码写完或 PR 开出来，而是至少满足：PR 已合并、对应 worktree 已清理、主工作区基线已刷新。

## 初始项目范围

1. 任务接入与调度
2. 执行过程展示
3. 统一 OpenAPI 契约
4. CLI 入口
5. 非侵入式 OpenCode API 集成

## 近期路线图

1. 更强的编排能力
2. 更强的治理与可观测性
3. 更强的无人值守闭环自动化

## 非目标

- 不做 OpenCode 插件
- 不做 skill 注入或 event-hook 集成
- 不尝试成为完全通用的 AI 任务平台
- 不在早期承诺复杂组织权限模型、插件市场、计费系统
```

Run: `rg -n "基线迭代增量|PR 已合并|worktree 已清理|主工作区基线已刷新|非目标|路线图" README.md docs/scheduler.md`
Expected: README 与 `docs/scheduler.md` 在 Task 定义、成功标准和方向性表述上不互相冲突。

- [ ] Step 4: 写出“来自 CZ-Stack 的项目起源”“面向开发者的仓库入口”两个收尾章节，明确 `CZ-Stack` 只是项目来源背景，同时把开发者命令、目录入口和历史模板说明放到文档后部。

```md
## 来自 CZ-Stack 的项目起源

AIM 起步于 CZ-Stack 的工程基线，但它现在是一个独立产品，而不是模板 README 的继续包装。
如果你需要查看原有模板说明，请阅读 [`CZ-Stack.README.md`](./CZ-Stack.README.md)。

## 面向开发者的仓库入口

- 旧模板说明：[`CZ-Stack.README.md`](./CZ-Stack.README.md)
- 调度哲学：[`docs/scheduler.md`](./docs/scheduler.md)
- API 文档说明：[`docs/api/README.md`](./docs/api/README.md)
- 架构与验证文档：[`docs/architecture/`](./docs/architecture/)
```

Run: `rg -n "CZ-Stack\.README\.md|docs/scheduler\.md|docs/api/README\.md|docs/architecture" README.md`
Expected: 新 README 末尾存在清晰的开发者入口，且 `CZ-Stack` 只作为来源说明出现，不再占据主叙事。

- [ ] Step 5: 对新 `README.md` 执行一次最小文档格式检查。

Run: `pnpm exec biome check README.md CZ-Stack.README.md`
Expected: Markdown 格式检查通过；若失败，只修正文档格式，不扩展到无关文件。

### Task 3: 删除 `.opencode/plugins` 并处理最小必要引用

**Files:**
- Delete: `.opencode/plugins/task-runtime-sqlite.ts`
- Delete: `.opencode/plugins/task-runtime-sqlite/database.ts`
- Delete: `.opencode/plugins/task-runtime-sqlite/task-repository.ts`
- Delete: `.opencode/plugins/task-runtime-sqlite/session-runtime.ts`
- Delete: `.opencode/plugins/task-runtime-sqlite/prompt-builder.ts`
- Modify or Delete: `test/repo/sqlite-task-runtime-plugin.test.ts`
- Modify only if needed: `docs/api/README.md`

- [ ] Step 1: 删除 `.opencode/plugins` 下现存实现文件；如果删除后目录为空，则连同空目录一起移除。

Run: `rm -rf .opencode/plugins && test ! -e .opencode/plugins`
Expected: `.opencode/plugins` 路径不存在，工作区中不再保留该目录下的实现文件。

- [ ] Step 2: 用精确搜索确认哪些活动引用会因插件目录删除而失效，只处理会影响当前校验或当前读者导航的最小集合。

Run: `rg -n "\.opencode/plugins|CZ-Stack\.README\.md|\[\.\./\.\./README\.md\]" README.md CZ-Stack.README.md docs test .opencode`
Expected: 能明确区分三类结果：新 README 的来源链接、可能需要切换的文档导航链接、以及因插件删除而失效的测试引用。

- [ ] Step 3: 如果 `test/repo/sqlite-task-runtime-plugin.test.ts` 仅验证已删除插件实现，则直接删除该测试文件；不要把已移除插件改名迁移到其他路径。

Run: `git diff -- test/repo/sqlite-task-runtime-plugin.test.ts`
Expected: 若该文件被删除，diff 只体现“随插件删除而移除对应 repo 级测试”；若保留，则必须已经改到不再引用 `.opencode/plugins` 死路径。

- [ ] Step 4: 仅当 `docs/api/README.md` 中的“仓库导航入口”继续指向根 `README.md` 会误导读者查找模板说明时，才把该链接改为 `../../CZ-Stack.README.md`；若其语义是导航到新的 `AIM` 根入口，则保持不变。

```md
- 仓库导航入口：[`../../CZ-Stack.README.md`](../../CZ-Stack.README.md) 与 [`../architecture/validation.md`](../architecture/validation.md)
```

Run: `git diff -- docs/api/README.md`
Expected: 只有在确认导航语义确实受影响时才出现这一文件的最小链接修正；否则该文件不应出现在 diff 中。

- [ ] Step 5: 运行与本次删除最相关的最小校验，优先验证 repo 级测试与变更文件状态。

Run: `pnpm test:repo`
Expected: repo 级测试通过；若失败，只处理本次删除 `.opencode/plugins` 直接引入的死路径或断言问题，不顺手修 unrelated test。

### Task 4: 变更收口与最终自检

**Files:**
- Verify only: `README.md`
- Verify only: `CZ-Stack.README.md`
- Verify only: `.opencode/`
- Verify only: `docs/api/README.md`
- Verify only: `test/repo/sqlite-task-runtime-plugin.test.ts`

- [ ] Step 1: 检查工作区变更范围，确认只包含 README 切换、`.opencode/plugins` 删除，以及由这两件事直接引出的最小引用修正。

Run: `git status --short`
Expected: 变更集合应限于 `README.md`、`CZ-Stack.README.md`、`.opencode/plugins` 已删文件、以及真正必要的 `docs/api/README.md` / `test/repo/sqlite-task-runtime-plugin.test.ts`。

- [ ] Step 2: 用 diff 逐项人工核对 spec 约束是否都已落在新 README 中，尤其检查章节顺序、价值排序和边界声明。

Run: `git diff -- README.md CZ-Stack.README.md docs/api/README.md test/repo/sqlite-task-runtime-plugin.test.ts`
Expected: `README.md` 体现 approved spec 的 12 段结构；`CZ-Stack.README.md` 保留旧模板语义；其他文件只做最小必要跟进。

- [ ] Step 3: 进行一次最终文档与路径校验，确认新旧入口、删除路径和最小测试校验都一致。

Run: `test -f README.md && test -f CZ-Stack.README.md && test ! -e .opencode/plugins && pnpm exec biome check README.md CZ-Stack.README.md`
Expected: 根目录双 README 结构成立，`.opencode/plugins` 已删除，README 文档格式检查通过。

## 最小验证命令与预期结果

- `git mv README.md CZ-Stack.README.md` -> 旧根 README 内容被保留到 `CZ-Stack.README.md`。
- `test -f README.md && test -f CZ-Stack.README.md` -> 根目录同时存在新的 `AIM` README 与旧的 `CZ-Stack` 说明。
- `pnpm exec biome check README.md CZ-Stack.README.md` -> 两份 Markdown 文档格式通过。
- `rm -rf .opencode/plugins && test ! -e .opencode/plugins` -> 插件目录被完整移除。
- `rg -n "\.opencode/plugins|CZ-Stack\.README\.md" README.md CZ-Stack.README.md docs test .opencode` -> 只剩符合新结构的引用，不再保留失效插件路径引用。
- `pnpm test:repo` -> repo 级测试通过；若失败，问题应可直接归因于本次插件删除所影响的最小引用集合。
- `git status --short` -> 只出现本计划定义的目标文件变更。

## 自检结果（已按 approved spec 对照补齐）

- [x] 已覆盖根 `README.md` 改名为 `CZ-Stack.README.md` 以保留旧内容。
- [x] 已覆盖新的根 `README.md` 重写，并按 spec 要求把 `AIM` 作为独立产品、面向决策者优先来组织。
- [x] 已覆盖“为什么需要 AIM / 有观点立场 / 核心价值 / 系统形态 / OpenCode API-only 边界 / 调度哲学 / MVP / 路线图 / 非目标 / 项目起源 / 开发者入口”的完整章节顺序。
- [x] 已覆盖 `.opencode/plugins` 删除，并把后续动作限制为最小必要引用修正。
- [x] 已显式把 `docs/api/README.md` 与 `test/repo/sqlite-task-runtime-plugin.test.ts` 设为条件性最小跟进文件，避免无依据扩大范围。
- [x] 已为每个任务写出明确文件路径、命令与预期结果，没有保留未展开的空白条目或模糊表述。
- [x] 已确保计划末尾不提供 inline execution 选项；后续实现只能继续由 subagent 在当前 worktree 中执行。

后续交接：实现阶段必须继续由 subagent 在当前 worktree 内按本计划逐项执行，不得切回主工作区做 inline execution。
