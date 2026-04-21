# `aim-evaluate-readme` 技能设计说明

## 背景 / 问题

AIM 的 README 承载目标状态表达，而当前仓库的最新 `origin/main` 基线承载已落地事实。Coordinator 需要持续判断两者之间的差距，才能决定下一轮迭代应沿哪个方向收敛。

如果缺少一个专门的 packaged skill，README 差距判断很容易出现以下漂移：

1. 把 README 当成纯愿景文案阅读，没有拆成可核对的声明。
2. 把“最新 `origin/main` 基线”误读成 Task Spec 里的历史基线概念。
3. 看到差距后直接替 Coordinator 决定创建任务、排优先级或安排执行顺序。
4. 只给出泛泛结论，不保留声明、证据、冲突点与不确定项，导致后续迭代方向不可复查。

因此需要新增 `aim-evaluate-readme`，把“README 声明与最新 `origin/main` 基线事实的差距评估”收敛成一个边界清晰的技能，服务于 Coordinator 的迭代方向判断，而不是调度或执行。

## 目标

1. 定义一个 packaged skill，用于评估 README 声明与最新 `origin/main` 基线事实之间的差距。
2. 明确这里的 baseline 只表示最新 `origin/main` 基线，而不是 Task Spec 的 `base_commit`、`spec_commit` 或其他历史快照概念。
3. 让输出可直接支持 Coordinator 判断“下一轮应继续逼近 README、先澄清 README，还是先把 README 与现状重新对齐”。
4. 明确输出字段使用 `iteration_signal`，不使用 `coordinator_signal`。
5. 强约束该技能只做评估与方向信号表达，不创建任务、不排期、不决定执行顺序。

## 非目标

1. 不负责创建 AIM Task，也不调用 `POST /tasks`。
2. 不负责给候选工作项排优先级、决定先做哪个、是否并行，或替代 Coordinator 做调度。
3. 不负责写 implementation plan、改代码、跑验证、跟进 PR。
4. 不负责把 README 改写成最终文案；它只指出差距与需要澄清之处。
5. 不负责把所有 README 内容都强行转译为可执行任务；无法稳定核对的声明应输出为歧义，而不是强行任务化。

## 方案定位

`aim-evaluate-readme` 是一个 README-to-baseline gap evaluation skill。

它的职责是：

1. 把 README 中与当前产品状态相关的内容拆成可核对声明。
2. 用最新 `origin/main` 的只读事实核对这些声明。
3. 把差距收敛成有限、可复查的结论类别。
4. 输出 `iteration_signal`，供 Coordinator 判断下一轮迭代方向。

它不是规划器、调度器，也不是任务创建器。`iteration_signal` 只能表达方向含义，不能表达任务编排含义。

## 输入

技能至少需要以下输入：

1. README 原文，或 README 中本次需要评估的相关章节。
2. 最新 `origin/main` 基线的只读事实，来源可包括代码、文档、配置、测试、接口契约与已合并产物。
3. 若可得，本次评估关注的范围提示，例如“先看系统形态”“先看 Task 生命周期”等，但该提示只能收窄观察面，不能改写 README 原意。

### 输入约束

1. 基线事实必须以最新 `origin/main` 为准。
2. 不得使用 Task Spec 的历史基线概念替代这里的 baseline。
3. 不得把未合并分支、个人草稿、进行中的 PR 视为当前基线事实。
4. 若 README 某段无法拆成可验证声明，应保留为歧义，不得擅自补全用户意图。

## 输出

输出应是一个结构化评估结果，至少包含：

1. `scope`: 本次评估覆盖的 README 范围。
2. `claim_checks`: 每条 README 声明的核对结果，包含声明文本、对应基线证据、判定与备注。
3. `conclusion_category`: 本次总体结论类别，只能取本设计定义的允许值。
4. `iteration_signal`: 供 Coordinator 使用的迭代方向信号，只能取本设计定义的允许值。
5. `gap_summary`: 对主要差距或主要一致性的简短总结。
6. `open_questions`: 仍需人类澄清或后续确认的问题列表；若没有，应为空列表。

输出重点是“声明 - 证据 - 结论 - 方向信号”的链路完整，而不是篇幅长。

## 评估流程

1. 先界定评估范围。
   若本次只评估 README 某一部分，先明确范围，避免把无关章节混入结论。
2. 提取 README 声明。
   把 README 内容拆成最小可核对声明，优先选择外部可观测、可被当前基线证实或证伪的说法。
3. 标记不可直接核对的内容。
   对纯价值宣言、远期愿景、修辞句或合并了多个含义的复合句，先拆分；仍无法稳定核对的，标为歧义。
4. 收集最新 `origin/main` 基线事实。
   只使用只读证据；优先看已存在的文档、接口、代码结构、测试与已合并行为。
5. 逐条比对声明与事实。
   对每条声明判断是已对齐、README 超前、README 滞后，还是因歧义/冲突暂时无法形成稳定对齐关系。
6. 汇总总体结论。
   根据主要差距形态收敛到一个 `conclusion_category`，并给出 `iteration_signal`。
7. 暴露不确定性。
   无法稳定判断时，应明确列出 `open_questions`，而不是自行补完调度决策。

## 允许的结论类别

`conclusion_category` 只能使用以下五类：

1. `aligned`
   README 关键声明与当前基线事实基本一致，没有发现会改变迭代方向的实质差距。
2. `readme_ahead`
   README 描述的能力、形态或约束尚未在当前基线落地，README 领先于实现。
