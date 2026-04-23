# 主题：关键边界与非目标

返回 [wiki 首页](../index.md)；相关页：[这个仓库是干啥的](./what-this-repo-is-for.md)、[当前基线与模块地图](./baseline-and-module-map.md)

## 来源事实

- README 明确非目标：不做面向所有研发流程的通用 Agent 平台，不优先服务 IDE 辅助体验，不把任务成功弱化为“代码写完”或“PR 已创建”。[来源摘要](../source-summary/root-readme.md)
- 调度文档明确：时间流逝不是调度信号，基线变化才是调度信号；`dependencies` 是软提示，不是硬门禁；Task 失败与 PR check 失败要区分。[来源摘要](../source-summary/scheduler.md)
- 架构文档明确：`contract` 是协议事实源，不得反向依赖应用层；仓库文档不能演化成第二份协议定义；SQLite-first 不是“永远只能 SQLite”。[来源摘要](../source-summary/architecture.md)
- OpenCode 插件边界是静态 skills 打包与路径注入，不是完整 workflow 自动执行器。[来源摘要](../source-summary/opencode-plugin.md)

## 综合判断

### 1. 不要把愿景当现状

- 可以说“仓库面向 AIM 独立产品方向”。
- 不应说“仓库已经完整交付 self-hosted AIM 产品”。

### 2. 不要把闭环成功标准说轻

- 这里的任务成功不是“代码过了本地测试”。
- 更准确的口径是：它关注从任务派发到 PR merge、worktree 清理、基线刷新的完整闭环。

### 3. 不要把 contract 边界说散

- OpenAPI 事实源在 `modules/contract/openapi/openapi.yaml`。
- `/openapi.json` 是导出形态，不是事实源；仓库内 docs 也不应复制第二份手写协议。

### 4. 不要高估 OpenCode 插件能力

- 现有插件说明了仓库已开始把 AIM 能力接到 OpenCode 上。
- 但当前稳定可说的能力，仍主要是 skills 打包与配置注入，而不是全自动任务代理。

## 待验证项

- 若未来仓库新增更多模块（例如更强的 manager/coordinator UI、独立 docs 展示层、额外 tooling），本页需要同步判断它们是否改变了当前非目标边界。当前见 [待确认事项](../maintenance/open-questions.md)。
