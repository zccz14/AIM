# API 文档入口说明

CZ-Stack 的 API 文档必须与 `contract-package` **同源生成**，而不是维护第二份手写规范。

当前仓库已经落地 `@cz-stack/contract` 与 `@cz-stack/api`：

- `@cz-stack/contract` 维护 OpenAPI 文档、Zod schema 与共享 client。
- `@cz-stack/api` 提供 `/openapi.json` 作为 JSON 导出入口，不再内置 `/docs` 展示页面。

因此，本文说明的是**当前基线如何维护 API 文档事实源与导出入口**，以及为什么仓库不再内置 docs 项目或文档站点构建流程。

## 基本原则

1. `modules/contract/openapi/openapi.yaml` 是仓库内唯一可手工维护的 OpenAPI 事实源。
2. `api-service` 直接消费这份 contract，保证运行实现与文档描述不漂移。
3. 若部署后对外提供 `/openapi.yaml`，它只是事实源文件的发布地址。
4. `/openapi.json` 是从同一份 contract 导出的消费格式，不是事实源。
5. SDK 生成若后续接入，也只能围绕 contract 扩展，不能另起一份 API 描述。

## 当前推荐消费链路

```text
modules/contract/openapi/openapi.yaml
        -> publish as /openapi.yaml (optional deployment form)
        -> derive/export JSON as /openapi.json when needed
        -> downstream tools or external docs readers consume one of those outputs
```

## 当前仓库的实际入口

- OpenAPI 事实源：`modules/contract/openapi/openapi.yaml`
- contract 导出入口：`modules/contract/src/openapi.ts`
- API 文档 JSON：`modules/api` 启动后访问 `/openapi.json`
- API 文档展示：仓库内不再内置；如需展示层，应由仓库外或未来独立入口消费事实源/导出结果
- 仓库导航入口：[`../../README.md`](../../README.md) 与 [`../architecture/validation.md`](../architecture/validation.md)

如果需要本地检查当前 API 侧 JSON 导出，可先运行 `PORT=3100 pnpm --filter ./modules/api run dev`，再访问 `http://localhost:3100/openapi.json`。

## 为什么不维护第二份手写规范

- 手写规范容易与服务实现、类型定义和测试输入输出产生漂移。
- contract 同源生成可以让 Web、API、CLI 与任何外部文档展示入口共享同一套协议定义。
- 未来若接入 SDK 生成，也应继续围绕 contract 扩展，而不是新增独立文档事实源。

## 首版落地要求

- 在 contract 模块中保留 `modules/contract/openapi/openapi.yaml` 与对应导出入口。
- 若对外发布 YAML，发布地址应直接映射这份事实源，而不是再手工复制一份文档文件。
- API 运行时可以继续暴露 `/openapi.json`，但所有文档说明都必须强调它只是导出格式。
- README 与架构文档只说明入口与生成方式，不复制手写接口细节。
- `pnpm openapi:check` 应持续通过，确保 contract 导出的 OpenAPI 文档与 API 暴露入口没有脱节。

## 非目标

- 不在仓库文档中复制一份手写 endpoint 说明。
- 不要求首版必须生成独立 SDK 包。
- 不在仓库内再维护一个 docs 项目或文档站点构建流程。
- 不把任何展示入口或 `/openapi.json` 视为协议事实源；真实事实源始终是 `modules/contract/openapi/openapi.yaml`。
