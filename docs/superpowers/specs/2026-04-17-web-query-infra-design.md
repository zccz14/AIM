# Web Query 基础设施设计说明

## 背景 / 问题

当前 `modules/web/src/app.tsx` 直接在组件内使用 `useEffect + useState` 调用 `createWebApiClient().getHealth()`，并手动处理 loading、success、error 三种状态。该写法可以支撑当前唯一的 `/health` 请求，但一旦后续页面继续新增读取型接口，就会把请求状态管理、重试、缓存键、错误分支等样板代码继续散落在业务组件里。

仓库已经具备两项清晰边界：

1. `@cz-stack/contract` 负责 OpenAPI 驱动的 client / types / schema 生成。
2. `modules/web/src/lib/api-client.ts` 负责浏览器侧 base URL 解析与 `createWebApiClient` 封装。

本次需要补上的不是新的契约生成机制，而是 Web 端面向读取请求的最小通用状态管理基础设施。目标是在不引入共享 API 注册表、不扩大到全局错误适配层的前提下，用社区通用方案把查询状态从组件手写逻辑中抽离出来，并先只迁移 health 请求验证路径。

## 目标

1. 在 `modules/web` 引入 `@tanstack/react-query` 作为前端读取请求状态管理方案。
2. 保持 `modules/contract` 的生成脚本、导出结构与消费方式不变。
3. Web 端公共基础设施只新增最小必要能力：`QueryClient` 初始化、`QueryClientProvider` 挂载，以及继续复用现有 `createWebApiClient`。
4. 查询 key、query options 与面向组件的 hooks 放在对应业务功能附近维护，而不是集中到一个每次新增 API 都要修改的共享公共文件。
5. 错误处理保持业务内聚；只做 health 场景需要的最小错误映射，不设计全局错误总线或大而全 adapter。
6. 首次迁移范围仅覆盖 `modules/web` 当前 health 请求，作为后续功能复制的样板。

## 非目标

1. 不修改 `modules/contract` 的 OpenAPI、types、client、zod 生成链路。
2. 不引入统一的“API 注册中心”“query key 总表”或“全局 endpoint registry”。
3. 不在本次设计中统一封装所有 mutation、表单提交、乐观更新或离线能力。
4. 不新增全局错误边界、全局 toast 基建或通用错误翻译中心。
5. 不把所有现有与未来请求一次性迁移到 react-query；本次只覆盖 health。
6. 不为了 react-query 迁移而改写 `createWebApiClient` 的职责边界。

## 设计总览

整体采用三层结构：

1. **契约与请求层**：继续由 `@cz-stack/contract` 与 `createWebApiClient` 提供 typed client，请求 URL 解析逻辑不变。
2. **查询基础设施层**：在 `modules/web` 入口创建单个 `QueryClient`，通过 `QueryClientProvider` 注入 React 树。
3. **业务特性层**：按业务功能目录维护 query key、query options 与自定义 hook；组件只消费 hook 返回的查询状态，不再内联请求副作用。

设计核心约束是：**共享层只负责提供 query runtime，不负责替业务收口所有接口定义。新增或变更某个 API 时，应只改该业务 feature 附近的代码，而不是回头修改共享公共注册文件。**

## 架构与边界

### 1. 共享基础设施保持最小

`modules/web` 只需要一个稳定的 `QueryClient` 实例和一个应用级 provider。该层职责仅包括：

1. 初始化 react-query runtime。
2. 把 provider 挂到现有应用入口。
3. 继续通过 `createWebApiClient` 创建 typed client，供 feature 层调用。

该层不负责维护 API 名称到 query key 的映射表，也不暴露“所有查询都必须经过这里注册”的扩展点。这样可以避免每增加一个新接口，就必须编辑共享公共文件，降低跨 feature 耦合。

### 2. 业务查询定义就近放置

每个业务 feature 自行拥有以下内容：

1. 本 feature 的 query key 常量或 key factory。
2. 直接调用 contract client 的 query options 构造逻辑。
3. 面向组件消费的 `useXxxQuery` hook。
4. 仅属于该 feature 的错误映射与展示文案。

以 health 为首个迁移样板时，相关定义应围绕 health 自身放置，而不是塞进 `src/lib` 下的全局 queries 文件。后续若新增别的业务接口，只需在对应业务目录旁复制同样结构即可。

### 3. contract 继续只做事实源

`modules/contract` 仍然只负责生成 OpenAPI document、types、client 与 zod schema。react-query 相关代码不进入 contract 包，也不要求 contract 额外产出 query hooks、query options 或 query key。Web 端仍然把 contract 当作 typed transport consumer 使用，而不是反向要求 contract 了解前端状态管理框架。

## 目录布局

本次设计要求的目录调整以最小必要为准，可采用如下结构：

