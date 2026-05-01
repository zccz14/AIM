---
name: aim-setup-github-repo
description: Use when a GitHub repository needs its merge settings, default-branch ruleset required checks, or PR auto-merge behavior verified or standardized with gh.
---

# aim-setup-github-repo

## 概述

先读 live state，再做最小修正。不要猜测仓库设置、required checks 或 PR merge 阻塞原因。

这个技能用于标准化 4 类动作：校准仓库 merge 设置、校准 PR merge 行为、让默认分支 RuleSet 强制 CI checks 与基础分支保护、为指定 PR 开启 squash auto-merge。

## 何时使用

- 需要确认仓库是否允许 squash merge、启用 linear history、禁止 merge commit / rebase merge。
- 需要确认或开启 `allow_auto_merge`、`delete_branch_on_merge`。
- 需要让默认分支在 merge 前必须通过 `.github/workflows/ci.yml` 或 `.github/workflows/ci.yaml` 定义的 CI job checks，并默认要求 PR 合并且阻止 force push。
- 需要为某个 PR 开启 `--auto --squash`，但不确定当前是否满足前提。

不要在以下场景使用：

- 只是修改 workflow 逻辑本身，而不是仓库 / PR 设置。
- 需要配置审批人数、CODEOWNERS、签名提交等本技能未覆盖的保护规则。

## Core Workflow

### 1. 先确认仓库与默认分支

```bash
gh repo view --json nameWithOwner,defaultBranchRef
```

记下：

- `nameWithOwner`
- 默认分支名（通常是 `main`）

### 2. 读取当前仓库 merge / PR merge 设置

```bash
gh repo view --json \
  allowSquashMerge,allowMergeCommit,allowRebaseMerge,allowAutoMerge,deleteBranchOnMerge,requiredLinearHistory
```

目标值：

| Setting | Target |
| --- | --- |
| `allowSquashMerge` | `true` |
| `allowMergeCommit` | `false` |
| `allowRebaseMerge` | `false` |
| `allowAutoMerge` | `true` |
| `deleteBranchOnMerge` | `true` |
| `requiredLinearHistory` | `true` |

若不匹配，最小修正：

```bash
gh api --method PATCH repos/OWNER/REPO \
  -f allow_squash_merge=true \
  -f allow_merge_commit=false \
  -f allow_rebase_merge=false \
  -f allow_auto_merge=true \
  -f delete_branch_on_merge=true
```

若 `requiredLinearHistory` 不匹配，再补：

```bash
gh api --method PATCH repos/OWNER/REPO \
  -f required_linear_history=true
```

### 3. 从 workflow 读取真实 required check 名称

RuleSet 需要的是 **job check context 名称**，不是 workflow 文件名，也不是 step 名称。

先打开实际存在的文件：

- `.github/workflows/ci.yml`
- 或 `.github/workflows/ci.yaml`

读取每个需要阻塞 merge 的 job `name:`。对当前 CZ-Stack，来自 `.github/workflows/ci.yml` 的实际 check 名称是：

- `Quality gates`
- `Playwright`

如果 workflow 后续改名，必须先重新读取文件，再更新 RuleSet；不要复用旧字符串。

### 4. 最小检查 / 更新默认分支 RuleSet

先列出现有 ruleset：

```bash
gh api repos/OWNER/REPO/rulesets
```

再读取命中的默认分支 ruleset 详情：

```bash
gh api repos/OWNER/REPO/rulesets/RULESET_ID
```

默认目标配置至少包含：

- `target = branch`
- `conditions.ref_name.include = ["~DEFAULT_BRANCH"]`
- `rules[].type = required_linear_history`
- `rules[].type = pull_request`
- `rules[].type = required_status_checks`
- required checks context 覆盖 workflow 的 job 名称
- `strict_required_status_checks_policy = true`
- `rules[].type = non_fast_forward`

可用下表快速核对默认目标：

