# Manager Report 产品落点

## 定位

`Manager Report` 是 AIM Manager 在产品内交接给 Coordinator 的最小方向资源。它把 README 目标、最新 `origin/main` 基线事实、可观测性资料、当前 Task Pool 与 rejected Task 反馈，收敛成一份可发现、可阅读、可引用的服务端持久化记录。

Manager Report 的 Markdown 结构仍用于表达关键评估内容，但 Markdown 是 SQLite `manager_reports` 表中的 `content_markdown` 字段，不是写入仓库的 Markdown 文件。`project_path` 标识被评估项目，`report_id` 标识同一项目下的一次评估结果。

## 可观察入口

当前最小入口是服务端 Manager Report 资源，并可由 CLI 通过服务端 API 创建、查询和读取：

- 创建入口：`POST /manager_reports`
- 查询入口：`GET /manager_reports?project_path=...`
- 读取入口：`GET /manager_reports/{reportId}?project_path=...`
- CLI 入口：`aim manager-report create|list|get`，且 CLI 只能作为 API 消费者，不直接读写 SQLite。
- 交接方式：Coordinator 读取服务端资源，并在需要维护 Task Pool 时进入 `aim-coordinator-guide` 与 `docs/task-write-bulk.md`。

因此，一份输出只有同时满足“由 Manager 评估语境产生”“使用 `Manager Report` 结构”“面向 Coordinator handoff”“不直接写 Task Pool”时，才应被视为 AIM 的 Manager Report。普通分析回复、README claim 核对结果、Coordinator `Task Write Bulk` 或 Developer 任务执行报告都不是 Manager Report。

## 必要语义

一份 Manager Report 必须至少表达以下语义：

- `baseline_ref`：被评估的最新 `origin/main` 基线认知；无法取得精确 commit 时必须说明限制。
- `readme_target_summary`：README 已表达目标的摘要，不补写 README 未承诺的目标。
- `coordinate_system`：本轮评估坐标系，以及每个坐标为什么覆盖 README 目标。
- `baseline_facts`：可追溯事实，区分 README、代码、文档、测试、Issue、Task、rejected Task 或可观测性来源。
- `gap_analysis`：README 目标与最新基线在各坐标上的差距、一致、冲突、歧义或前提缺口。
- `iteration_direction`：给 Coordinator 的方向信号，只表达推进方向、原因和非目标。
- `coordinator_handoff`：Coordinator 后续维护 Task Pool 时应关注的差距、冲突、依赖或等待澄清点。
- `open_questions`：只有 README 目标不清晰且阻止稳定评估时，才给 Director 的澄清问题。
- `confidence_and_limits`：当前判断的可信度、证据缺口和边界。

## 边界

Manager Report 可以作为 Coordinator 的输入，但不能替代 Coordinator 审批或 Task 写入流程。

Manager Report 不得：

- 写成仓库 Markdown 文件，或要求 Coordinator 从仓库 Markdown 文件读取。
- 直接创建、删除或修改 Task。
- 调用或要求调用 `POST /tasks`。
- 输出已批准的 Developer Task Spec。
- 绕过 `Task Write Bulk` 的人工审批、`aim-verify-task-spec` 校验或 `aim-create-tasks` 创建边界。
- 绕过服务端 API 直接访问 SQLite。

Coordinator 可以把 Manager Report 中的差距与方向信号转化为 `Task Write Bulk` 候选写入意图，但该转换必须继续遵守 `docs/task-write-bulk.md`：候选 `Create` / `Delete` 只有在批准后才进入后续验证与写入流程。

## 后续演进边界

后续可以把 Manager Report 进一步接入 GUI 展示、Coordinator 自动消费或更完整的 Manager 生成流程，但这些演进需要单独定义契约。本文件只固定当前最小服务端资源、SQLite 持久化与 CLI API 消费边界，不引入后台调度器或自动 Task 写入协议。
