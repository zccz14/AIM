# Contract 包 OpenAPI 单一事实源设计说明

## 背景 / 问题

当前 `@cz-stack/contract` 以手写 Zod Schema 与手写 OpenAPI 文档并存的方式维护契约，实际依赖方向是“Schema 先写，再反推 OpenAPI”，导致协议表达方向反了：

- OpenAPI 不是单一事实源，文档、类型、客户端与运行时校验存在漂移风险。
- `contract` 包需要同时维护手写 schema、手写客户端与手写 OpenAPI，重复成本高。
- 外部消费者无法明确区分稳定公开边界与生成产物边界，后续演进容易泄漏内部实现。

本次设计将契约中心切换为 **OpenAPI-first**：以 YAML 形式的 OpenAPI Schema 作为唯一事实源，再从同一份定义生成 TypeScript 类型、调用客户端与 Zod 校验能力。

## 目标与非目标

### 目标

1. 以 `modules/contract/openapi/openapi.yaml` 作为 `@cz-stack/contract` 的唯一契约事实源。
2. 使用 `@hey-api/openapi-ts` 生成类型与客户端，使用 `openapi-zod-client` 生成 Zod schema。
3. 生成产物在 `modules/contract/generated/` 下拆分为稳定职责文件，如 `types.ts`、`client.ts`、`zod.ts`。
4. `modules/contract/src/` 只保留薄包装层，对外继续暴露稳定 API，避免其他模块直接依赖生成目录。
5. 保留 `createContractClient()` 与 `ContractClientError` 作为稳定公开边界，并基于生成的 Zod schema 做运行时响应/错误校验。

### 非目标

1. 不保留旧的手写 schema / 手写 OpenAPI 的双轨维护期；本次按一次性切换处理。
2. 不在 `contract` 包中承载 `baseUrl`、token、重试、超时、拦截器等 transport 策略。
3. 不向仓库其他模块开放 `generated/*` 的直接导入路径。
4. 不为 Node 24+ 以外环境额外引入 isomorphic fetch 兼容层。

## 设计总览

`@cz-stack/contract` 调整为“三层结构”：

1. **OpenAPI 源文件层**：`openapi/openapi.yaml`，定义路径、schema、security 与文档元数据，是唯一可手工维护的契约源。
2. **生成产物层**：`generated/`，由代码生成命令产出 TypeScript 类型、客户端与 Zod schema，不允许业务侧直接作为公开 API 使用。
3. **稳定包装层**：`src/`，对生成产物做根入口聚合、客户端薄包装、错误模型封装与必要的稳定命名导出。

该结构的核心约束是：**OpenAPI 决定一切，`src/` 只负责稳定边界，不再手写重复契约定义。**

## 目录与产物布局

`modules/contract` 目标布局如下：

- `openapi/openapi.yaml`：手工维护的 OpenAPI 源文件。
- `generated/types.ts`：由 `@hey-api/openapi-ts` 生成的 TypeScript 类型。
- `generated/client.ts`：由 `@hey-api/openapi-ts` 生成的基础客户端。
- `generated/zod.ts`：由 `openapi-zod-client` 生成的 Zod schema 与相关辅助类型。
- `src/index.ts`：唯一公开根入口，向外聚合稳定导出。
- `src/client.ts`：`createContractClient()` 薄包装层，基于生成客户端与 Zod 校验组织稳定调用接口。
- `src/errors.ts` 或等效位置：保留 `ContractClientError` 的稳定公开定义；若无需拆文件，也可继续由 `src/client.ts` 导出。
- `src/openapi.ts`：如需向外暴露契约文档内容，应包装为稳定导出，不再手写拼装 schema。

是否拆出更多生成文件可由生成器能力决定，但对仓库其余模块而言，只能从 `@cz-stack/contract` 根入口消费公开能力。

## 公开 API 边界

公开边界遵循“根入口稳定、生成目录私有”的原则：

1. 其他模块（web、api、cli、tests）只能从 `@cz-stack/contract` 根入口导入类型、schema、client 工厂与错误类型。
2. `generated/*` 仅是内部实现细节，不纳入包对外契约，也不保证命名稳定。
3. `createContractClient()` 保留为公开客户端入口，但内部实现改为包裹生成客户端，而不是继续手写请求逻辑。
4. 公开 API 中不再保留 `ContractFetch` 类型别名，统一直接使用 `typeof fetch`。

