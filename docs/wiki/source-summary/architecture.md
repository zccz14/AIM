# Source Summary: 模块角色、验证入口与 API 文档边界

返回 [wiki 首页](../index.md)；相关综合页：[当前基线与模块地图](../topic/baseline-and-module-map.md)、[关键边界与非目标](../topic/boundaries-and-non-goals.md)

## Raw sources

- [`docs/architecture/module-roles.md`](../../architecture/module-roles.md)
- [`docs/architecture/repo-conventions.md`](../../architecture/repo-conventions.md)
- [`docs/architecture/validation.md`](../../architecture/validation.md)
- [`docs/api/README.md`](../../api/README.md)
- [`modules/contract/package.json`](../../../modules/contract/package.json)
- [`modules/api/package.json`](../../../modules/api/package.json)
- [`modules/web/package.json`](../../../modules/web/package.json)
- [`modules/cli/package.json`](../../../modules/cli/package.json)
- [`modules/contract/src/index.ts`](../../../modules/contract/src/index.ts)
- [`modules/contract/src/openapi.ts`](../../../modules/contract/src/openapi.ts)
- [`modules/api/src/app.ts`](../../../modules/api/src/app.ts)
- [`modules/cli/src/index.ts`](../../../modules/cli/src/index.ts)
- [`modules/web/src/app.tsx`](../../../modules/web/src/app.tsx)

## 来源事实

- 架构文档明确当前首版基线已落地四个核心模块：`modules/contract`、`modules/api`、`modules/web`、`modules/cli`。[raw](../../architecture/module-roles.md)
- `@aim-ai/contract` 被定义为 OpenAPI、Zod、共享类型与 client 的单一协议事实源；`modules/contract/openapi/openapi.yaml` 是唯一可手工维护的 OpenAPI 事实源。[raw](../../architecture/module-roles.md) [raw](../../api/README.md)
- `@aim-ai/api` 提供 HTTP API，当前至少暴露 `/health` 与 `/openapi.json`；`createApp()` 中也确实注册了 task routes 与 `/openapi.json`。[raw](../../architecture/module-roles.md) [raw](../../../modules/api/src/app.ts)
- `@aim-ai/web` 当前入口直接渲染 task dashboard 页面；`@aim-ai/cli` 当前暴露 `health` 和 `task:{create,list,get,update,delete}` 命令。[raw](../../../modules/web/src/app.tsx) [raw](../../../modules/cli/src/index.ts)
- 验证文档给出当前仓库最小验证入口：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke`、`pnpm openapi:check` 等，并提醒当前仓库尚未引入专用 Markdown lint / link checker。[raw](../../architecture/validation.md)

## 综合判断

- 这套仓库结构已经不是空壳目录；至少 `contract/api/web/cli` 四类模块各自承担了协议、服务、界面、CLI 的不同角色。
- 当前 API 文档边界很清晰：仓库不维护第二份手写 API 规范，所有外显接口文档都应回到 contract 同源导出链路。

## 待验证项

- Web dashboard 与 CLI 的功能深度本次未逐组件、逐命令全量核实；当前只把“存在入口与对应角色”视为稳定事实。
