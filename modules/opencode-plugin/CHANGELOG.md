# @aim-ai/opencode-plugin

## 0.1.0

### Minor Changes

- 943a2ed: 新增 `aim-create-tasks` 打包技能，补充静态文档范围说明，并用测试锁定打包内容与修订循环约束。
- e6c75e2: 新增 `aim-evaluate-readme` 打包技能，补充 README 发现入口，并用测试锁定技能打包与评估输出边界。
- 67af206: 新增 `aim-test-driven-development` 打包技能，对齐 Superpowers TDD 纪律，补充 Mermaid 流程图与反合理化约束，并同步更新插件打包测试基线。
- 721830a: 新增 `aim-ask-strategy` 打包技能，补充 README-first 问策约束、发现入口与插件打包测试覆盖。
- 0d840fa: 新增 OpenCode plugin 包骨架，打包分发 `skills/` 与 `agents/` 静态资源，并在运行时把随包技能目录注册到 `config.skills.paths`。
- 0be2189: 新增 `aim-task-lifecycle` 打包技能，补充静态文档范围说明，并用测试锁定打包与生命周期报告契约。
- 23f1f7b: 新增 `aim-setup-github-repo` 打包技能，补充打包文档范围说明，并用测试锁定技能打包与文档内容。

### Patch Changes

- d80e2b6: 新增 Task 字段级更新接口，支持单独更新 worktree_path、pull_request_url 和 dependencies，并同步 Developer Guide 示例。
- 083e5e3: 修复 aim-create-tasks skill 的 Task 创建说明，使其包含当前 Task Schema 要求的标题与开发模型字段。
- afb409b: Add AIM test-writing skill guidance and package discovery wiring.
- 5403e23: 为 Task 增加持久化 `result` 字段与 `/tasks/{taskId}/resolve`、`/tasks/{taskId}/reject` 终态接口，并同步更新打包生命周期技能文档以匹配新的终态上报方式。
- 7fe333e: 移除模糊的精确 test 脚本入口，并让 build 脚本显式执行插件包的构建与校验语义。
- 03a0ae1: 移除打包分发的占位 skill，将 `aim-task-lifecycle` 翻译为中文，并同步对齐插件文档与打包测试校验。
- d50b018: 更新 `aim-task-lifecycle` 技能文档，明确单任务在 worktree、PR、follow-up 与 closing 阶段的生命周期映射及仓库约束。
- 124c998: 更新 PR 跟进文档，补充 required checks watch 与 Linear History Rule update 指引。
- 70f9451: 扩展 aim-ask-strategy skill 的边界说明，使其覆盖执行前的方向收敛、开放题与设计类收敛场景，同时明确与 `aim-verify-task-spec` 的分工。
- 26f3da3: 修复 aim-developer-guide skill 中缺失的 API 调用规则与失败处理文本，使其与已有测试断言对齐。
- f5ff084: 更新打包的 `aim-create-tasks` skill 指引，补充中文五段式 Task Spec 语义、独立 `aim-verify-task-spec` 校验要求，以及多候选并行校验约束。
- 6050f52: Allow package test scripts to noop when SKIP_TEST is set during deployment builds.
- dab0d09: Align the plugin package's public build script with the repo-wide build and test contract.
- 858b9ad: 更新 `aim-manager-guide` packaged skill，使 AIM Manager 使用 Dimension 语义并补充 Dimension CRUD 与 evaluation API 示例。
- 8e34919: 更新 `aim-manager-guide` packaged skill，使 AIM Manager 的角色边界、坐标系维护和维度评估输出与 README 保持一致。
- 37f82ee: 新增 `aim-manager-guide` packaged skill，提供 AIM Manager 的 Manager Report 输出结构、方向判断边界与 Coordinator handoff 指南。
- 2d76aaa: 补充 Manager Report 产品落点文档，并明确 packaged `aim-manager-guide` 的可观察入口与 Coordinator handoff 边界。
- 7b9d303: 新增 SQLite-backed Manager Report 服务端资源、OpenAPI contract 与 CLI API 消费入口。
- 89df351: 重写 aim-developer-guide 技能入口说明，并更新打包技能 README 对该技能职责范围的描述。
- 5a1c982: Clarify `using-aim` skill routing so `aim-ask-strategy` acts as the broader front-door router while direct-entry AIM workflows stay explicit.
- 45b850f: 更新 `aim-task-lifecycle` skill，要求通过 `GET /tasks/{task_id}/spec` 读取 Task Spec，并明确禁止回退到本地 `.aim/task-specs` 文件。
- 0d1347e: 新增 `aim-coordinator-guide` packaged skill，提供 Coordinator Task Pool 维护与 Task Write Bulk 输出指南。
- 1296d95: Prevent opencode-plugin tests from building package artifacts implicitly.
- 48831de: 澄清打包的 `aim-task-lifecycle` 技能终态结果上报文案，并同步对齐插件打包测试断言。
- a0cb6bc: 精简 Task status contract，仅保留 processing、resolved 和 rejected 三种状态。
- b256374: 新增 `using-aim` 打包技能，并更新技能索引与插件 README，使打包文档范围与技能使用约束保持一致。
- d4b7667: 收敛包级 `test` 与 `build` 的职责边界，让默认测试不再隐式执行本包产物构建，并将依赖已构建产物的校验前置到对应测试准备阶段。
- a61717e: 将打包技能从 `aim-task-lifecycle` 重命名为 `aim-developer-guide`，并同步更新插件分发文档与相关断言。
- 7954d5f: Document the Coordinator Task Write Bulk review contract and reference it from the Coordinator skill.
- 8fd186a: 新增打包分发的 `aim-verify-task-spec` 中文 skill，并补充插件包内 skills 清单与对应打包内容校验。
- a99c520: 扩大 aim-ask-strategy 的 packaged discovery 文案入口，并同步收敛 using-aim、skills 索引、包 README 与相关测试断言。
