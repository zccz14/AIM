# Manager 评估信号

## 定位

Manager 评估信号不是一等持久化资源。AIM 当前把 Manager 的评估拆解为两类服务端事实：`dimensions` 保存评估维度定义，`dimension_evaluations` 保存每次针对维度的评分、说明和证据。

Coordinator 后续维护 Task Pool 时，应从这些维度定义与评估记录派生方向信号，而不是读取、创建或引用独立的 `manager_reports` 资源。

## 可观察入口

- 维度定义：`POST /dimensions`、`GET /dimensions?project_path=...`、`GET /dimensions/{dimensionId}`、`PATCH /dimensions/{dimensionId}`、`DELETE /dimensions/{dimensionId}`。
- 维度评估：`POST /dimensions/{dimensionId}/evaluations`、`GET /dimensions/{dimensionId}/evaluations`。
- Coordinator 写入意图：当评估信号需要转为 Task Pool 维护候选时，继续使用 `aim-coordinator-guide` 中的 `POST /tasks/batch` operations 审批边界。

## 必要语义

一次 Manager 评估应至少在维度与评估记录中表达：

- `baseline_ref` 或等价证据：被评估的最新 `origin/main` 基线认知；无法取得精确 commit 时必须说明限制。
- README 目标摘要：只总结 README 已表达的目标，不补写 README 未承诺的目标。
- `dimensions`：本轮评估维度，每个维度说明目标、重要性和评估方法。
- `dimension_evaluations`：针对最新 baseline 的分数、定性评估、证据与限制。
- 差距分析：README 目标与最新基线在各维度上的差距、一致、冲突、歧义或前提缺口。
- 迭代方向：给 Coordinator 的方向信号，只表达推进方向、原因和非目标。
- Coordinator handoff：Coordinator 后续维护 Task Pool 时应关注的差距、冲突、依赖或等待澄清点。

## 边界

Manager 评估信号可以作为 Coordinator 的输入，但不能替代 Coordinator 审批或 Task 写入流程。

Manager 评估信号不得：

- 作为独立 `manager_reports` API、SQLite 表、CLI 命令或 Web 资源存在。
- 写成仓库 Markdown 文件并要求 Coordinator 从仓库文件读取。
- 直接创建、删除或修改 Task。
- 调用或要求逐条调用 `POST /tasks`。
- 输出已批准的 Developer Task Spec。
- 绕过 `POST /tasks/batch` operations 的人工审批、`aim-verify-task-spec` 校验或原子写入边界。
- 绕过服务端 API 直接访问 SQLite。

Coordinator 可以把 Manager 评估信号转化为 `POST /tasks/batch` 候选写入意图，但该转换必须继续遵守 `aim-coordinator-guide`：候选 `create` / `delete` 只有在批准后才进入后续验证与原子写入流程。
