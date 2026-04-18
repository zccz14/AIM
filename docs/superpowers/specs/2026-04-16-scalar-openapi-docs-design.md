# Scalar OpenAPI 静态文档模块设计说明

> 2026-04-16 实现收敛说明：已确认放弃 docs 模块自定义 runtime / wrapper 方案，改为在 `modules/contract/openapi/openapi.yaml` 中声明原生 `servers`，并由 `@scalar/cli` 直接产出最终 HTML；本文中与 `baseUrl` 注入、自定义 URL 输入、浏览器持久化相关的旧方案不再作为实现依据。

## 背景 / 问题

当前仓库已经把 `modules/contract/openapi/openapi.yaml` 作为 OpenAPI 契约源，但缺少一个独立、可静态部署的 API 文档模块来直接消费这份契约并对外展示。现状下存在几个问题：

- OpenAPI 契约已经存在，但没有标准化的静态文档产物，文档消费路径不明确。
- 如果直接把 `openapi.yaml` 暴露给调用方，使用者仍需自行选择渲染器、部署方式与运行环境地址，接入成本偏高。
- API 文档面向的运行环境并不唯一；同一份文档需要支持 `dev / staging / prod` 预置环境切换，以及临时输入自定义 URL 进行联调验证。
- 运行时环境切换属于文档消费层能力，不应反向污染 `contract` 模块或演变为 API 服务托管职责。

因此，本次需要新增一个**独立静态 docs 模块**：使用社区 CLI `@scalar/cli` 基于 `modules/contract/openapi/openapi.yaml` 生成文档，并把 `baseUrl` 运行时切换能力收敛在该模块内部。

## 目标与非目标

### 目标

1. 新增一个独立的静态文档模块，只消费 `modules/contract/openapi/openapi.yaml` 作为输入。
2. 使用 `@scalar/cli` 生成可部署的静态 API 文档页面，渲染引擎保持为 Scalar。
3. 在文档模块内部支持运行时 `baseUrl` 切换，包括 `dev / staging / prod` 预置环境与手工输入自定义 URL。
4. 让文档页面在不改动 OpenAPI 源文件的前提下，根据当前用户选择的目标环境发起 API Try It / 请求交互。
5. 保持文档模块可独立构建、独立部署、独立演进，不要求依附 `api` 或 `web` 模块运行。

### 非目标

1. 不扩展到 SDK 生成、客户端代码生成或其他 OpenAPI 派生能力。
2. 不把该模块设计成 API 服务、代理服务或托管服务；本次只产出静态文档模块。
3. 不把 `baseUrl` 配置下沉到 `contract` 包或回写进 `openapi.yaml`。
4. 不在本次任务中重构 `modules/contract` 的 OpenAPI 生成链路。
5. 不扩展到登录鉴权面板、请求签名中心、环境密钥管理或多租户文档门户。

## 设计总览

整体方案采用“**OpenAPI 单一输入 + Scalar 静态渲染 + docs 模块内运行时环境切换**”三层结构：

1. **契约输入层**：`modules/contract/openapi/openapi.yaml` 作为唯一文档输入，docs 模块只读取，不复制维护第二份协议定义。
2. **静态文档构建层**：docs 模块通过 `@scalar/cli` 生成静态文档站点，默认承载 API 文档渲染、导航与交互 UI。
3. **运行时配置层**：docs 模块在浏览器端维护当前选中的 `baseUrl`，并把该值注入到文档交互流程中，使用户可在预置环境和自定义地址之间切换。

设计上的核心约束是：**文档渲染仍由 Scalar 负责，环境切换是 docs 模块的壳层能力，而不是修改 OpenAPI 源或引入新的服务端中间层。**

若 `@scalar/cli` 直接生成的静态产物无法完整满足“运行时切换 server / baseUrl”要求，则允许在 docs 模块中增加一层**最小前端 wrapper**：负责读取环境配置、持久化用户选择、向 Scalar 传入当前 server 或触发最小重渲染；但渲染引擎本身仍必须保持为 Scalar，而不是替换成其他文档框架。