3. `baseline_ahead`
   当前基线已经具备 README 未表达、或 README 仍未更新反映的事实，基线领先于 README。
4. `ambiguous`
   README 声明过于模糊、复合或缺少判定口径，当前无法稳定判断差距。
5. `conflicted`
   README 声明与当前基线事实存在直接冲突，且不能只靠“等后续自然推进”解释为暂时差距。

不得输出这五类之外的自定义标签。

### 总体结论聚合规则

当 `claim_checks` 内出现混合结果时，按以下顺序收敛总体结论：

1. 只要存在会阻断稳定方向判断的直接冲突，优先输出 `conflicted`。
2. 若没有直接冲突，但存在关键声明无法稳定判定，优先输出 `ambiguous`。
3. 若主要差距表现为 README 领先于实现，输出 `readme_ahead`。
4. 若主要差距表现为基线领先于 README，输出 `baseline_ahead`。
5. 只有关键声明整体无实质方向偏移时，才输出 `aligned`。

这里的“关键声明”指一旦成立或不成立，会改变 Coordinator 对下一轮迭代方向判断的声明，而不是措辞层面的轻微差异。

## `iteration_signal` 语义

`iteration_signal` 只表达“Coordinator 下一轮应重点看哪种方向信号”，不能表达任务、优先级或顺序。允许值如下：

1. `hold_alignment`
   用于 `aligned`。表示当前 README 没有给出新的方向偏移，Coordinator 不需要因为 README 评估结果而改变迭代方向。
2. `continue_toward_readme`
   用于 `readme_ahead`。表示 README 仍代表更前的目标状态，Coordinator 可以据此考虑继续向 README 逼近。
3. `consolidate_readme`
   用于 `baseline_ahead`。表示基线事实已经超出 README 当前表达，Coordinator 可以优先考虑把 README 与现状重新对齐。
4. `clarify_readme`
   用于 `ambiguous`。表示下一轮首先需要澄清 README 口径，否则后续方向判断不稳定。
5. `resolve_readme_conflict`
   用于 `conflicted`。表示 README 与基线之间存在需要 Coordinator 或人类明确裁决的冲突，不能直接把其中一方当作当然正确。

### 映射约束

1. `aligned -> hold_alignment`
2. `readme_ahead -> continue_toward_readme`
3. `baseline_ahead -> consolidate_readme`
4. `ambiguous -> clarify_readme`
5. `conflicted -> resolve_readme_conflict`

不得自由混用映射，避免同一结论被解释成不同方向。

## 与 Coordinator 的边界

本技能可以做：

1. 说明 README 与基线是否有差距。
2. 说明差距更像 README 超前、README 滞后、口径歧义还是事实冲突。
3. 输出 `iteration_signal` 供 Coordinator 判断下一轮方向。

本技能不得做：

1. 不得创建 Task。
2. 不得建议具体优先级，例如“先做 A 再做 B”。
3. 不得决定执行顺序、并行策略或资源分配。
4. 不得替 Coordinator 直接做“下一步就执行某项改动”的决策。
5. 不得把 `iteration_signal` 写成任务列表、排期建议或执行命令。

换言之，`iteration_signal` 是 direction hint，不是 scheduling decision。

## 明确禁止

1. 不得把这里的 baseline 解释为 Task Spec 的历史基线或某个旧 commit。
2. 不得把未合并变更、草稿 PR、个人工作区内容当成当前基线事实。
3. 不得因为 README 写得宏大，就跳过“能否拆成可核对声明”的步骤。
4. 不得因为发现差距，就直接扩展成 task creation、priority、ordering 或 implementation plan。
5. 不得因为某条声明暂时不好判断，就擅自替用户补写 README 意图。
6. 不得把“README 超前”自动等同于“立刻创建任务执行”。
7. 不得把“基线超前”自动等同于“README 必须立刻修改”；它只输出方向信号，不代替最终决策。

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

README 写道：

1. `AIM 的目标形态是一个独立部署的 server。`
2. `AIM 的目标形态是一个独立 GUI。`

当前最新 `origin/main` 基线可见事实是：

1. 仓库已有 `modules/api`、`modules/web`、`modules/cli` 等模块入口。
2. README 自己明确说明这些表面是目标产品形态，不应读成“都已完整落地”。

则评估结果应偏向：

1. `conclusion_category = readme_ahead`
2. `iteration_signal = continue_toward_readme`

原因是 README 表达的是目标产品形态，而当前基线仍处于逐步落地过程；这里可以得出“README 领先于实现”的方向信号，但不能直接据此生成任务或决定先做 server 还是 GUI。

### 示例 2：README 口径需要澄清

README 若写成“系统已经足够智能地自动推进所有工作”，但当前基线没有明确、可核对的自动推进边界定义，也缺少稳定验收口径，则应偏向：

1. `conclusion_category = ambiguous`
2. `iteration_signal = clarify_readme`

此时正确动作是暴露需要澄清的 README 口径，而不是替 Coordinator 决定补哪个功能。

## 自检口径

产出设计文档或未来编写 SKILL.md 时，应至少自检以下问题：

1. 是否把 baseline 明确限定为最新 `origin/main`。
2. 是否把评估对象写成 README 声明，而不是泛泛“项目方向”。
3. 是否把 `iteration_signal` 约束在方向语义，而非任务编排语义。
4. 是否给出了有限、封闭的 `conclusion_category` 与 `iteration_signal` 集合。
5. 是否明确列出禁止事项，防止技能侵入 Coordinator、Planner 或 task creation 边界。
6. 示例是否没有偷渡任务创建、排期或执行顺序决策。
