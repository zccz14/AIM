# Task Dashboard 前端设计说明

## 标题

在 `@aim-ai/web` 中以当前 Stub OpenAPI Mock 为数据源，替换模板内容并落地任务编排控制台首页。

## 假设

1. 当前仓库中的 Stub OpenAPI Mock 已能稳定提供任务列表、任务状态与依赖关系所需的读取数据，前端本次只消费现有 mock，不改动接口契约。
2. `@aim-ai/web` 现有模板代码可以被整体替换，但仍保留现有 Vite + React 工程边界，不新增新的前端应用。
3. 前端技术栈固定为 React 19、Vite、`@tanstack/react-query`、Mantine、TanStack Table、React Flow、Recharts、Lucide Icons，本次不再评估替代方案。
4. 本次只做读取型 orchestration console，不包含任务编辑、DAG 变更、PR 操作、鉴权或多页面路由。
5. 前端展示层需要通过 adapter / view-model 层隔离 mock OpenAPI shape，避免组件直接绑定原始接口字段。

## 背景 / 问题

`@aim-ai/web` 当前仍是模板内容，无法承载 AIM 的任务编排观察场景。已批准的目标是把首页替换为面向任务调度的控制台，并先基于现有 mock 数据完成最小闭环展示，让用户可以在一个默认 landing view 中同时看到任务总览、任务列表与依赖关系。

如果继续沿用模板结构或让组件直接消费 mock 原始返回，一方面页面无法承接真实业务语义，另一方面后续一旦接口 shape 调整，展示层会产生大面积耦合修改。因此本次设计需要先把首页信息架构、读取边界与展示职责收敛清楚。

## 目标

1. 将 `@aim-ai/web` 的模板首页替换为任务编排控制台，并默认以 overview / dashboard 作为 landing view。
2. 在同一前端模块内提供三个核心观察面：任务列表、状态看板、依赖图。
3. 用 React Query 管理读取状态，用 adapter / view-model 层把 mock OpenAPI 数据转换为前端稳定展示模型。
4. 在列表、摘要卡片与依赖图节点之间复用同一个详情 drawer，让用户从任一入口查看统一的任务详情。
5. 明确最小测试计划，覆盖 overview render、table render、filters、details drawer、graph render 与 error state。

## 非目标

1. 不实现任务编辑、删除、拖拽改图或任何写操作。
2. 不支持修改依赖 DAG、手动重排节点或图上交互式编排。
3. 不实现 PR 操作、GitHub 跟进动作或调度控制按钮。
4. 不增加鉴权、用户体系或多页面路由结构。
5. 不修改现有 Stub OpenAPI Mock 的契约、后端实现或数据生成方式。

## 设计总览

整体设计采用单模块、单 landing view 的控制台结构，围绕“先看全局，再钻取单任务”组织页面：

1. 页面顶部是 summary cards、状态看板与图表，用于展示任务总数、状态分布与最近活跃任务趋势。
2. 页面主体提供任务列表与依赖图两个主要工作区，分别承载结构化筛选浏览与关系浏览。
3. 任意任务点击行为都统一打开右侧详情 drawer，避免同一任务在不同视图里出现不同详情入口或不同字段解释。
4. 所有组件只消费 adapter 输出的 view-model，不直接依赖 mock OpenAPI 原始字段名与嵌套结构。

## 核心路径

1. 用户进入 `@aim-ai/web` 后，默认看到 overview/dashboard，而不是空白模板或次级视图。
2. 用户先从摘要卡片和图表理解当前任务规模、状态分布与近期活跃情况。
3. 用户在任务列表中通过排序和过滤快速定位目标任务。
4. 用户切换到依赖图视图，查看任务之间的 DAG 关系与阻塞链路。
5. 用户点击列表行、摘要中的任务入口或图节点后，统一打开右侧详情 drawer 查看单任务细节。
6. 如果读取失败，页面需要提供明确 error state，而不是保留模板内容或静默空白。

## 信息架构

### 1. Overview / Dashboard

overview 是默认 landing view，至少包含：