- `modules/web/src/app.tsx`：改为消费 health query hook，保留页面展示职责。
- `modules/web/src/lib/api-client.ts`：继续保留 `createWebApiClient`，不承担 query registry 角色。
- `modules/web/src/lib/query-client.ts`：新增 `QueryClient` 创建逻辑与必要默认配置。
- `modules/web/src/features/health/queries.ts`：定义 health query key、query options 与请求函数。
- `modules/web/src/features/health/use-health-query.ts`：导出面向组件的 health query hook。

如果实现时发现 `queries.ts` 与 hook 文件保持在同一文件更简单，也允许合并；关键约束不是文件数，而是 health 查询定义要与 health feature 就近放置，不进入共享全局注册表。

## 数据流

health 场景的数据流应收敛为以下路径：

1. 应用入口创建 `QueryClient` 并通过 `QueryClientProvider` 提供上下文。
2. `App` 调用 health feature 暴露的 `useHealthQuery`。
3. `useHealthQuery` 内部基于本地 query key 与 query options 调用 `createWebApiClient().getHealth()`。
4. react-query 负责驱动 loading、success、error 状态与缓存。
5. `App` 仅根据 hook 返回的状态渲染文案，不再维护手写的取消标记或副作用生命周期逻辑。

这里的关键点是：请求依旧通过现有 contract client 发出，react-query 只接管请求状态与缓存协调，不改变接口来源。

## 错误处理

错误处理维持“业务本地、最小映射”原则：

1. health feature 内部继续识别 `ContractClientError`，把 contract error 映射为当前页面所需的最小展示文案。
2. 对非 `ContractClientError` 的未知异常，继续回退到本地默认错误文案，例如当前 health 的 `UNAVAILABLE / unexpected error` 语义。
3. 不新增全局错误 adapter、全局 toast manager、统一错误代码注册表或跨业务共享的错误翻译层。
4. 若未来某个 feature 需要不同的错误展示策略，应在该 feature 自己的 query hook 或展示层内处理，而不是反向扩展 shared infra。

## 测试与验证

本次是基础设施与首个迁移样板设计，后续实现至少需要覆盖以下验证：

1. `modules/web` 安装 react-query 后的类型检查与 lint 通过。
2. 现有 Web 浏览器测试仍能通过，确认 health 页面在迁移到 query hook 后仍能正确显示成功与失败状态。
3. 如为 health query 抽出纯函数级 query options 或错误映射，可增加最小单元测试覆盖关键分支；若当前仓库没有额外单测收益，也可先依赖现有 Playwright 路径验证。
4. 验证 `modules/contract` 无需新增生成命令、无产物 diff、无额外构建职责。

验证重点是证明“Web 端状态管理切换到 react-query 后，health 路径行为保持一致，且 contract 生成链路完全不受影响”。

## 风险与控制

主要风险如下：

1. 若把 query key 或 hooks 集中到 `src/lib` 之类公共目录，后续每个 API 都会重新耦合到共享文件，违背本次“业务就近维护”的目标。
2. 若为了统一错误处理而引入过大的全局 adapter，首个 health 迁移会被不必要的抽象放大。
3. 若在迁移 health 时顺手改动 contract 生成方式，会打破本次“状态管理替换不影响 contract”的边界。
4. react-query 默认行为包含缓存与自动重试；如果不做最小配置确认，可能让 health 页面的交互语义与当前实现出现细微偏移。

对应控制策略：

1. 共享层只保留 provider 与 query client，不建立 registry。
2. 先只落 health feature，待模式稳定后再复制到其他业务。
3. 对默认查询行为只做最小必要配置，避免超前抽象。
4. 实现与验证过程中显式检查 `modules/contract` 没有功能性变更。

## rollout 说明

本次 rollout 分两步理解：

1. **首步落地**：在 `modules/web` 引入 react-query 基础设施，并仅把现有 health 请求迁移为 feature-local query hook。
2. **后续扩展**：当新增业务读取接口时，沿用 health 的 feature-local 模式，在各自业务目录旁新增 query key、options 与 hook；不回头建设中央注册文件。

只要首个 health 迁移能够证明以下三点，就视为 rollout 成功：

1. 页面行为与现状一致。
2. contract 生成链路零改动。
3. 新 API 无需修改共享公共文件即可接入相同模式。

## 实施边界提醒

后续实现必须把 scope 严格限制在 `modules/web` 查询基础设施与 health 首次迁移上。以下方向都属于 scope drift：全局错误平台、统一 query registry、contract 侧生成 react-query hooks、批量迁移所有接口、或顺手重构整个 Web 目录结构。若实现过程中发现确有跨越这些边界的必要，应单独升级决策，而不是在当前任务内扩展。
