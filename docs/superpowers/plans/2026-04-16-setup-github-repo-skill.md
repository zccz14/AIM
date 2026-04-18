# setup-github-repo 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `setup-github-repo` 技能并把当前 GitHub 仓库的 merge / RuleSet / PR auto-merge 行为校准到目标状态。

**Architecture:** 先读取仓库现状与 CI workflow job name，确认 live GitHub 设置的真实状态；随后以最小文件集落地 spec、implementation plan 与 skill 文档，并通过 `gh` 对 live repo 做必要的最小修正；最后在本分支创建 PR 并开启 squash auto-merge 或记录明确 blocker。

**Tech Stack:** Markdown、GitHub CLI (`gh`)、GitHub Rulesets API、git。

---

## 文件结构与职责映射

- Create: `docs/superpowers/specs/2026-04-16-setup-github-repo-skill-design.md` — 记录本次技能与 GitHub 配置标准化设计。
- Create: `docs/superpowers/plans/2026-04-16-setup-github-repo-skill.md` — 记录实现步骤与验证命令。
- Create: `.opencode/skills/setup-github-repo/SKILL.md` — 可复用技能正文。
- Read: `.github/workflows/ci.yml` — 提取实际 required status check 名称。

## 实施约束

- 只修改上述文档/技能文件；live GitHub 配置通过 `gh` 调整，不新增仓库内脚本。
- required checks 必须以 `.github/workflows/ci.yml` 当前 job `name` 为准，不得凭记忆写死。
- 已存在 repository ruleset 时优先最小 update，避免重建覆盖。
- PR auto-merge 必须使用 squash；若无法启用，必须输出 blocker。

### Task 1: 建立基线并确认 live GitHub 现状

**Files:**
- Read: `.github/workflows/ci.yml`

- [ ] Step 1: 读取 `.github/workflows/ci.yml`，确认实际 job 名称与预期 required checks。
- [ ] Step 2: 读取仓库 merge / auto-merge / branch delete 设置，建立 live baseline。
- [ ] Step 3: 读取已有 ruleset 列表与默认分支 ruleset 详情，确认是否已满足目标状态。
- [ ] Step 4: 记录 skill 需要覆盖的四类缺口：live state 检查、workflow 推导 checks、最小更新 ruleset、PR auto-merge blocker 说明。

**Commands:**
- `gh repo view --json nameWithOwner,defaultBranchRef`
- `gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)`
- `gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/rulesets`

### Task 2: 先写 spec，再写 implementation plan

**Files:**
- Create: `docs/superpowers/specs/2026-04-16-setup-github-repo-skill-design.md`
- Create: `docs/superpowers/plans/2026-04-16-setup-github-repo-skill.md`

- [ ] Step 1: 用中文写 spec，锁定范围、非目标、最小更新策略与验证方案。
- [ ] Step 2: 写 implementation plan，明确文件职责、live 校准步骤与 PR 出站步骤。
- [ ] Step 3: 自检 spec / plan 路径、命名与约束是否一致。

### Task 3: 以写技能的 TDD 方式补齐 `setup-github-repo`

**Files:**
- Create: `.opencode/skills/setup-github-repo/SKILL.md`

- [ ] Step 1: 先根据 Task 1 baseline 总结“没有该技能时容易遗漏什么”，作为 RED 输入。
- [ ] Step 2: 编写最小技能正文，显式覆盖 baseline 暴露出的缺口。
- [ ] Step 3: 为技能补充 quick reference、common mistakes、blocker 说明与 repo-local check name 示例。
- [ ] Step 4: 重新阅读技能，确认可以指导执行者完成 repo 校准与 PR auto-merge 启用。

### Task 4: 校准 live GitHub 设置并验证

**Files:**
- Modify live GitHub repository settings and rulesets only

- [ ] Step 1: 若 merge / auto-merge / delete-branch 设置已正确，只记录验证结果；若不正确，使用 `gh api --method PATCH` 做最小修正。
- [ ] Step 2: 若默认分支 ruleset 已要求 `Quality gates` 与 `Playwright`，则保留不变；否则最小 update/create。
- [ ] Step 3: 重新读取 repo settings 与 ruleset 详情，确认目标态成立。

### Task 5: 文档校验、提交、PR、auto-merge

**Files:**
- Stage/commit all changed files

- [ ] Step 1: 运行最小验证命令（至少含 `git diff --check` 与文档/skill内容自检）。
- [ ] Step 2: 提交 commit。
- [ ] Step 3: 在 push 前执行 `git fetch origin` 与 `git rebase origin/main`。
- [ ] Step 4: push 分支并创建 PR。
- [ ] Step 5: 立即尝试 `gh pr merge <number> --auto --squash`；若失败，读取 PR 状态并记录 blocker。
- [ ] Step 6: 执行一次有意等待后再做首次 follow-up。

## 全量验证命令与预期结果

- `git diff --check` → 无空白或 patch 格式错误。
- `gh repo view --json allowSquashMerge,allowMergeCommit,allowRebaseMerge,allowAutoMerge,deleteBranchOnMerge` → 输出匹配目标值。
- `gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/rulesets` → 存在默认分支 ruleset。
- `gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/rulesets/<id>` → required checks 包含 `Quality gates` 与 `Playwright`。
- `gh pr merge <number> --auto --squash` → 成功开启 auto-merge，或返回可解释 blocker。