## 模块边界

模块边界遵循“文档只消费契约，不反向拥有契约与服务”的原则：

1. docs 模块只读取 `modules/contract/openapi/openapi.yaml`，不维护独立 schema、副本 JSON 或手工拼装后的文档对象。
2. `baseUrl` 运行时切换逻辑只存在于 docs 模块内部，不进入 `contract`、`api`、`web` 或根级共享环境配置中心。
3. docs 模块只负责静态文档构建与浏览器端交互，不负责请求代理、CORS 规避、鉴权 token 托管或后端转发。
4. `contract` 模块继续只承担契约事实源职责；docs 模块是其消费者，而不是上游。
5. 如果后续还有门户首页、教程文档或 changelog，它们可以作为 docs 模块的附属静态内容存在，但本次设计聚焦 API 文档，不借机扩展成完整 docs portal。

## 目录与产物布局

建议新增独立模块 `modules/docs`，最小布局如下：

- `modules/docs/package.json`：定义 docs 模块依赖、构建与预览命令。
- `modules/docs/src/`：docs 模块源码；如仅需最小 wrapper，可只保留入口与运行时配置逻辑。
- `modules/docs/src/config/servers.ts`：维护 `dev / staging / prod` 预置环境元数据与标签文案。
- `modules/docs/src/runtime/`：运行时环境状态、URL 校验、持久化与注入逻辑。
- `modules/docs/public/` 或等效静态资源目录：承载 wrapper 所需静态资源；若 CLI 输出模型不需要独立 public 目录，可省略。
- `modules/docs/scalar.config.*` 或等效配置文件：声明 `@scalar/cli` 输入源、输出目录与必要的渲染配置。
- `modules/docs/dist/`：构建输出的静态站点产物，不手工编辑。

构建关系如下：

1. docs 模块构建时读取 `../../modules/contract/openapi/openapi.yaml`。
2. `@scalar/cli` 负责生成静态文档站点主体。
3. 若需要 wrapper，则 wrapper 与 Scalar 产物一起打包到 docs 模块的最终静态输出中。
4. 最终部署物始终是纯静态文件，不依赖运行中的 Node.js 服务。

是否采用 `modules/docs` 之外的具体模块名并非阻塞点，但必须满足“独立 workspace 模块、输入仅为 openapi.yaml、输出为静态文档站点”三条约束。

## baseUrl 运行时切换交互与数据流

运行时切换设计分为“初始化、切换、消费、持久化”四个阶段：

### 1. 初始化

1. 文档页面加载时，docs 模块先读取预置环境列表：`dev`、`staging`、`prod`，每项包含稳定 id、展示名称与对应 `baseUrl`。
2. 同时检查浏览器本地持久化状态（如 `localStorage`）中是否存在上一次选择的环境或自定义 URL。
3. 若存在有效持久化值，则优先恢复；否则使用默认预置环境作为当前 `baseUrl`。
4. 若持久化的是自定义 URL，但格式非法或为空，则丢弃该值并回退到默认预置环境。

### 2. 用户交互

文档页提供一个统一的“Server / 环境”切换入口，至少包含两类操作：

- **预置环境切换**：用户从 `dev / staging / prod` 中选择一项后，当前 `baseUrl` 立即切换到对应地址。
- **自定义 URL 输入**：用户可输入完整自定义地址并显式确认；通过基础校验后，该地址成为当前 `baseUrl`。

交互约束如下：

1. 自定义 URL 必须要求完整协议头（如 `http://` 或 `https://`），避免隐式拼接导致歧义。
2. 自定义 URL 校验失败时，不覆盖当前有效 `baseUrl`。
3. 切换环境后，页面应明确展示当前生效的 server，避免用户误判请求目标。
4. 预置环境与自定义 URL 的选择状态应互斥，确保当前只存在一个生效 server。

