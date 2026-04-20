# `aim-task-lifecycle` 技能终态 curl 指引迁移设计

## 背景 / 目标

当前 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md` 已经同时描述了两类上报行为：

1. 通过 `PATCH /tasks/${task_id}` 持续同步非终态生命周期事实。
2. 通过 `POST /tasks/${task_id}/resolve` 与 `POST /tasks/${task_id}/reject` 上报终态结果。

现有文案虽然已经给出三种接口，但“status update”这一说法仍容易把非终态状态更新与终态结果上报混在一起，读者可能误以为成功/失败也属于普通 PATCH 状态更新的一部分。本次设计的目标是做一次最小范围的技能文案整理，把语义边界写清楚：

1. `PATCH /tasks/${task_id}` 只用于非终态生命周期更新。
2. `POST /tasks/${task_id}/resolve` 与 `POST /tasks/${task_id}/reject` 只用于终态结果上报。
3. 文中出现的“状态更新”或近义表达，必须明确指向非终态更新，避免与 resolve/reject 混淆。

## 范围

本次只调整 `aim-task-lifecycle` 技能文案，且只做与终态 curl 指引迁移相关的最小改写：

1. 强化“非终态更新”和“终态结果上报”的术语区分。
2. 把终态行为明确表述为 `POST /resolve` 与 `POST /reject`，而不是 PATCH 的延伸示例。
3. 检查技能中的规则、示例和约束描述，确保它们与上述边界一致。

## 非范围

本次不包含以下内容：

1. 不修改任何服务端接口、数据模型、OpenAPI 或实现代码。
2. 不新增、删除或重命名生命周期状态。
3. 不改变非终态仍通过 `PATCH /tasks/${task_id}` 上报这一既有约定。
4. 不扩展为新的任务生命周期设计，也不重写整份技能结构。
5. 不在本次 spec 阶段直接修改 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`。

## 设计决策

### 1. 用“非终态生命周期更新”指代 PATCH 路径

技能内凡是描述 `PATCH /tasks/${task_id}` 的地方，都应把它表述为对非终态事实的同步，而不是泛称“所有状态更新”。这样可以把 `running`、`waiting_assumptions`、`outbound`、`pr_following`、`closing` 明确归到同一类行为里。

### 2. 用“终态结果上报”指代 resolve / reject 路径

技能内凡是描述 `succeeded` 与 `failed` 的地方，都应强调这不是继续 PATCH 一个最终 `status`，而是通过两个专用 POST 端点完成终态写入，并在请求体中提供非空 `result`。文案重点应落在“结果上报”而不是“再次做一次状态更新”。

### 3. 保持现有结构，做最小必要改字

本次不重排整份技能，只在容易造成歧义的段落做定向修正，例如环境说明、必报时点、API 调用格式、示例标题和规则段。这样可以降低文档迁移成本，也避免在一次小型 docs 调整中引入额外措辞漂移。

### 4. 示例与规则必须使用同一术语体系

若规则段落说“非终态 PATCH、终态 POST”，示例标题和总结性规则也必须保持一致，避免出现“状态更新示例”却实际展示 `POST /resolve` 的情况。最终文案应让读者能一眼区分：哪些是持续中的状态同步，哪些是任务结束时的结果报告。

## 影响文件

1. `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`

## 验证方式

本次为文档迁移，验证以静态校对为主：

1. 通读目标技能文档，确认所有 `PATCH /tasks/${task_id}` 的描述都落在非终态语境。
2. 确认所有成功/失败终态描述都指向 `POST /tasks/${task_id}/resolve` 或 `POST /tasks/${task_id}/reject`，且不再被称为普通“状态更新”。
3. 交叉检查环境、必报时点、API 调用格式、示例标题、规则段，确认术语一致，没有一处仍把 resolve/reject 混写成 PATCH 生命周期更新。

## Risks

1. 若改字过少，仍可能保留“status update”一类模糊表达，导致读者继续误解终态上报路径。
2. 若改字过多，可能意外改变技能原本强调的生命周期纪律，超出这次最小文档迁移范围。
3. 若只改示例不改规则，或只改规则不改时点说明，文档内部会出现术语不一致，反而增加理解成本。
