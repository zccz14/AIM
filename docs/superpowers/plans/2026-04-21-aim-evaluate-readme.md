# aim-evaluate-readme 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan inside the current worktree task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `@aim-ai/opencode-plugin` 中新增 packaged skill `aim-evaluate-readme`，把 README 声明与最新 `origin/main` 基线事实之间的差距评估收敛为可复用、可打包、可验证的静态技能文档。

**Architecture:** 先用插件打包测试建立 RED 基线，证明仓库当前尚未分发 `aim-evaluate-readme`；再以最小文件集新增 skill 文档，并同步更新 packaged skill 索引与 `using-aim` 的发现入口；最后运行面向打包产物与文档内容的验证，确认 skill 既被正确分发，也把 spec 约束表达完整。

**Tech Stack:** Markdown、Vitest、pnpm、tarball 打包验证、OpenCode packaged skills。

---

## 文件结构与职责映射

- Create: `modules/opencode-plugin/skills/aim-evaluate-readme/SKILL.md` - 新 skill 正文，完整表达用途、输入输出、评估流程、允许值、边界、禁止事项、示例与自检口径。
- Modify: `modules/opencode-plugin/test/opencode-plugin.test.ts` - 新增 RED/GREEN 验证，覆盖文件存在、文本加载、README 索引、`using-aim` 发现入口与 tarball 打包产物。
- Modify: `modules/opencode-plugin/skills/README.md` - 把 `aim-evaluate-readme` 列入 packaged skill 索引，强调它仍是静态文档，不代表自动执行。
- Modify: `modules/opencode-plugin/README.md` - 更新包级 README，列出插件现在分发的新 skill 名称。
- Modify: `modules/opencode-plugin/skills/using-aim/SKILL.md` - 增加 README 差距评估场景的触发条件，并把 `aim-evaluate-readme` 纳入优先检查的 AIM skills 列表。

## 实施约束

- 只做 packaged skill 与其发现/打包文档链路的最小改动；不要改插件运行时代码或 `package.json`，因为 `skills/` 目录已经被整体打包。
- skill 内容必须严格以 `docs/superpowers/specs/2026-04-21-aim-evaluate-readme-design.md` 为唯一 scope 来源，不扩展到 Task 创建、调度、implementation plan、代码实现或 PR 跟进。
- skill 文档必须把 baseline 明确限定为最新 `origin/main`，不得混用 Task Spec 的 `base_commit`、`spec_commit` 等历史基线概念。
- skill 文档必须显式使用 `iteration_signal`，不得引入 `coordinator_signal` 或其他替代字段名。
- skill 作者验证必须包含 RED/GREEN 风格的“先失败、后通过”检查，证明 skill 被正确打包且核心文案可被测试识别，而不仅仅是手写 `SKILL.md`。

### Task 1: 先建立 skill 打包与发现链路的 RED 基线

**Files:**
- Modify: `modules/opencode-plugin/test/opencode-plugin.test.ts`

- [ ] Step 1: 在 `modules/opencode-plugin/test/opencode-plugin.test.ts` 中仿照现有 skill 测试，先加入 `aim-evaluate-readme` 的 URL 常量、文本变量和 `beforeAll` 读取逻辑，但暂时不要创建 `modules/opencode-plugin/skills/aim-evaluate-readme/SKILL.md`。
- [ ] Step 2: 新增针对 `aim-evaluate-readme` 的失败测试，至少覆盖以下断言：本地 `skills/aim-evaluate-readme/SKILL.md` 应存在、`pnpm pack` 产物应包含 `package/skills/aim-evaluate-readme/SKILL.md`、`modules/opencode-plugin/skills/README.md` 与 `modules/opencode-plugin/README.md` 应包含 `aim-evaluate-readme`、`modules/opencode-plugin/skills/using-aim/SKILL.md` 应把它列为可优先加载的 AIM skill。
- [ ] Step 3: 再加入 skill 正文本身的内容断言，要求未来文案至少包含这些片段：`最新 origin/main`、`claim_checks`、`conclusion_category`、`iteration_signal`、`continue_toward_readme`、`consolidate_readme`、`clarify_readme`、`resolve_readme_conflict`，并且不得出现 `TODO` 或 `TBD`。
- [ ] Step 4: 运行定向测试，确认当前仓库在未实现该 skill 前失败，且失败原因直接指向缺失文件或缺失文案，而不是无关错误。

**Commands:**
- `pnpm --dir modules/opencode-plugin exec vitest run --config vitest.workspace.ts --project opencode-plugin modules/opencode-plugin/test/opencode-plugin.test.ts`

**Expected RED result:**
- 至少一条断言失败，并明确表现为 `skills/aim-evaluate-readme/SKILL.md` 不存在，或 README / `using-aim` 尚未提到 `aim-evaluate-readme`。

### Task 2: 以最小文件集写出 `aim-evaluate-readme` skill 并接上发现入口

**Files:**
- Create: `modules/opencode-plugin/skills/aim-evaluate-readme/SKILL.md`
- Modify: `modules/opencode-plugin/skills/README.md`
- Modify: `modules/opencode-plugin/README.md`
- Modify: `modules/opencode-plugin/skills/using-aim/SKILL.md`