1. summary cards：展示总任务数、运行中数量、阻塞数量、已完成数量等核心指标。
2. status board：按状态分组展示任务分布，帮助用户快速看到 `ready`、`running`、`blocked`、`done`、`failed` 等当前盘面。
3. charts：展示状态分布与最近活跃任务的可视化摘要。
4. recent active tasks：展示近期仍有活动或状态变化的任务，作为用户继续钻取的快捷入口。

该区域的目标不是承载全部操作，而是先回答“现在系统整体处于什么状态”。

### 2. Tasks 视图

任务列表使用 TanStack Table 负责数据模型与排序过滤，Mantine 负责表面层与容器样式。列表至少支持：

1. 基础排序。
2. 基础过滤。
3. 点击行打开共享详情 drawer。

本次不扩展批量操作、内联编辑、分页策略重构或复杂查询语法。

### 3. Dependencies 视图

依赖关系使用 React Flow 呈现 DAG，并在右侧继续复用同一个详情 drawer。节点必须具备明确状态色，以便用户快速判断可执行性与阻塞关系。状态色至少覆盖：

1. `ready`
2. `running`
3. `blocked`
4. `done`
5. `failed`

依赖图职责是帮助用户理解关系与阻塞，不承担编辑或重排职责。

## 数据与状态边界

1. 读取请求统一通过 React Query 管理 loading、success 与 error 状态。
2. 展示层前必须经过 adapter / view-model 映射，把 mock OpenAPI shape 转成适合 summary、table、graph 与 drawer 消费的稳定结构。
3. 列表、卡片与图节点共享同一份任务详情事实源，避免不同入口展示字段不一致。
4. 当 mock 数据缺失部分展示字段时，应在 adapter 层定义稳定降级策略，而不是把空值处理散落到各组件。

## 详情 Drawer 约束

1. 详情 drawer 只保留一套实现。
2. 列表行点击、最近活跃任务点击、依赖图节点点击都打开同一个 drawer。
3. drawer 展示的字段解释与状态语义必须一致，不因入口不同而分叉。
4. 本次 drawer 只做只读展示，不承载编辑、执行或 PR 动作。

## 测试计划

后续实现至少需要覆盖以下验证：

1. overview render：默认 landing view 能正确渲染摘要卡片、状态看板、图表与最近活跃任务。
2. table render：任务列表能正确渲染基础列与数据。
3. filters：列表过滤与排序路径可用。
4. details drawer：从列表、卡片或图节点打开时均能显示统一详情。
5. graph render：依赖图能正确渲染 DAG 与状态色。
6. error state：mock 请求失败时页面能呈现明确错误状态。

## Value Alignment

1. 与 AIM 当前阶段价值对齐：先把任务编排的可观察性做出来，而不是提前扩展到控制面或写操作。
2. 与仓库当前事实对齐：直接复用现有 Stub OpenAPI Mock，缩短前端替换模板的落地路径。
3. 与后续演进对齐：通过 adapter / view-model 隔离接口 shape，为未来 mock 向真实接口迁移保留缓冲层。
4. 与 scope 控制对齐：页面只覆盖 dashboard、table、graph、drawer 与错误态，不借机扩展 auth、routing 或 PR 工作流。

## 风险与边界保护

1. 若组件直接消费 mock 原始 shape，后续接口调整会把影响扩散到 overview、table、graph 与 drawer；因此 adapter 层是本次必须边界。
2. 若为不同入口分别实现详情面板，会导致状态解释和字段展示漂移；因此必须只保留一个共享 drawer。
3. 若在依赖图中顺手加入编辑能力，会把只读观察台扩成编排工具；本次必须禁止。
4. 若把 landing view 拆成多页面路由，会超出已批准 scope；本次保持单模块内聚合视图。

## 实施边界提醒

后续实现只能在 `@aim-ai/web` 现有模块中替换模板内容，并围绕 mock 数据落地 overview、tasks、dependencies 与共享 drawer。任何涉及写操作、路由扩展、鉴权接入、PR 动作或 mock 契约变更的方向，都属于超出本设计范围的 scope drift。
