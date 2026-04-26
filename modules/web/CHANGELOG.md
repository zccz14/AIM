# @aim-ai/web

## 0.1.0

### Minor Changes

- bd329a7: 建立 CZ-Stack 首版 contract、API、Web 与 CLI 模块基线，并补齐统一测试、CI 与 release-aware workflow 入口。

### Patch Changes

- bd329a7: 将 contract 包切换为 OpenAPI-first 单一事实源，生成并稳定导出类型、客户端与运行时校验能力，同时同步更新 API、Web 与 CLI 对新的 contract 边界的接入方式。
- 2870335: Add the AIM optimizer control plane API and dashboard header switch for starting, stopping, and observing the scheduler-backed optimizer runtime.

  Extend optimizer status with event orchestration telemetry and gate task-resolved scheduler scans behind the running optimizer runtime.

- a0cb6bc: 精简 Task status contract，仅保留 processing、resolved 和 rejected 三种状态。
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
