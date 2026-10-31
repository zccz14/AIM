# @aim-ai/web

## 0.1.0

### Minor Changes

- bd329a7: 建立 CZ-Stack 首版 contract、API、Web 与 CLI 模块基线，并补齐统一测试、CI 与 release-aware workflow 入口。
- 7eb3210: Add Project CRUD API contract, routes, and GUI management flow.
- e9a9fd2: Add persisted project-level optimizer enablement.

### Patch Changes

- 57c7c84: Derive Task lifecycle state from bound OpenCode session state and replace Task pending vocabulary across API, contract, CLI, and web surfaces.
- 814a1a5: Surface current baseline freshness for AIM Dimension evaluations in the Director dashboard.
- ea8e2f8: Filter Director clarification lists by dimension_id when a dimension-scoped panel requests clarification context.
- b204707: Add GUI controls for resolving and reopening Director clarification requests.
- a717a62: Improve critical error recovery guidance with sensitive-detail redaction for task and optimizer failure paths.
- bd329a7: 将 contract 包切换为 OpenAPI-first 单一事实源，生成并稳定导出类型、客户端与运行时校验能力，同时同步更新 API、Web 与 CLI 对新的 contract 边界的接入方式。
- 2870335: Add the AIM optimizer control plane API and dashboard header switch for starting, stopping, and observing the scheduler-backed optimizer runtime.

  Extend optimizer status with event orchestration telemetry and gate task-resolved scheduler scans behind the running optimizer runtime.

- f0566cf: Surface bounded recent project optimizer lane events in status API and Project detail UI.
- ee6ee43: Treat project ids as UUID values across API persistence, contract validation, CLI fixtures, and web contract fixtures while keeping project paths as path lookup keys.
- df0a212: Finish project origin identity migration follow-up gaps across API lane startup, packaged skills, and web dashboard copy.
- bc578cc: Remove the global optimizer start/status/stop API contract and dashboard header controls so optimizer enablement remains project-scoped.
- f0f9a7f: Simplify the project optimizer status contract to omit obsolete runtime event fields.
- a0cb6bc: 精简 Task status contract，仅保留 pending、resolved 和 rejected 三种状态。
- eee70e8: 展示 Task 源基线新鲜度，帮助 Director 区分当前、陈旧和未知来源基线。
- Updated dependencies [d80e2b6]
- Updated dependencies [64bafbb]
- Updated dependencies [5403e23]
- Updated dependencies [539e171]
- Updated dependencies [5369829]
- Updated dependencies [9ae1da5]
- Updated dependencies [e58090b]
- Updated dependencies [7cdc5a1]
- Updated dependencies [78547f7]
- Updated dependencies [57c7c84]
- Updated dependencies [814a1a5]
- Updated dependencies [55102bd]
- Updated dependencies [ea8e2f8]
- Updated dependencies [b204707]
- Updated dependencies [79fb3e9]
- Updated dependencies [89175f0]
- Updated dependencies [89ce96a]
- Updated dependencies [bd329a7]
- Updated dependencies [bd329a7]
- Updated dependencies [7b9d303]
- Updated dependencies [745fe7a]
- Updated dependencies [e672d95]
- Updated dependencies [89e8a8c]
- Updated dependencies [2fb2583]
- Updated dependencies [6ddc26d]
- Updated dependencies [dd4a4c2]
- Updated dependencies [d72320e]
- Updated dependencies [2c6d4d7]
- Updated dependencies [2e5e3b1]
- Updated dependencies [4557978]
- Updated dependencies [2870335]
- Updated dependencies [f0566cf]
- Updated dependencies [b9b961c]
- Updated dependencies [8efbfd4]
- Updated dependencies [23de9fc]
- Updated dependencies [2d3bbf3]
- Updated dependencies [7eb3210]
- Updated dependencies [147a737]
- Updated dependencies [df550b7]
- Updated dependencies [ee6ee43]
- Updated dependencies [e9a9fd2]
- Updated dependencies [e9526b9]
- Updated dependencies [ab6b95a]
- Updated dependencies [1bd0a63]
- Updated dependencies [ff819fd]
- Updated dependencies [317f988]
- Updated dependencies [a538629]
- Updated dependencies [ffd800f]
- Updated dependencies [bc578cc]
- Updated dependencies [874537e]
- Updated dependencies [e4aa432]
- Updated dependencies [4278b38]
- Updated dependencies [f0f9a7f]
- Updated dependencies [a0cb6bc]
- Updated dependencies [d4b7667]
- Updated dependencies [eee70e8]
  - @aim-ai/contract@0.1.0
