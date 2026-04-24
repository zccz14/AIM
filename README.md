# AIM

<p align="center">
  <img src="docs/brand/aim-icon.svg" alt="AIM icon" width="96" height="96" />
</p>

**AIM 定义了面向 README 的软件开发范式**。

> 这一句 slogan 我还没有完全想好，或许是面向优化、面向目标，但我暂时觉得“面向 README”这个说法很有意思。

**AIM 是软件的自动优化器** (这类似于 Adam、Optuna 之类的概念, 但是在软件开发领域)，**AIM 认为软件开发的本质是从基线现状向目标状态的逼近与收敛过程**。

AIM 的范畴是，建立坐标系、定义度量、拆分增量、持续推进、闭环验证，直到目标状态被充分逼近。AIM 的方法论核心是，**把软件开发当作一个连续的、可度量的、可调度的基线迭代过程来管理**。AIM 的目标是，从已有的任何基线触发，持续向目标状态推进。

AIM 理想中的使用流程如下：

1. 人类充当 Director ，编写和维护 README。
2. AIM Manager 评估项目基线与 README 目标的差距。无人值守。
3. AIM Coordinator 基于差距分析，自动拆分、发布任务，直到 README 目标被充分逼近。无人值守。
4. AIM Developer 负责执行任务，跟进状态，反馈结果，完成基线迭代。无人值守。
5. 人类随时可以观测系统各个组件的状态，但无法干预 Manager、Coordinator 和 Developer 的操作。

(人类 = Director > Manager > Coordinator > Developer)

如果 README 被发现不够清晰，AIM 会提出问题要求人类澄清，人类澄清后以更新了 README 的形式反馈给 AIM，AIM 再继续推进迭代。

AIM 认为复用是基于基线 CheckPoint 的。未来，软件将是逐用户场景开发的。相似的用户场景之间的软件迁移，本质上是从一个已有的基线向另一个目标状态的迁移。例如，你为一个用户开发了一个功能，现在有另外一个用户需要这个功能，你可以基于现有的基线版本 (作为 checkpoint) 与另外一个用户的 README，自动迭代出满足新用户需求的版本。而不是从一个空白、通用的模板开始，这能节约大量的重复开发工作。

AIM 应当具有一个可观测系统 (UI)，能够清晰地展示当前基线与目标状态之间的差距、迭代的进展、成功率、阻塞点等关键指标。AIM 的调度器应当能够根据这些指标动态调整任务优先级和资源分配，以最大化推进效率。

AIM 包含了 Manager, Coordinator 和 Developer 的职责。

1. Manager 负责评估基线与目标状态的差距，确定迭代的方向，定义评估的坐标系。
2. Coordinator 负责基于 Manager 的评估结果，当前基线现状，已有的 Tasks，维护未完成的 Tasks。
3. Developer 负责执行 Coordinator 派发的 Tasks，跟进执行状态，反馈结果给 Coordinator ，完成基线的迭代。

## 为什么需要 AIM

**人的带宽严重不足。我们务必要找到一种方式来最小化人的干预。**

如果我们不能找到这样的一种方式，那么 Agentic Engineering 无法进入到下一个时代，无法真正实现大规模的 AI 研发。尽管暂时还没有成为现实，但我们已经能够清晰地预见到这个问题的存在，并且有足够的动力去解决它。

当 AI 研发开始扩大规模后，真正的瓶颈不再只是模型能力，而是人类的认知带宽。对决策者、业务 owner 与研发负责人来说，人可以提出方向、约束与验收口径，却无法在有限时间内持续盯住大量实现细节、分支状态、PR 跟进与基线演化；但如果人工不让出细节控制，又拿不到足够多的基线迭代次数。

AIM 的出发点，就是把这件事当作独立产品来解决：让人类把注意力集中在目标、边界和节奏上，把具体任务闭环交给 Agent 系统持续推进，从而在同样时间内获得更多高质量基线迭代。

## 为什么 AIM 必须是有观点的

AIM 不是一个试图适配所有团队、所有流程、所有工具形态的通用平台。它明确接受取舍，例如强任务切分与基线推进约束、强 README 提示、强 GitHub 集成、强 OpenCode 集成，以及以“推进基线”为核心的调度模型。

原因很直接：如果产品目标是提升 AI 研发吞吐，而不是兼容所有已有习惯，那么更小、更强约束、更少抽象层的系统通常比大公司式的通用平台更快落地，也更容易形成稳定闭环。

## 核心价值

1. **吞吐优先**：先最大化单位时间内可推进的有效基线迭代次数。
2. **可控性第二**：在放弃大量实现细节人工介入的前提下，仍保留足够清晰的状态、边界与失败反馈。
3. **无人值守闭环第三**：尽可能让任务从派发到合并自动完成，但前提是服务于前两者，而不是为了“自动化程度”牺牲产出效率。

## 系统形态

