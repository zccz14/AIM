# Wiki Log

## 2026-04-23 - 初次建库

- 动作：建立最小可维护 wiki 基线。
- 范围：围绕“这个仓库是干啥的”整理导航、来源摘要、综合页面与待确认事项。
- 已 ingest 来源：
  - [`README.md`](../../README.md)
  - [`docs/scheduler.md`](../../docs/scheduler.md)
  - [`docs/architecture/module-roles.md`](../../docs/architecture/module-roles.md)
  - [`docs/architecture/validation.md`](../../docs/architecture/validation.md)
  - [`docs/api/README.md`](../../docs/api/README.md)
  - [`modules/opencode-plugin/README.md`](../../modules/opencode-plugin/README.md)
  - [`modules/opencode-plugin/skills/README.md`](../../modules/opencode-plugin/skills/README.md)
  - [`modules/opencode-plugin/agents/README.md`](../../modules/opencode-plugin/agents/README.md)
  - `modules/{contract,api,web,cli,opencode-plugin}/package.json`
  - `modules/api/src/{app.ts,server.ts,task-scheduler.ts,task-session-coordinator.ts,task-repository.ts,task-database.ts,routes/tasks.ts}`
  - `modules/contract/src/{index.ts,openapi.ts}`
  - `modules/cli/src/index.ts`
  - `modules/web/src/app.tsx`
  - `modules/opencode-plugin/src/index.ts`
- 产出：
  - 导航首页：[`index.md`](./index.md)
  - 来源摘要：[`source-summary/`](./source-summary/)
  - 综合页面：[`topic/`](./topic/)
  - 维护页：[`maintenance/open-questions.md`](./maintenance/open-questions.md)
- 说明：当前结论优先回答“仓库当前已落地什么”，并明确把 README 中的目标产品形态与当前实现区分开。
