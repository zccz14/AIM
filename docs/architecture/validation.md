# 实现验证说明

下文所有验证命令默认在仓库根目录、Node.js 24 LTS + pnpm 10.15.0+ 环境下执行。

本文列出 CZ-Stack 首版模板在当前仓库中应具备的最小验证入口、预期结果与失败时的第一排查起点。目标不是替代 CI，而是让本地与 review 阶段都能快速确认“当前基线是否仍成立”。

## 使用顺序

建议按以下顺序执行：

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build`
5. `pnpm smoke`
6. `pnpm openapi:check`
7. `pnpm release:check`

如果只是快速回归，也可以先跑 `pnpm lint && pnpm test && pnpm smoke`。

## 命令、预期结果与排查起点

### `pnpm lint`

- 目的：检查仓库级 Biome 规则与根配置文件格式。
- 预期结果：命令退出码为 0，无 lint / format 报错。
- 失败先看：`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`biome.json`、`tsdown.config.ts` 是否与当前仓库现实一致。

### `pnpm typecheck`

- 目的：检查根配置与各模块 TypeScript 边界。
- 预期结果：root `tsc --noEmit` 与各 workspace 包 `typecheck` 全部通过。
- 失败先看：模块间导出路径、NodeNext 解析、`modules/*/tsconfig.json` 与 package `exports` 是否对应。

### `pnpm test`

- 目的：执行 contract / api / cli / web 的统一测试链路。
- 预期结果：Vitest workspace 与 Playwright 主路径全部通过。
- 失败先看：
  - contract 失败：`modules/contract/src/*` 的 schema、OpenAPI 或 client 导出。
  - api 失败：`modules/api/src/app.ts`、`modules/api/src/routes/health.ts` 与 `/health` / `/openapi.json` 行为。
  - cli 失败：`modules/cli/src/commands/health.ts` 与共享 client 使用方式。
  - web / Playwright 失败：`modules/web/src/*`、测试启动依赖与 contract-driven client 交互。

### `pnpm build`

- 目的：确认 contract / api / cli 构建与 web 产物生成仍可完成。
- 预期结果：所有带 `build` 脚本的模块退出码为 0。
- 失败先看：`tsdown` 入口、Vite 配置、包 `exports` 与 dist 目标路径是否一致。

### `pnpm smoke`

- 目的：确认 CLI 最小主路径仍可运行。
- 预期结果：CLI smoke 返回 0，并输出 health 成功结果。
- 失败先看：`modules/cli/bin/dev.js`、`modules/cli/src/index.ts`、`modules/cli/src/commands/health.ts` 与 contract client 调用链。

### `pnpm openapi:check`

- 目的：确认 contract 导出的 OpenAPI 文档仍符合仓库对外口径。
- 预期结果：contract build 成功，且导出的 OpenAPI 版本为 `3.1.0`，包含 health path。
- 失败先看：`modules/contract/openapi/openapi.yaml`、`modules/contract/generated/openapi.ts`、`modules/contract/src/openapi.ts`、`modules/contract/src/index.ts`。

### `pnpm release:check`

- 目的：在发版前串联 typecheck、lint、test、build、OpenAPI 校验与 CLI smoke。
- 预期结果：整条链路退出码为 0。
- 失败先看：先回到其子命令中的第一个失败项，不要直接在 release 聚合命令表面做猜测性修复。

## 文档自检

当前仓库尚未引入专用 Markdown lint / link checker，因此文档变更后至少要额外确认：

- README 与 `docs/` 内的相对链接均可解析。
- 命令名与根 `package.json` 中脚本完全一致。
- 文档描述的是**当前已实现基线**，不是过时的“未来计划”。
- API 文档事实源始终回到 `modules/contract/openapi/openapi.yaml`；若部署后存在 `/openapi.yaml` 或 `/openapi.json`，它们都只能是同源发布/导出结果。

## 何时升级处理

出现以下情况时，应停止局部修补并升级决策：

- 需要让 `contract` 反向依赖 API / Web / CLI 才能通过验证。
- 需要新增新的共享数据库抽象层才能维持现有测试或文档叙述。
- 需要新增第二份 API 规范、手写 SDK 或仓库内 docs 事实源才能解释当前行为。
- 文档要描述的仓库现实已经超出当前 spec / plan 的批准范围。
