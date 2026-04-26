# @aim-ai/cli

## 0.1.0

### Minor Changes

- bd329a7: 建立 CZ-Stack 首版 contract、API、Web 与 CLI 模块基线，并补齐统一测试、CI 与 release-aware workflow 入口。

### Patch Changes

- bd329a7: 将 contract 包切换为 OpenAPI-first 单一事实源，生成并稳定导出类型、客户端与运行时校验能力，同时同步更新 API、Web 与 CLI 对新的 contract 边界的接入方式。
- 7b9d303: 新增 SQLite-backed Manager Report 服务端资源、OpenAPI contract 与 CLI API 消费入口。
- 8f21d85: 将 CLI 包声明为公开 npm 发布，避免 scoped package 发布时被 npm 默认按私有包处理。
- a538629: 将 AIM CLI 调整为可发布的全局安装包边界，使用稳定的 `aim` bin 入口，并补充打包安装验证与安装文档。
- a0cb6bc: 精简 Task status contract，仅保留 processing、resolved 和 rejected 三种状态。
- 4fbd31f: 新增 Coordinator Task Write Bulk 审批前资源的持久化 API、契约与 CLI create/list/get 入口。
- Updated dependencies [d80e2b6]
- Updated dependencies [64bafbb]
- Updated dependencies [5403e23]
- Updated dependencies [9ae1da5]
- Updated dependencies [bd329a7]
- Updated dependencies [bd329a7]
- Updated dependencies [bd329a7]
- Updated dependencies [7b9d303]
- Updated dependencies [28a652a]
- Updated dependencies [2870335]
- Updated dependencies [b9b961c]
- Updated dependencies [4241f99]
- Updated dependencies [a538629]
- Updated dependencies [77dfd8d]
- Updated dependencies [4e0cb33]
- Updated dependencies [e2db6fc]
- Updated dependencies [a0cb6bc]
- Updated dependencies [d4b7667]
- Updated dependencies [4fbd31f]
- Updated dependencies [94025b4]
  - @aim-ai/api@1.0.0
  - @aim-ai/contract@0.1.0
