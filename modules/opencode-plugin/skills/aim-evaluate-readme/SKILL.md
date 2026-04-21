---
name: aim-evaluate-readme
description: Use when judging how README claims compare to the latest origin/main baseline and the coordinator needs direction signals without task creation or execution decisions.
---

# aim-evaluate-readme

## 概述

这个 skill 用于评估 README 声明与最新 `origin/main` 基线事实之间的差距。

它只做 README-to-baseline gap evaluation：把 README 拆成可核对声明，用最新 `origin/main` 的只读事实逐条核对，再输出 `claim_checks`、`conclusion_category` 和 `iteration_signal`。它不是任务创建器、规划器、调度器，也不替 Coordinator 决定实现或执行。

## 何时使用

- 需要判断 README 当前表达与最新 `origin/main` 事实是否一致时。
- 需要给 Coordinator 提供“继续逼近 README / 先澄清 README / 先让 README 与现状重新对齐”的方向信号时。
- 需要把 README 内容拆成可复查的声明和证据链，而不是只给泛泛结论时。

## 不何时使用

- 不负责创建 AIM Task，也不调用 `POST /tasks`。
- 不负责决定优先级、顺序、并行策略或资源分配。
- 不负责写 implementation plan、改代码、跑验证、跟进 PR。
- 不负责替 Coordinator 做执行决策，例如“下一步就实现哪个改动”。

## 必需输入

- README 原文，或本次需要评估的 README 相关章节。
- 最新 `origin/main` 基线的只读事实，可来自代码、文档、配置、测试、接口契约和已合并产物。
- 若可得，本次关注范围提示，例如“只看系统形态”或“只看 Task 生命周期”。

## 输入约束

- 这里的 baseline 只能指最新 `origin/main`，不能替换成 `base_commit`、`spec_commit` 或其他历史快照。
- 在开始 README-to-baseline evaluation 前，必须先按仓库规则做只读仓库准备来刷新本地对 `origin/main` 的认识；在本仓库规则允许的场景下，先执行 `git fetch origin`，再读取 `origin/main` 的已合并事实。
- 不得把未合并分支、草稿 PR、个人工作区内容当成当前基线事实。
- 无法稳定拆成可验证声明的 README 内容，应保留为歧义，不得擅自补写用户意图。

## 输出字段

输出必须至少包含以下字段：

- `scope`：本次评估覆盖的 README 范围。
- `claim_checks`：逐条声明的核对结果，包含声明、证据、判定与备注。
- `conclusion_category`：总体结论类别，只能使用本 skill 定义的允许值。
- `iteration_signal`：供 Coordinator 使用的方向信号，只能使用固定映射值。
- `gap_summary`：主要差距或主要一致性的简短总结。
- `open_questions`：仍需澄清的问题；若无则为空列表。

## 评估流程

1. 先界定 `scope`，避免把无关章节混入同一个结论。
2. 从 README 提取最小可核对声明，优先选择外部可观测说法。
3. 对纯愿景句、修辞句或复合句先拆分；仍无法稳定核对的，标为歧义。
4. 先按仓库规则执行只读仓库准备以刷新本地 `origin/main` 认知（例如先执行 `git fetch origin`），再收集最新 `origin/main` 的只读事实，只看当前已合并基线。
5. 逐条形成 `claim_checks`，判断每条声明是 `aligned`、`readme_ahead`、`baseline_ahead`、`ambiguous` 还是 `conflicted`。
6. 按聚合规则收敛 `conclusion_category`，再映射到唯一的 `iteration_signal`。
7. 显式列出 `open_questions`，不要把不确定性偷渡成任务、排期或执行决策。

## `conclusion_category` 允许值

`conclusion_category` 只能取以下五类：

- `aligned`：README 关键声明与当前基线事实基本一致。
- `readme_ahead`：README 描述的能力、形态或约束尚未在当前基线落地。
- `baseline_ahead`：当前基线已经具备 README 未表达或尚未更新反映的事实。
- `ambiguous`：README 声明过于模糊、复合，或缺少稳定判定口径。
- `conflicted`：README 声明与当前基线事实存在直接冲突。

不得输出这五类之外的自定义标签。

## 总体结论聚合规则

当 `claim_checks` 出现混合结果时，按以下顺序收敛：

1. 只要存在会阻断稳定方向判断的直接冲突，优先输出 `conflicted`。
2. 若没有直接冲突，但存在关键声明无法稳定判定，优先输出 `ambiguous`。
3. 若主要差距表现为 README 领先于实现，输出 `readme_ahead`。
4. 若主要差距表现为基线领先于 README，输出 `baseline_ahead`。
5. 只有关键声明整体无实质方向偏移时，才输出 `aligned`。

