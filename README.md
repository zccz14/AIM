# AIM

> AI Agent 的 Manager：不是模板仓库、示例工程或 IDE 增强件，而是面向希望获得更多 AI 研发杠杆的决策者与负责人所设计的 Multi-Agent 研发调度与编排产品。

## 为什么需要 AIM

当 AI 研发开始扩大规模后，真正的瓶颈不再只是模型能力，而是人类的认知带宽。对决策者、业务 owner 与研发负责人来说，人可以提出方向、约束与验收口径，却无法在有限时间内持续盯住大量实现细节、分支状态、PR 跟进与基线演化；但如果人工不让出细节控制，又拿不到足够多的基线迭代次数。

AIM 的出发点，就是把这件事当作独立产品来解决：让人类把注意力集中在目标、边界和节奏上，把具体任务闭环交给 Agent 系统持续推进，从而在同样时间内获得更多高质量基线迭代。

## 为什么 AIM 必须是有观点的

AIM 不是一个试图适配所有团队、所有流程、所有工具形态的通用平台。它明确接受取舍，例如强任务切分与基线推进约束、强 GitHub 集成、强 OpenCode 集成，以及以“推进基线”为核心的调度模型。

原因很直接：如果产品目标是提升 AI 研发吞吐，而不是兼容所有已有习惯，那么更小、更强约束、更少抽象层的系统通常比大公司式的通用平台更快落地，也更容易形成稳定闭环。

## 核心价值

1. **吞吐优先**：先最大化单位时间内可推进的有效基线迭代次数。
2. **可控性第二**：在放弃大量实现细节人工介入的前提下，仍保留足够清晰的状态、边界与失败反馈。
3. **无人值守闭环第三**：尽可能让任务从派发到合并自动完成，但前提是服务于前两者，而不是为了“自动化程度”牺牲产出效率。

## 系统形态

AIM 的目标形态是一个独立产品，而不是模板附属物或 IDE 增强件：

- 一个独立部署的 server，负责任务编排、调度与状态推进。
- 一个独立 GUI，面向决策者、负责人或调度视角，而不是首先面向一线工程师终端操作。
- 一份独立 OpenAPI 规范，作为外部系统集成入口。
- 一个可全局安装的 CLI，用于本地或自动化环境触发与查询。

## 与 OpenCode 的集成边界

AIM 会与 OpenCode 深度集成，但方式仅限于 API 协作。它不是 OpenCode 插件，不依赖 skill 注入，不使用 event hook，也不把自身实现为某个 IDE 内部扩展。

这意味着 AIM 可以强绑定 OpenCode 的执行能力与工作流优势，同时保持产品边界独立，避免被宿主工具的插件模型、注入机制或事件生命周期反向塑形。

## 调度哲学

按照 [`docs/scheduler.md`](docs/scheduler.md) 的定义，**Task 是一次基线迭代增量**。调度器的目标不是“把一个任务标成 done”，而是让最新基线尽快向目标状态前进一小步。

因此，AIM 关心的是完整闭环：从最新基线启动任务、创建 worktree、实现与验证、提交 PR、跟进 checks/review、合并、清理 worktree，并刷新主工作区本地基线。只有当 **PR 已合并、对应 worktree 已清理、主工作区基线已刷新** 三者同时成立时，Task 才算成功。AIM 调度的是基线推进，不是待办事项列表。

## 初始项目范围

首版 AIM 聚焦在最小但完整的多 Agent 研发管理闭环：

- Task / Session / worktree / PR 的统一状态建模。
- 面向“推进基线”的调度与跟进机制。
- 与 GitHub 的强集成，用于 PR、checks、review 与 merge 闭环。
- 与 OpenCode 的强 API 集成，用于执行任务而非嵌入宿主。
- 面向负责人视角的最小管理界面与可脚本化入口。

## 近期路线图

- 落地独立 server、GUI、CLI 与 OpenAPI 入口，形成可部署的产品骨架。
- 将调度状态从“能看见”推进到“能稳定闭环跟进”。
- 强化任务失败反馈与上层重新规划接口，支持黑灯工厂式迭代。
- 围绕基线推进增加更清晰的吞吐、阻塞与成功率观测能力。

## 非目标

- 不做面向所有研发流程的通用 Agent 平台。
- 不做 OpenCode 插件、skill 注入层或事件 hook 扩展。
- 不优先服务“一线工程师手动点点点”的 IDE 辅助体验。
- 不把任务成功定义弱化为“代码已写完”或“PR 已创建”。
- 不追求先覆盖所有语言、仓库形态或组织流程，再开始交付价值。

## 来自 CZ-Stack 的项目起源

AIM 起源于 [`CZ-Stack.README.md`](CZ-Stack.README.md) 中那条面向 AI Agent 的研发轨道实践，但它现在要表达的是一个独立产品方向，而不是 CZ-Stack 模板的一页附属说明。

可以把 CZ-Stack 看作这套方法论的起点：它验证了 worktree、PR 闭环、契约驱动与无人值守推进的基础形态；AIM 则进一步把这些经验抽离为独立的调度与管理产品，服务于更高层的研发吞吐提升目标。

## 面向开发者的仓库入口

当前仓库承载的是 AIM 方法论与调度语义所依赖的现有基线；上文提到的 server / GUI / CLI / OpenAPI 是 AIM 的目标产品形态，不应读成这些表面都已在本仓库内完整落地。今天开始阅读时，优先从当前模块与验证入口进入。

- 当前基线模块入口：[`modules/contract`](modules/contract)（`@aim-ai/contract`）、[`modules/api`](modules/api)（`@aim-ai/api`）、[`modules/web`](modules/web)（`@aim-ai/web`）、[`modules/cli`](modules/cli)（`@aim-ai/cli`）
- 当前验证入口：[`docs/architecture/validation.md`](docs/architecture/validation.md)
- 调度定义与任务成功语义：[`docs/scheduler.md`](docs/scheduler.md)
- API 文档入口说明：[`docs/api/README.md`](docs/api/README.md)
- 架构文档目录：[`docs/architecture/`](docs/architecture/)
- CZ-Stack 起源说明：[`CZ-Stack.README.md`](CZ-Stack.README.md)