| Scope | Setting / Rule | Target |
| --- | --- | --- |
| Repo | `allowSquashMerge` | `true` |
| Repo | `allowMergeCommit` | `false` |
| Repo | `allowRebaseMerge` | `false` |
| Repo | `allowAutoMerge` | `true` |
| Repo | `deleteBranchOnMerge` | `true` |
| Repo | `requiredLinearHistory` | `true` |
| RuleSet | `required_linear_history` | present |
| RuleSet | `pull_request` | present |
| RuleSet | `required_status_checks` | present |
| RuleSet | `non_fast_forward` | present |

处理原则：

1. 已有合适 ruleset：只做最小 patch。
2. 没有合适 ruleset：创建新的最小 ruleset，并一次带上 `required_linear_history`、`pull_request`、`required_status_checks`、`non_fast_forward`。
3. 不要为了只改 required checks 或新增默认保护而删除并重建整个 ruleset。
4. 若已有 ruleset 含更严格策略，保留更严格值，不要降级。

创建或更新后，必须重新 `gh api .../rulesets/...` 读回确认。

更新时优先补缺失 rule 或仅 patch 对应 `parameters` 字段；不要把“Require a pull request before merging”“Block force pushes”当成可选 extras。

### 5. 为指定 PR 开启 squash auto-merge

先读 PR 状态：

```bash
gh pr view PR_NUMBER --json \
  state,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup
```

满足以下前提时再尝试：

- PR `state = OPEN`
- 不是 draft
- 没有 merge conflict
- 必要 checks 已通过或允许进入 auto-merge 队列
- 没有未满足的 blocking review

执行：

```bash
gh pr merge PR_NUMBER --auto --squash
```

如果命令失败，不要只报“开启失败”；必须继续读取 PR 状态并明确 blocker。

常见 blocker：

- Draft PR
- Required checks 仍在运行 / 失败
- Review 未满足
- 分支有冲突，`mergeStateStatus` 非 clean
- 仓库未开启 auto-merge 或当前账号无权限

## Quick Reference

| Goal | Command |
| --- | --- |
| 读取仓库设置 | `gh repo view --json allowSquashMerge,allowMergeCommit,allowRebaseMerge,allowAutoMerge,deleteBranchOnMerge,requiredLinearHistory` |
| 修正仓库设置 | `gh api --method PATCH repos/OWNER/REPO ...` |
| 列出 rulesets | `gh api repos/OWNER/REPO/rulesets` |
| 读取 ruleset 详情 | `gh api repos/OWNER/REPO/rulesets/RULESET_ID` |
| 查看 PR mergeability | `gh pr view PR_NUMBER --json state,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup` |
| 开启 squash auto-merge | `gh pr merge PR_NUMBER --auto --squash` |

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| 把 workflow 文件名 `CI` 当成 required check 名称 | 从 job `name:` 读取真实 check context |
| 已有 ruleset 仍整套删掉重建 | 优先最小 patch 既有 ruleset |
| 只看 merge settings，漏掉 `requiredLinearHistory` | 一次性读取并核对仓库默认目标设置 |
| 把 “Require a pull request before merging” 或 “Block force pushes” 当成可选项 | 把 `pull_request` 与 `non_fast_forward` 视为默认目标 rules |
| 为了补默认保护而重写整个 ruleset | 只 patch 缺失 rules 或对应 `parameters` |
| `gh pr merge --auto --squash` 失败后停止 | 继续读取 PR 状态并报告 blocker |
| 假设 `.github/workflows/ci.yaml` 一定存在 | 先确认是 `.yml` 还是 `.yaml` |

## Red Flags

- “这些设置通常默认就对。”
- “check 名称应该就是 workflow 名。”
- “Require a pull request before merging 先不配也可以。”
- “force push 先不拦，后面再说。”
- “删掉 ruleset 重建更快。”
- “auto-merge 命令报错，先不管。”

看到这些想法时，回到：先读 live state，再做最小修正。