AIM 的目标形态是一个 Self-Hosted 的独立产品，而不是模板附属物或 IDE 增强件：

- 一个独立部署的 server，负责任务编排、调度与状态推进。
- 一个公共的独立 GUI，面向决策者、负责人或调度视角，而不是首先面向一线工程师终端操作。
- 一份独立 OpenAPI 规范，作为外部系统集成入口。
- 一个可全局安装的 CLI，用于本地或自动化环境触发与查询。

## 使用前提

- OpenCode。作为 AIM 的主要执行环境与工作流基础。
- Git CLI。
- GitHub CLI，并且已经完成登录和项目授权。
- **专门的 AI API 预算**。AIM 可以用完你的所有 Tokens。

## AIM 的集成边界

### 与 git 的集成边界

可以全面依赖、使用 git CLI 的各种功能。

### 与 GitHub 的集成边界

GitHub 提供一个中立的、严格的、免费的基线迭代的门控机制。

主要是使用 GitHub Pull Request, RuleSet 和 GitHub Actions (CI/CD)，以及拿到 GitHub 生态中的各种加持（例如 Vercel 用于持续部署前端）。如果 AIM 要在本地合并分支，那么就至少要在本地做一个 CI 环境来做集成测试（否则 Agent 很难在完全干净的环境中进行测试，可能导致错误的代码放行），目前 GitHub 的开放程度极高（API 与 gh CLI），几乎无摩擦集成。自己再造一个 CI 环境得不偿失。

但是，暂不考虑集成 GitHub Projects, GitHub Issues 等其他功能。这些功能有潜力作为 AIM 得数据后端，但灵活度仍然不足，且仍然无法完全省去本地的 SQLite。采用后会使得架构复杂化，目前并没有明显的好处。未来的考虑是，将 GitHub Issues 作为额外的信息源，收集用户反馈、bug 报告、功能请求等，但不把它作为核心的 Task 管理工具。

### 与 OpenCode 的集成边界

AIM 会与 OpenCode 深度集成，但方式仅限于 OpenCode API 与 OpenCode 插件。

OpenCode 插件是注入 Skill 或者其他配置最干净的方式。

AIM 会完全控制 OpenCode 实例的配置和使用方式。AIM 可能会排除已有 OpenCode 上的其他同类的 Workflow 增强型插件，以避免冲突和不确定性。例如 Superpowers、Oh-My-OpenAgents 等等。但是不会考虑屏蔽例如 Model Provider 类型的插件。

## AIM 角色边界

方便习惯理解，自下而上地把 AIM 的角色边界描述一下：

### AIM Developer

AIM Developer 负责执行 AIM Coordinator 派发的 Task，跟进执行状态，反馈结果给 Coordinator ，完成基线的迭代。AIM Developer 的目标是完成 Task 定义的基线迭代闭环。

**Task 是一次基线迭代增量**。调度器的目标不是“把一个任务标成 done”，而是让最新基线尽快向目标状态前进一小步。

因此，AIM Developer 关心的是完整闭环：从最新基线启动任务、创建 worktree、实现与验证、提交 PR、跟进 checks/review、合并、清理 worktree，并刷新主工作区本地基线。只有当 **PR 已合并、对应 worktree 已清理、主工作区基线已刷新** 三者同时成立时，Task 才算成功。AIM 调度的是基线推进，不是待办事项列表。

AIM Task 自派发后，只有两种结果：resolved (成功) 或者 rejected (失败)。其余情况均可认为需要被 AIM Developer 继续跟进，直到进入这两种结果之一。

### AIM Coordinator

AIM Coordinator 负责基于 AIM Manager 的评估结果、当前基线现状，迭代 Task Pool。AIM Coordinator 的目标是合理规划和调整 Task Pool，最大化推进效率。

**Task Pool** 是 AIM Coordinator 维护的一个动态集合，包含了所有未完成的 Tasks。AIM Coordinator 的职责是根据 Manager 的评估结果和当前 Task Pool 的状态，决定是否需要新增 Task、或者重新规划 Task 的内容。

1. Task 一旦被 resolved，这个 Task 的内容就已经被融入了最新基线，AIM Coordinator 没必要再关心这个 Task 了；
2. Task 一旦被 rejected，失败的原因就是从基线中发掘的信息，这些信息对于 AIM Coordinator 的后续规划是非常重要的。AIM Coordinator 需要根据失败原因新增新的 Task 来解决这个失败原因。

AIM Coordinator 的输入:

- AIM Manager 的评估结果（差距分析、坐标系定义等）
- 最新基线
- Task Pool
- Rejected Task 的失败原因

AIM Coordinator 的输出:

- 对 Task Pool 的 Bulk Write（Create、Delete，因为 Task Spec 是不可变的）

注：Task Pool 本质上是 SQLite 中的 `tasks` 表的一个过滤了已完成任务后的视图。