### 3. 数据流

数据流统一为：

`openapi.yaml` → Scalar 渲染文档结构 → docs 运行时状态解析当前 `baseUrl` → 文档交互请求使用当前 `baseUrl` 发起调用。

这意味着：

- OpenAPI 文档描述接口路径、方法、请求体与响应结构。
- docs 模块在运行时决定“这些路径当前要指向哪个主机”。
- 切换 `baseUrl` 不要求重新生成 OpenAPI 文件，也不要求发布新的静态站点。

### 4. 持久化

1. 用户切换到预置环境或确认自定义 URL 后，docs 模块把当前选择持久化到浏览器本地。
2. 下次访问时自动恢复最近一次有效选择，减少重复配置成本。
3. 若预置环境列表未来调整导致历史 id 失效，则恢复逻辑应自动回退到默认环境，而不是进入空状态。

如果 Scalar 原生配置已能直接完成上述 server 切换，则优先使用原生能力；只有在原生能力不足时，才引入最小 wrapper 补足状态管理与注入逻辑。

## 错误处理

错误处理只覆盖 docs 模块自身职责，不扩展为 API 代理异常处理系统：

1. 若 `openapi.yaml` 缺失、路径错误或构建时无法解析，docs 模块构建应直接失败并给出明确错误，避免产出不完整站点。
2. 若预置环境配置缺失或格式错误，运行时应回退到内置默认环境，且在开发阶段通过测试尽早暴露。
3. 若用户输入的自定义 URL 非法，界面应给出明确提示并保持当前有效 `baseUrl` 不变。
4. 若用户切换到不可达的 server，文档页不负责吞掉请求失败；请求错误由 Scalar 的请求交互层正常展示，docs 模块只保证当前目标地址是用户显式选择的值。
5. 若本地持久化数据损坏，docs 模块应忽略异常值并恢复默认环境，而不是阻塞页面加载。

## 测试与验证策略

本次以文档模块最小闭环为验证重点：

1. 校验 docs 模块构建配置，确认输入明确指向 `modules/contract/openapi/openapi.yaml`，不存在第二份契约副本。
2. 校验静态构建结果，确认 `@scalar/cli` 能成功产出可部署站点，且最终产物不依赖运行时 Node 服务。
3. 为运行时环境状态逻辑补充单元测试：覆盖默认环境选择、预置环境切换、自定义 URL 校验、无效持久化回退等核心路径。
4. 若存在页面级测试能力，可增加最小交互验证：进入文档页、切换 `dev/staging/prod`、输入自定义 URL、确认当前 server 展示值变化。
5. 通过轻量静态检查（如 `git diff --check`、格式检查或模块级 lint/typecheck）确认新增 spec 与 docs 模块配置无明显格式问题。

验证目标不是证明后端环境一定可达，而是确认 docs 模块能够基于同一份 `openapi.yaml` 正确生成文档，并在浏览器端稳定切换请求目标地址。

## 风险与待确认项

当前设计方向已获批准，本次无阻塞级待确认项。

主要风险如下：

1. `@scalar/cli` 的静态输出能力对运行时 server 切换的支持可能有限，届时需要引入最小 wrapper 层补足状态管理与注入，但不能借机替换渲染引擎。
2. 不同部署环境的 CORS、鉴权或网络可达性问题可能影响 Try It 体验，但这属于目标 API 环境约束，不改变 docs 模块“仅负责选择目标 baseUrl”的定位。
3. 若后续团队希望在文档模块中继续承载 SDK 下载、调试控制台或 API 代理，这会突破本设计边界，需要单独立项，而不是在当前模块内顺手扩容。

只要实现仍满足“独立 docs 模块、唯一输入是 `openapi.yaml`、运行时 `baseUrl` 切换留在 docs 模块、Scalar 仍是渲染引擎”这四条约束，即视为符合本设计。