这保证生成器未来替换、升级或重生成时，不会把破坏性变更直接泄漏给消费者。

## 鉴权与 Transport 边界

客户端 transport 策略明确归调用方所有，`contract` 包只定义契约，不拥有环境配置：

1. `createContractClient()` 只接收 `fetch: typeof fetch`，不接收 `baseUrl`、token 或其他 transport 配置。
2. 客户端包装层只负责按契约发起相对路径请求；实际主机地址解析、URL 重写与请求发出方式由调用方提供的 `fetch` 决定。
3. JWT Bearer Header 注入、重试、超时、日志、拦截器等能力，均由调用方通过包装后的 `fetch` 自行承担。
4. OpenAPI 文档中必须为私有 API 声明 `bearerAuth` security scheme，并在相应 operation 上声明安全要求。
5. 运行环境默认假设 Node 24+，可直接依赖标准 `fetch`，无需额外引入跨环境 fetch 依赖。

该边界确保 `contract` 包维持纯契约定位，不演变为应用级 HTTP SDK 配置中心。

## 错误处理

错误处理继续暴露仓库稳定语义，而不是把生成器错误类型直接公开给调用方：

1. 对外保留 `ContractClientError` 作为稳定错误类型。
2. 生成客户端返回的错误响应，在包装层中先通过生成的 Zod schema 解析，再转换为 `ContractClientError`。
3. 成功响应同样通过生成的 Zod schema 做运行时校验，避免仅依赖静态类型。
4. 若生成器内部抛出非契约错误，可在包装层保留原始错误作为 `cause` 或内部细节，但公开判断口径仍以 `ContractClientError` 为主。

这样可以把“契约错误”与“生成器内部实现细节”分离开来。

## 代码生成策略

代码生成采用一次输入、多类产物输出的方式：

1. `openapi/openapi.yaml` 为唯一输入。
2. `@hey-api/openapi-ts` 负责生成 TypeScript 类型与基础客户端。
3. `openapi-zod-client` 负责生成运行时使用的 Zod schema。
4. 仓库脚本需要新增或改造生成命令，使“更新 OpenAPI → 生成产物 → 构建/测试”成为标准链路。
5. 生成文件应视为可再生产物：允许提交入库，以保证测试、构建与消费者在无额外生成步骤时也能拿到稳定输入；但不得手工编辑。
6. `src/` 层只负责对生成产物做稳定封装，不再复制 schema、类型或文档定义。

## 测试与验证策略

验证重点从“手写实现是否匹配”转为“生成链路与稳定边界是否成立”：

1. 更新 `contract` 包测试，校验生成产物存在、根入口导出稳定、公开 API 未泄漏 `generated/*`。
2. API 测试继续验证响应可被 contract 导出的 Zod schema 解析，并验证 `/openapi.json` 返回的内容与 contract 文档一致。
3. web 与 cli 测试保持只通过 `@cz-stack/contract` 根入口消费类型、schema 与客户端，不允许直接导入生成文件。
4. 若仓库存在构建或 CI 脚本，应把代码生成纳入必要前置步骤，确保生成产物过期时能在验证阶段暴露。

## 迁移策略

迁移采用一次性切换，不保留双轨：

1. 新增 `modules/contract/openapi/openapi.yaml` 并补全当前契约内容。
2. 新增代码生成脚本与依赖，生成 `generated/types.ts`、`generated/client.ts`、`generated/zod.ts` 等产物。
3. 重写 `src/` 中的薄包装层，使根入口继续提供稳定导出。
4. 删除现有手写 schema 与手写 OpenAPI 拼装实现。
5. 更新 contract、api、web、cli 相关测试与脚本，确保全仓库只消费根入口稳定 API。

一次性切换可避免契约源双写、验证双写与消费者迁移期的不一致状态。

## 风险与待确认项

当前设计方向已获确认，本次无阻塞级待确认项。

主要风险仅在实现阶段体现为：生成器产物命名和组织方式可能与示例文件名略有差异；若实际工具输出文件名不同，只要仍满足“OpenAPI 单一事实源、`generated/` 内部分层、根入口稳定导出”三条约束，即视为符合本设计。
