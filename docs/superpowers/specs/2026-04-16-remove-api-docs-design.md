# API 包移除内置 /docs 设计说明

## 背景 / 问题

当前 `@cz-stack/api` 在 `modules/api/src/app.ts` 中同时承担了三类职责：

1. 组装 API 运行时路由，例如 `/health`。
2. 暴露由 `@cz-stack/contract` 同源导出的协议文档入口 `/openapi.json`。
3. 内置 Swagger UI HTML，并在 `/docs` 路由上提供文档展示页面。

其中第 3 类职责已经越过 `api-service` 的边界。根据现有架构文档，API 服务应负责 HTTP 运行时组装与协议导出消费，而文档展示属于独立文档入口或 `docs-site` 一侧的责任，不应继续内嵌在 API 包中。

本次调整的目标是把 `@cz-stack/api` 的职责收敛回 API 运行时本身：继续保留 `/openapi.json` 作为协议导出入口，但移除内置 `/docs` 页面及其相关实现。

## 目标与非目标

### 目标

1. 移除 `@cz-stack/api` 内置的 `/docs` 路由。
2. 移除仅为 `/docs` 服务的 Swagger UI HTML 渲染逻辑与相关实现细节。
3. 保留 `/openapi.json`，并继续由 `@cz-stack/contract` 导出的 `openApiDocument` 同源提供内容。
4. 更新测试基线，使其明确表达“API 包不再承担 `/docs` 展示职责”。
5. 更新仓库文档，使 API 相关说明与新的模块边界一致，不再描述 API 服务自带 `/docs` 页面。

### 非目标

1. 不修改 `@cz-stack/contract` 的 OpenAPI 文档生成、导出或事实源设计。
2. 不新增新的文档站点、静态页面托管方案或替代型 `/docs` 展示入口。
3. 不变更 `/health`、`/openapi.json` 之外的其他 API 路由行为。
4. 不借本次任务重构 `api-service` 以外模块的整体文档体系。
5. 不在本次变更中引入重定向、兼容层或保留旧 `/docs` 内容的过渡逻辑。

## 设计总览

本次设计采用最小边界收缩方案：

- `@cz-stack/api` 继续作为 API 运行时容器，负责注册业务路由与导出 `/openapi.json`。
- `/docs` 及其 HTML 渲染逻辑从 `modules/api/src/app.ts` 中完全移除。
- 与 `/docs` 绑定的测试断言和源码边界断言同步调整，改为验证 API 包不再实现该职责。
- 架构与 API 文档说明同步更新为目标状态：API 服务仅保留协议 JSON 导出，不再自带文档 UI。

该方案不改变 contract 的单一事实源地位，只是把“协议导出”和“文档展示”重新拆回各自合适的角色边界。

## 模块边界调整

调整后的边界如下：

### `@cz-stack/api`

- 保留：HTTP 路由组装、健康检查接口、`/openapi.json` 协议导出入口。
- 移除：Swagger UI 页面渲染、`/docs` 文档展示路由。

### `@cz-stack/contract`

- 保持不变：继续作为 OpenAPI 文档的事实源，供 API 服务通过 `/openapi.json` 暴露。

### 仓库文档 / 潜在 `docs-site`

- 仓库内现有文档入口可以说明如何访问 `@cz-stack/api` 暴露的 `/openapi.json`。
- 文档展示职责不再默认绑定到 API 服务进程自身；未来若存在独立 `docs-site`，也应由其承担展示层实现。

这里的关键约束是：**API 服务可以导出协议数据，但不再内建协议展示界面。**

## 代码影响

预期代码改动应仅限最小必要集合：

1. 删除 `modules/api/src/app.ts` 中 Swagger UI HTML 生成函数。
2. 删除 `modules/api/src/app.ts` 中 `app.get("/docs", ...)` 路由注册。
3. 清理因 `/docs` 移除而不再需要的局部变量或实现细节。
4. 保持 `openApiDocument` 导入与 `/openapi.json` 路由不变。

本次设计不要求新增抽象层、helper、配置项或 feature flag；以直接删除多余职责为首选。

## 测试影响

测试更新应围绕边界变化，而不是补做新的文档 UI 行为：

1. 删除 `tests/api/health-route.test.ts` 中针对 `/docs` 成功返回 HTML 的断言。
2. 删除依赖 `new URL("./openapi.json", context.req.url).pathname` 的 prefix-aware 文档渲染边界断言，因为该逻辑会随 `/docs` 一并消失。
3. 将相关边界测试替换为“API 包不再实现 `/docs`”这一新事实，例如验证 `/docs` 不再是 API 提供的成功入口，或验证源码边界不再包含对应实现。
4. 保留 `/openapi.json` 断言，继续验证其返回值与 `@cz-stack/contract` 导出的 `openApiDocument` 一致。

测试意图应从“API 自带文档 UI 且与 JSON 文档联动”切换为“API 仅导出 JSON 协议文档，不负责文档展示”。

## 文档影响

以下文档需要更新到目标状态：

1. `docs/architecture/module-roles.md`
2. `docs/api/README.md`

更新原则如下：

- 不再把 `@cz-stack/api` 描述为 `/docs` 的提供方。
- 保留 `contract-package` 为协议事实源、`api-service` 暴露 `/openapi.json` 的描述。
- 将文档展示职责明确表述为独立文档入口或未来 `docs-site` 的边界，而不是 API 服务内置页面。
- 避免在文档中暗示本次会同步交付新的替代展示入口，因为这不在当前 scope 内。

## 迁移与兼容策略

本次调整采用直接收敛边界的方式，不提供 `/docs` 兼容期：

1. API 服务升级后，`/docs` 不再作为内置路由存在。
2. 需要文档展示界面的场景，应由 API 包之外的文档入口承担。
3. 现阶段仓库内若仍需要说明 API 协议访问方式，应统一指向 `/openapi.json` 或相关文档说明，而不是继续依赖 API 自带 Swagger UI。

之所以不保留兼容层，是因为本次需求本身就是收回 API 包不应承担的职责；继续保留旧入口会模糊新的边界。

## 风险与待确认项

当前设计方向已明确，本次无阻塞级待确认项。

需要注意的实现风险如下：

1. 若文档或测试仍残留 `/docs` 描述，会导致仓库边界表述前后不一致。
2. 若测试只删除旧断言而没有补上“API 不再承担 `/docs`”的新基线，后续边界可能再次被无意放宽。
3. 若未来确实需要可视化文档入口，应在 API 包之外设计独立承载位置，而不是把 Swagger UI 再次塞回 `@cz-stack/api`。

## 验证要求

本设计落地后，至少应满足以下最小验证：

1. `modules/api/src/app.ts` 中不再存在 `/docs` 路由注册与 Swagger UI HTML 生成逻辑。
2. `tests/api/health-route.test.ts` 不再断言 `/docs` 返回 HTML，而是反映 API 不再承担该职责。
3. `docs/architecture/module-roles.md` 与 `docs/api/README.md` 不再把 `/docs` 作为 API 包当前基线的一部分。
4. `/openapi.json` 的行为保持不变，继续返回 `@cz-stack/contract` 的同源 OpenAPI 文档。

文档自检要求：最终 spec 不出现占位符，不把范围扩展到新 docs-site 实现或 contract 重构，并始终明确“移除 `/docs`、保留 `/openapi.json`”这一核心边界。
