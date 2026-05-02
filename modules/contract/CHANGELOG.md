# @aim-ai/contract

## 0.1.0

### Minor Changes

- 5403e23: 为 Task 增加持久化 `result` 字段与 `/tasks/{taskId}/resolve`、`/tasks/{taskId}/reject` 终态接口，并同步更新打包生命周期技能文档以匹配新的终态上报方式。
- bd329a7: 将 contract 包切换为 OpenAPI-first 单一事实源，生成并稳定导出类型、客户端与运行时校验能力，同时同步更新 API、Web 与 CLI 对新的 contract 边界的接入方式。
- bd329a7: 建立 CZ-Stack 首版 contract、API、Web 与 CLI 模块基线，并补齐统一测试、CI 与 release-aware workflow 入口。
- 7eb3210: Add Project CRUD API contract, routes, and GUI management flow.
- e9a9fd2: Add persisted project-level optimizer enablement.
- ab6b95a: Add project-scoped task creation with global provider/model configuration.

### Patch Changes

- d80e2b6: 新增 Task 字段级更新接口，支持单独更新 worktree_path、pull_request_url 和 dependencies，并同步 Developer Guide 示例。
- 64bafbb: Align dimension CRUD and evaluation APIs with README dimension semantics.
- 539e171: 新增只读 Dimension 与 Dimension evaluation CLI 查询入口，复用现有 dimensions contract client 端点。
- 5369829: 新增只读 Task PR follow-up status CLI 查询入口，复用现有 pull_request_status contract client 端点。
- 9ae1da5: Add coordinate CRUD and append-only coordinate evaluation APIs.
- e58090b: Add a read-only CLI command for Coordinator proposal dry-run requests.
- 7cdc5a1: Expose a read-only Coordinator proposal dry-run API and contract so Coordinators can preflight task batch proposals without writing tasks.
- 78547f7: Add a `GET /db/sqlite` endpoint that downloads the current AIM SQLite database file and publish its OpenAPI contract.
- 57c7c84: Derive Task lifecycle state from bound OpenCode session state and replace Task pending vocabulary across API, contract, CLI, and web surfaces.
- 814a1a5: Surface current baseline freshness for AIM Dimension evaluations in the Director dashboard.
- 55102bd: Add the director clarification API contract and persistence route so projects can record clarification questions and answers.
- ea8e2f8: Filter Director clarification lists by dimension_id when a dimension-scoped panel requests clarification context.
- b204707: Add GUI controls for resolving and reopening Director clarification requests.
- 79fb3e9: Add a Director clarification status patch endpoint and typed contract client helper.
- 89175f0: Allow Coordinator dry-run task pool inputs to carry top-level worktree and pull request artifact fields.
- 89ce96a: Add project_id filtering to task list APIs and CLI query mapping.
- 7b9d303: 移除 SQLite-backed manager_reports 服务端资源方向；Manager 评估信号改由 dimensions 与 dimension_evaluations 表达。
- 745fe7a: 补齐无 PR pending Task 的恢复分类，区分待分配、stale session、已建 worktree 和需继续开发状态。
- e672d95: Add explicit OpenCode session continuation endpoints for startup recovery pushes.
- 89e8a8c: Add OpenCode session promise persistence, API routes, and plugin continuation/settlement hooks.
- 2fb2583: Align OpenCode session manager boundaries and settlement validation.
- 6ddc26d: Persist OpenCode session title and project ownership metadata.
- dd4a4c2: Add OpenCode session list, prompt recovery, and task session observability API surfaces.
- d72320e: Require OpenCode sessions to reference an existing project.
- 2c6d4d7: Add OpenCode session runtime safety guards for duplicate idle continuations, idempotent settlement, and stale pending visibility.
- 2e5e3b1: Add an OpenCode session token usage refresh endpoint that recomputes and overwrites stored token summaries for one session.
- 4557978: Persist OpenCode session token usage summaries on terminal settlement.
- 2870335: Add the AIM optimizer control plane API and dashboard header switch for starting, stopping, and observing the scheduler-backed optimizer runtime.

  Extend optimizer status with event orchestration telemetry and gate task-resolved scheduler scans behind the running optimizer runtime.

- f0566cf: Surface bounded recent project optimizer lane events in status API and Project detail UI.
- b9b961c: Run the optimizer as default-on Manager, Coordinator, and Developer lanes with per-lane status instead of a static task producer.
- 8efbfd4: Expose a conservative project optimizer token usage summary through the status contract and CLI.
- 23de9fc: Require Coordinator planning evidence for task batch creates and delete rationale for batch deletes.
- 2d3bbf3: 新增 Task PR 跟进状态分类接口，返回常见 checks、review、mergeability、auto-merge 与 merged-but-unresolved 状态的恢复建议。
- 147a737: Add a read-only project detail endpoint and contract client method.
- df550b7: Persist projects by git origin URL and derive AIM-managed workspaces by project id.
- ee6ee43: Treat project ids as UUID values across API persistence, contract validation, CLI fixtures, and web contract fixtures while keeping project paths as path lookup keys.
- e9526b9: Add project-scoped optimizer runtime observability so clients can read config enablement separately from runtime activity.
- 1bd0a63: Enforce cumulative Director-granted project token budgets before starting optimizer or developer work.
- ff819fd: Add optional project token and cost warning thresholds with stable project usage budget warning status.
- 317f988: Add a read-only project token usage API and contract endpoint for aggregating OpenCode session token and cost usage by project, task, and session.
- a538629: 将 AIM CLI 调整为可发布的全局安装包边界，使用稳定的 `aim` bin 入口，并补充打包安装验证与安装文档。
- ffd800f: Remove externally callable OpenCode session continuation routes and contract exports.
- bc578cc: Remove the global optimizer start/status/stop API contract and dashboard header controls so optimizer enablement remains project-scoped.
- 874537e: Remove externally callable OpenCode session creation routes and contract exports.
- e4aa432: Remove task-level developer model fields and derive task session model metadata from the project global model configuration.
- 4278b38: Remove the legacy `/tasks/{taskId}/resolve` and `/tasks/{taskId}/reject` API routes from the server and public contract so terminal completion flows through OpenCode session resolve/reject only.
- f0f9a7f: Simplify the project optimizer status contract to omit obsolete runtime event fields.
- a0cb6bc: 精简 Task status contract，仅保留 pending、resolved 和 rejected 三种状态。
- d4b7667: 收敛包级 `test` 与 `build` 的职责边界，让默认测试不再隐式执行本包产物构建，并将依赖已构建产物的校验前置到对应测试准备阶段。
- eee70e8: 展示 Task 源基线新鲜度，帮助 Director 区分当前、陈旧和未知来源基线。