## `iteration_signal` 固定映射

`iteration_signal` 只表达方向语义，不能表达任务、优先级或顺序。映射必须固定为：

| `conclusion_category` | `iteration_signal` | 含义 |
| --- | --- | --- |
| `aligned` | `hold_alignment` | 当前 README 评估结果不要求改变迭代方向 |
| `readme_ahead` | `continue_toward_readme` | README 仍代表更前的目标状态 |
| `baseline_ahead` | `consolidate_readme` | 基线事实已超出 README 当前表达 |
| `ambiguous` | `clarify_readme` | 下一轮应先澄清 README 口径 |
| `conflicted` | `resolve_readme_conflict` | 需要先处理 README 与基线的直接冲突 |

不得混用映射，也不得引入 `coordinator_signal` 或其他替代字段名。

## Quick Reference

| 项目 | 允许做 | 禁止做 |
| --- | --- | --- |
| baseline | 只看最新 `origin/main` | 使用历史 commit、未合并分支、草稿 PR |
| 结果字段 | 输出 `claim_checks`、`conclusion_category`、`iteration_signal` | 改成自定义字段名 |
| 方向信号 | 表达方向提示 | 写成任务创建、优先级、排序、implementation planning 或执行决定 |
| 不确定性 | 放进 `open_questions` | 自行补写 README 意图 |

## 与 Coordinator 的边界

这个 skill 可以：

- 说明 README 与基线是否有差距。
- 说明差距更像 README 超前、基线超前、口径歧义还是事实冲突。
- 输出 `iteration_signal` 供 Coordinator 判断下一轮方向。

这个 skill 不得：

- 跨进 task creation。
- 跨进 priority、ordering 或并行策略判断。
- 跨进 implementation planning。
- 跨进 execution decision，例如直接决定实现什么、先做什么、是否立刻执行。

## 明确禁止

- 不得把 baseline 解释为 Task Spec 的历史基线或旧 commit。
- 不得把 README 超前自动等同于“立刻创建任务执行”。
- 不得把基线超前自动等同于“README 必须立刻修改”。
- 不得因为发现 gap，就直接扩展成 task creation、priority、ordering、implementation planning 或 execution decisions。
- 不得把 `iteration_signal` 写成任务列表、排期建议、执行命令或实现方案。

## 常见误用

| 误用 | 正确处理 |
| --- | --- |
| 把 baseline 读成历史 commit | 只看最新 `origin/main` 的已合并事实 |
| 看到 gap 就直接创建任务或安排先后顺序 | 只输出 `iteration_signal`，把调度交回 Coordinator |
| 无法稳定核对时擅自补写 README 意图 | 标为 `ambiguous`，并写入 `open_questions` |

## 推荐输出骨架

```text
scope:
- README 的哪些章节或声明被评估

claim_checks:
- claim: <README 声明>
  status: aligned | readme_ahead | baseline_ahead | ambiguous | conflicted
  evidence:
  - <最新 origin/main 基线事实>
  note: <简短说明>

conclusion_category: <allowed value>
iteration_signal: <allowed value>
gap_summary: <1-3 句总结>
open_questions:
- <若无则为空>
```

## 示例

### 示例 1：README 领先于当前基线

- README 写道：AIM 的目标形态是独立部署的 server 与独立 GUI。
- 最新 `origin/main` 只展示了相关模块入口与逐步落地痕迹，还不能证明这些目标形态已完整落地。

结论应偏向：

- `conclusion_category = readme_ahead`
- `iteration_signal = continue_toward_readme`

这里可以表达 README 领先于实现，但不能替 Coordinator 决定先做 server 还是 GUI。

### 示例 2：README 口径需要澄清

- README 若写成“系统已经足够智能地自动推进所有工作”。
- 最新 `origin/main` 没有明确、可核对的自动推进边界定义，也缺少稳定验收口径。

结论应偏向：

- `conclusion_category = ambiguous`
- `iteration_signal = clarify_readme`

这里应暴露需要澄清的口径，而不是直接决定补哪个功能。

## 自检口径

- 是否把 baseline 明确限定为最新 `origin/main`。
- 是否明确把评估对象限定为 README claims，而不是泛化成项目方向判断。
- 是否始终使用 `claim_checks`、`conclusion_category`、`iteration_signal` 这组输出语义。
- 是否只使用五个允许的 `conclusion_category` 与固定 `iteration_signal` 映射。
- 是否把所有方向表达限制在 direction hint，而不是任务编排或执行决定。
- 是否明确拦住 task creation、priority、ordering、implementation planning 和 execution decisions。
- 是否明确拦住通过示例夹带 task creation、scheduling 或 execution-order decisions。