- [ ] Step 1: 新建 `modules/opencode-plugin/skills/aim-evaluate-readme/SKILL.md`，写入合法 frontmatter：`name: aim-evaluate-readme`，`description` 只描述何时使用，不总结执行流程。
- [ ] Step 2: 在 skill 正文中按 spec 落实最小但完整的章节，至少包含：用途/边界、必需输入、结构化输出字段、逐步评估流程、五个允许的 `conclusion_category`、一一对应的 `iteration_signal` 映射、与 Coordinator 的边界、明确禁止、推荐输出骨架、两个 repo 语境示例、自检口径。
- [ ] Step 3: 把 writing-skills 的 GREEN/REFACTOR 要求折进 skill 文案本身：补一段 quick reference 或等价的速查结构，总结允许值与禁止行为；补一段 common mistakes，显式拦住三类高风险误用，分别是把 baseline 读成历史 commit、看到 gap 就直接创建任务/排顺序、无法稳定核对时擅自补写 README 意图。
- [ ] Step 4: 更新 `modules/opencode-plugin/skills/README.md`，增加 `aim-evaluate-readme` 的一句话说明，文案要强调它是 README-to-baseline gap evaluation guidance，并继续保留“静态文档、无自动执行”的边界说明。
- [ ] Step 5: 更新 `modules/opencode-plugin/README.md`，把 `aim-evaluate-readme` 加入插件当前分发的 packaged skills 列表，保持现有 README 的英文风格与边界措辞。
- [ ] Step 6: 更新 `modules/opencode-plugin/skills/using-aim/SKILL.md`，在 “Typical triggers” 与 “AIM Skills To Check First” 两处加入 README 差距评估场景，明确当任务是判断 README 与最新 `origin/main` 的差距并产出方向信号时，必须优先加载 `aim-evaluate-readme`。

### Task 3: 让 RED 测试转绿，并验证打包产物与文案边界

**Files:**
- Verify: `modules/opencode-plugin/test/opencode-plugin.test.ts`
- Verify: `modules/opencode-plugin/skills/aim-evaluate-readme/SKILL.md`
- Verify: `modules/opencode-plugin/skills/README.md`
- Verify: `modules/opencode-plugin/README.md`
- Verify: `modules/opencode-plugin/skills/using-aim/SKILL.md`

- [ ] Step 1: 重新运行 Task 1 的定向 Vitest 命令，确认新增 skill 的存在、文本片段、README 索引、`using-aim` 发现入口与 tarball 内容断言全部通过。
- [ ] Step 2: 运行 `git diff --check -- modules/opencode-plugin/test/opencode-plugin.test.ts modules/opencode-plugin/skills/aim-evaluate-readme/SKILL.md modules/opencode-plugin/skills/README.md modules/opencode-plugin/README.md modules/opencode-plugin/skills/using-aim/SKILL.md`，确认没有空白或 patch 格式问题。
- [ ] Step 3: 运行包级全量测试 `pnpm --dir modules/opencode-plugin test`，确认新增 skill 没有破坏插件现有 build、lint、typecheck 与打包测试。
- [ ] Step 4: 做一次文档人工复核，只检查三件事：`iteration_signal` 字段名在全文前后一致；没有出现 `coordinator_signal`；任何结论/示例都没有越界成 Task 创建、优先级或执行顺序建议。

**Expected GREEN result:**
- `modules/opencode-plugin/test/opencode-plugin.test.ts` 中所有与 `aim-evaluate-readme` 相关的新断言通过。
- `pnpm pack` 生成的 tarball 包含 `package/skills/aim-evaluate-readme/SKILL.md`。
- `using-aim`、包级 README、skills 索引 README 都能把执行者导向新 skill，但没有暗示插件会自动执行 README 评估。

## 全量验证命令与预期结果

- `pnpm --dir modules/opencode-plugin exec vitest run --config vitest.workspace.ts --project opencode-plugin modules/opencode-plugin/test/opencode-plugin.test.ts` -> RED 阶段先失败，GREEN 阶段通过。
- `git diff --check -- modules/opencode-plugin/test/opencode-plugin.test.ts modules/opencode-plugin/skills/aim-evaluate-readme/SKILL.md modules/opencode-plugin/skills/README.md modules/opencode-plugin/README.md modules/opencode-plugin/skills/using-aim/SKILL.md` -> 无空白错误、无残缺 patch。
- `pnpm --dir modules/opencode-plugin test` -> typecheck、lint、build、Vitest 全部通过。

## 自检结果

- 已覆盖 spec 的核心要求：README 声明拆解、最新 `origin/main` 基线、结构化输出字段、五类 `conclusion_category`、固定 `iteration_signal` 映射、Coordinator 边界、禁止事项、示例、自检口径。
- 已覆盖 repo-specific 修改点：skill 文件本体、插件测试、skills 索引 README、包级 README、`using-aim` 入口。
- 无占位词：本文未使用 `TODO`、`TBD`、`implement later` 等占位语。
- 无明显冲突：计划假设后续实现由同一 worktree 内的 subagents 执行，不要求主工作区开发，也不要求本轮 commit / push / PR。
