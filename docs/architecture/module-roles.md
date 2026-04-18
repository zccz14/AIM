# 模块角色约定

本文定义 CZ-Stack 模板中的模块角色、允许依赖方向，以及必须禁止的反向依赖规则。约束重点是角色边界，而不是固定目录名称。

当前首版基线已经落地 `modules/contract`、`modules/api`、`modules/web`、`modules/cli` 四类核心模块；本文描述的是**当前实现必须继续满足**的边界，而不是只面向未来目标状态的理想图。

## 角色清单

### `contract-package`

- 职责：维护 OpenAPI、Zod schema、共享类型、typed client 与未来 SDK 生成位点。
- 允许依赖：仅允许依赖极少量与协议表达直接相关的基础库。
- 被谁依赖：`api-service`、`web-app`、`cli-tool`、`tooling-package`，以及任何仓库外文档展示入口。
- 禁止：反向依赖任何应用层、服务层、数据库层或文档展示实现。
- 当前落地要求：`@cz-stack/contract` 必须继续作为 OpenAPI、Zod 与共享 client 的单一协议事实源；其中 `modules/contract/openapi/openapi.yaml` 是唯一可手工维护的事实源，`/openapi.yaml` 与 `/openapi.json` 都只能是它的发布/导出形态。

### `api-service`

- 职责：基于 contract 暴露 HTTP API、组装运行时依赖，并在服务内部直接管理数据库接入与持久化实现。
- 允许依赖：`contract-package`、必要的 `tooling-package`。
- 被谁依赖：通常只被运行入口、测试与部署配置消费。
- 禁止：要求 `contract-package` 反向依赖服务实现；禁止把 Web/CLI 运行时逻辑下沉进 API 服务。
- 当前落地要求：`@cz-stack/api` 已提供 `/health` 与 `/openapi.json`；其中 `/openapi.json` 必须继续由 contract 同源驱动，但它只是 JSON 导出结果，不是事实源。

### `web-app`

- 职责：提供浏览器端界面，复用 contract 定义的接口类型与错误模型。
- 允许依赖：`contract-package`、必要的 `tooling-package`。
- 被谁依赖：通常只被前端构建与测试入口消费。
- 禁止：反向驱动 `contract-package` 或 `api-service` 的设计。
- 当前落地要求：`@cz-stack/web` 应继续通过共享 contract / client 接入 API，而不是在前端手写一套独立协议类型。

### `cli-tool`

- 职责：提供命令行交互，复用 contract 与共享客户端能力。
- 允许依赖：`contract-package`、必要的 `tooling-package`。
- 被谁依赖：通常只被 CLI 运行入口、测试与发布流程消费。
- 禁止：要求 API 或 contract 为 CLI 专门维护第二套协议定义。
- 当前落地要求：`@cz-stack/cli` 的 health 命令必须继续复用共享 client / contract，不得演化出与 API / Web 脱节的命令协议。

### `tooling-package`

- 职责：沉淀共享脚本、工程配置 helper、生成命令或验证工具。
- 允许依赖：基础工程依赖，必要时可依赖 `contract-package` 做生成或校验。
- 被谁依赖：任意模块按需消费。
- 禁止：承载业务运行时核心逻辑；禁止通过工具层反向要求应用层提供实现细节。

## 依赖方向

推荐依赖方向如下：

```text
contract-package -> shared protocol source
api-service -----> contract-package, tooling-package
web-app ---------> contract-package, tooling-package
cli-tool --------> contract-package, tooling-package
tooling-package -> base libraries / optional contract-package
```

补充约束：`contract-package` 位于依赖图中心但不位于运行时组装中心；运行时组装属于 API / Web / CLI 等消费者职责，避免把协议中心演变为“上帝模块”。

## 禁止反向依赖规则

1. `contract-package` 不得反向依赖 `api-service`、`web-app` 或 `cli-tool`。
2. README 与 `docs/` 只能说明如何消费 contract 同源导出的文档，不得演变成第二份协议定义。
3. `web-app` 与 `cli-tool` 可以消费 contract，但不得要求 contract 为各自维护分叉协议。
4. `tooling-package` 可以服务多角色模块，但不得吸收应用层专属业务逻辑，避免形成隐式反向依赖。
5. SQLite-first 只是后端服务默认优先采用嵌入式存储的姿态，不得被误读为“所有项目必须永久使用 SQLite”。
6. SDK 生成是围绕 contract 的可选扩展，而不是首版必须交付物。
7. 仓库当前不内置 docs 项目；若未来需要展示层，也必须继续只读消费 `modules/contract/openapi/openapi.yaml` 或其导出结果。

## 落地判断标准

- 当目录或包名发生变化时，只要角色职责与依赖方向仍满足上述规则，即视为符合模板约定。
- 当新增模块时，应先判定其角色，再决定它依赖哪些既有角色，而不是先套用固定物理目录名。
- 若新增能力会让 contract、服务内数据库职责或 docs 边界失真，应优先回到角色约束评估，而不是直接在现有模块中堆叠实现。
