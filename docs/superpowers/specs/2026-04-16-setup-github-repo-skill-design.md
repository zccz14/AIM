# setup-github-repo 技能设计说明

## 背景/目标

当前仓库已经具备基础 GitHub Actions CI，但“仓库 merge 设置、PR merge 行为、默认分支 RuleSet required checks、为指定 PR 启用 squash auto-merge”仍缺少统一、可复用、可审计的执行说明。缺少技能时，执行者容易出现以下漂移：

- 只检查仓库 merge 开关，遗漏 `allow_auto_merge` 或 `delete_branch_on_merge`。
- 手工猜测 required status check 名称，而不是从 `.github/workflows/ci.yml` 读取实际 job 名称。
- 已存在 RuleSet 时整套重建，导致不必要的配置漂移。
- 尝试直接为 PR 开启 auto-merge，但没有先确认可 merge 状态与阻塞原因。

本次目标是补齐一个仓库内可复用技能 `setup-github-repo`，把上述流程标准化，并同时把当前 GitHub 仓库配置校准到目标状态。

## 范围

- 新增 `.opencode/skills/setup-github-repo/SKILL.md`，沉淀仓库设置与 PR auto-merge 工作流。
- 明确仓库 merge 设置目标值：
  - `allow_squash_merge = true`
  - `allow_merge_commit = false`
  - `allow_rebase_merge = false`
- 明确 PR merge 行为目标值：
  - `allow_auto_merge = true`
  - `delete_branch_on_merge = true`
- 要求从 `.github/workflows/ci.yml` 或 `.github/workflows/ci.yaml` 读取实际 job 名称，并将其配置到默认分支 RuleSet 的 required status checks。
- 给出为指定 PR 启用 `--auto --squash` 的命令与阻塞判断方式。
- 校验当前仓库 live 设置与 RuleSet 状态；若已匹配则只验证不改动，若不匹配则做最小修正。

## 非目标

- 不修改 CI workflow 的 job 结构、命名或执行逻辑。
- 不引入新的 GitHub App、第三方 action 或仓库外脚本。
- 不扩展到 CODEOWNERS、审批人数、签名提交等额外保护策略。
- 不把本技能写成只适用于单个 PR 编号的操作手册。

## 方案设计

### 1. 技能先读 live state，再决定改动

技能应先通过 `gh repo view --json ...` 与 `gh api repos/{owner}/{repo}/rulesets` 读取当前状态，再决定是否需要 patch。这样可以避免“明明已正确却重复写入”的无效操作，并满足最小修改原则。

### 2. required checks 必须从 workflow job name 推导

GitHub RuleSet 的 required status checks 使用的是 check context 名称，而不是 workflow 文件名或 step 名称。对于本仓库，应从 `.github/workflows/ci.yml` 中读取 job `name` 字段，当前实际需要的是：

- `Quality gates`
- `Playwright`

技能必须强调：如果 workflow 文件或 job name 变化，需要先重新读取文件，再更新 RuleSet；禁止硬编码旧值后盲目复用。

### 3. RuleSet 采用“优先最小更新，缺失时最小创建”

若仓库已经存在覆盖默认分支的 repository ruleset，并且仅缺少 required checks 或 strict policy 不正确，应做最小 patch；只有在不存在合适 RuleSet 时才创建新的最小规则集。这样可以减少与仓库其他保护规则的冲突风险。

### 4. PR auto-merge 需要显式区分“可开启”与“被阻塞”

技能需要把“尝试开启 auto-merge”与“解释为什么暂时开不了”分开：

- 先读取 `gh pr view <number> --json state,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup`。
- 满足基本前提时，执行 `gh pr merge <number> --auto --squash`。
- 若仍失败，明确输出阻塞项，例如 draft、checks 未完成、review 未满足、存在 merge conflict、仓库权限/策略限制。

## 文件变更

- 新增 `docs/superpowers/specs/2026-04-16-setup-github-repo-skill-design.md`：记录本次设计。
- 新增 `docs/superpowers/plans/2026-04-16-setup-github-repo-skill.md`：记录实现计划。
- 新增 `.opencode/skills/setup-github-repo/SKILL.md`：沉淀可复用技能。

除上述文件外，不应新增其他仓库内持久化产物；GitHub live 设置变更通过 `gh api` 直接完成。

## 风险与回退

- 风险：错误理解 required checks 的 context 名称，导致 RuleSet 绑定到不存在的 check。
  - 控制：以 workflow job `name` 为准，并在变更后重新读取 ruleset 验证。
- 风险：已有 ruleset 含其他规则，被不必要重建覆盖。
  - 控制：优先 update 既有 ruleset，仅修改 required checks 相关字段。
- 风险：PR auto-merge 命令执行失败但未说明原因，导致后续无法继续推进。
  - 控制：失败后立即读取 PR mergeability / checks / review 状态并记录 blocker。

若后续发现技能流程不适配，可删除该技能目录并按 live 仓库设置重新编写；live 仓库设置本次仅做目标态最小修正。

## 验证方案

至少完成以下验证：

1. 读取 `.github/workflows/ci.yml`，确认当前 required check 候选为 `Quality gates` 与 `Playwright`。
2. 读取 `gh repo view --json allowSquashMerge,allowMergeCommit,allowRebaseMerge,allowAutoMerge,deleteBranchOnMerge`，确认仓库设置满足目标值。
3. 读取 `gh api repos/{owner}/{repo}/rulesets` 与详细 ruleset，确认默认分支启用了 required status checks，且 context 与 workflow job name 一致。
4. 对新增 `SKILL.md` 进行基线/覆盖验证：确认技能正文显式覆盖“读 live state、从 workflow 推导 checks、最小更新 RuleSet、为指定 PR 开启 squash auto-merge 并解释阻塞”四类核心缺口。
5. 在本分支 PR 创建后，尝试执行 `gh pr merge <number> --auto --squash`，并记录是否成功启用或被什么条件阻塞。