### AIM Manager

AIM Manager 负责评估基线与目标状态的差距，确定迭代的方向，定义评估的坐标系。AIM Manager 的目标是为 AIM Coordinator 提供清晰、准确、可操作的评估结果。

AIM Manager 的输入：

- README (本质上是直接来自 Director 的各种输入)
- 最新基线的可观测性信息
  - 最新的代码基线，例如 `origin/main` 的最新提交。
  - 可观测性指标（本质上是从基线的运行时中发掘的信息，例如当前版本的日志、性能指标、功能覆盖率、安全扫描结果等）
  - Issues (本质上是从基线的运行时中发掘的问题，例如当前版本的 bug 报告、用户反馈、监控报警等)。
- 坐标系（本质上是项目的各种价值维度，例如功能对齐、性能指标、安全指标等）

AIM Manager 的输出：

- 差距分析结果（本质上是 README 目标状态与最新基线之间的差距，落点在坐标系中）
- 迭代方向建议（本质上是基于差距分析结果，给 AIM Coordinator 的一些建议，例如优先推进哪个维度的迭代，或者是否需要先进行一些探索性的迭代来验证某些假设等）
- 开放问题（本质上是 AIM Manager 在评估过程中发现的 README 不清晰的地方，需要 Director 澄清的地方）

当前最小产品落点是 [`Manager Report`](docs/manager-report.md)：它是一份可发现、可阅读、可交接给 Coordinator 的 Markdown 方向产物，由 packaged `aim-manager-guide` 入口产出。它定义 Manager 输出的产品语义与交接边界，不是最终 API schema、SQLite schema 或自动执行协议；Coordinator 只能把它作为 `Task Write Bulk` 的方向输入，不能绕过审批直接写入 Task。

## 路线图

1. [x] AIM 落地独立 server、GUI、CLI 与 OpenAPI 入口，形成可部署的产品骨架和部署文档。
2. [x] AIM Developer 能够稳定完成 AIM Task 定义的基线迭代闭环，且在失败时能提供清晰的反馈信息。
3. [ ] AIM Coordinator 能够基于 AIM Manager 的评估结果和 Task Pool 的状态，合理规划和调整 Task Pool，最大化推进效率。
4. [ ] AIM Manager 能够准确评估基线与目标状态的差距，确定迭代的方向，定义评估的坐标系，并为 AIM Coordinator 提供清晰、准确、可操作的评估结果。
5. [ ] AIM GUI 能够清晰展示当前基线与目标状态之间的差距、迭代的进展、成功率、阻塞点等关键指标，并提供必要的交互功能来支持用户对 AIM Manager 输出的澄清和调整。

## 非目标

- 不做面向所有研发流程的通用 Agent 平台。
- 不优先服务“一线工程师手动点点点”的 IDE 辅助体验。
- 不把任务成功定义弱化为“代码已写完”或“PR 已创建”。
- 不追求先覆盖所有语言、仓库形态或组织流程，再开始交付价值。

## 面向开发者的仓库入口

当前仓库承载的是 AIM 方法论与调度语义所依赖的现有基线；上文提到的 server / GUI / CLI / OpenAPI 是 AIM 的目标产品形态，不应读成这些表面都已在本仓库内完整落地。今天开始阅读时，优先从当前模块与验证入口进入。

- 当前基线模块入口：[`modules/contract`](modules/contract)（`@aim-ai/contract`）、[`modules/api`](modules/api)（`@aim-ai/api`）、[`modules/web`](modules/web)（`@aim-ai/web`）、[`modules/cli`](modules/cli)（`@aim-ai/cli`）
- API 文档入口说明：[`docs/api/README.md`](docs/api/README.md)
- 架构文档目录：[`docs/architecture/`](docs/architecture/)

本地启动 AIM Server：构建 CLI 与 API 后，可使用 `aim server start` 在前台启动本地 Server；默认沿用 API 的 `PORT` / `8192` 语义，也可使用 `aim server start --port 8192` 显式指定端口。

## 安装、构建与测试

安装: `pnpm install`

全局安装 CLI（包发布后）: `npm i -g @aim-ai/cli`

安装后可直接使用 `aim` 命令，例如 `aim --help` 查看可用命令，或用 `aim health --base-url http://localhost:8192` 查询本地 AIM Server 健康状态。

构建并验证：`pnpm build`

- 在 repo 根执行时，固定等价于先运行所有 workspace 包的 `build`，再运行 repo-only 的 typecheck、lint、Vitest、OpenAPI 与 changeset 校验。
- 在任一 workspace 包内执行时，`pnpm build` 都表示先产出该包构建产物，再运行该包要求的显式 `test:*` 校验。
- 仓库不提供精确名为 `test` 的脚本；需要局部验证时使用显式命名入口，例如 `test:type`、`test:lint`、`test:vitest`、`test:smoke` 或 `test:web`。
