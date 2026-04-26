# @aim-ai/api

## 1.0.0

### Major Changes

- bd329a7: 移除 `@aim-ai/api` 内置的 `/docs` 文档页面，仅保留 `/openapi.json` 作为协议导出入口，并同步收紧测试与仓库文档边界。

### Minor Changes

- 5403e23: 为 Task 增加持久化 `result` 字段与 `/tasks/{taskId}/resolve`、`/tasks/{taskId}/reject` 终态接口，并同步更新打包生命周期技能文档以匹配新的终态上报方式。
- bd329a7: 建立 CZ-Stack 首版 contract、API、Web 与 CLI 模块基线，并补齐统一测试、CI 与 release-aware workflow 入口。

### Patch Changes

- d80e2b6: 新增 Task 字段级更新接口，支持单独更新 worktree_path、pull_request_url 和 dependencies，并同步 Developer Guide 示例。
- 64bafbb: Align dimension CRUD and evaluation APIs with README dimension semantics.
- 9ae1da5: Add coordinate CRUD and append-only coordinate evaluation APIs.
- bd329a7: 将 contract 包切换为 OpenAPI-first 单一事实源，生成并稳定导出类型、客户端与运行时校验能力，同时同步更新 API、Web 与 CLI 对新的 contract 边界的接入方式。
- 7b9d303: 新增 SQLite-backed Manager Report 服务端资源、OpenAPI contract 与 CLI API 消费入口。
- 28a652a: Task Resolve 现在会要求存在 pull_request_url，并通过 gh 确认对应 PR 已合并后才允许成功。
- 2870335: Add the AIM optimizer control plane API and dashboard header switch for starting, stopping, and observing the scheduler-backed optimizer runtime.

  Extend optimizer status with event orchestration telemetry and gate task-resolved scheduler scans behind the running optimizer runtime.

- b9b961c: Run the optimizer as default-on Manager, Coordinator, and Developer lanes with per-lane status instead of a static task producer.
- 4241f99: 澄清任务继续提示中的最终状态上报要求，明确需要向 AIM API Server 报告 resolved 或 rejected 结果。
- a538629: 将 AIM CLI 调整为可发布的全局安装包边界，使用稳定的 `aim` bin 入口，并补充打包安装验证与安装文档。
- 77dfd8d: Refill an empty AIM Task Pool from the running optimizer loop so the optimizer keeps producing follow-up tasks.
- 4e0cb33: Sort resolve-triggered scheduler scans by task dependency hints within existing session priority groups.
- e2db6fc: Prioritize unfinished tasks with continuable task sessions during scheduler scans.
- a0cb6bc: 精简 Task status contract，仅保留 processing、resolved 和 rejected 三种状态。
- d4b7667: 收敛包级 `test` 与 `build` 的职责边界，让默认测试不再隐式执行本包产物构建，并将依赖已构建产物的校验前置到对应测试准备阶段。
- 4fbd31f: 新增 Coordinator Task Write Bulk 审批前资源的持久化 API、契约与 CLI create/list/get 入口。
- 94025b4: Trigger an in-process scheduler scan opportunity after successful task resolve.
- Updated dependencies [d80e2b6]
- Updated dependencies [64bafbb]
- Updated dependencies [5403e23]
- Updated dependencies [9ae1da5]
- Updated dependencies [bd329a7]
- Updated dependencies [bd329a7]
- Updated dependencies [7b9d303]
- Updated dependencies [2870335]
- Updated dependencies [b9b961c]
- Updated dependencies [a538629]
- Updated dependencies [a0cb6bc]
- Updated dependencies [d4b7667]
- Updated dependencies [4fbd31f]
  - @aim-ai/contract@0.1.0
