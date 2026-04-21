---
name: aim-create-tasks
description: 当用户已经明确批准创建新的 AIM Task，且需要把稳定的用户意图整理成候选 Task Spec 并提交到 POST /tasks 时使用。
---

# aim-create-tasks

## 概述

这个 skill 只负责一件事：把已经获批的用户意图整理成候选 AIM Task Spec，并在得到明确批准后创建 Task。

它不负责替代调度器，不负责执行 `aim-verify-task-spec` 之外的校验，不负责 implementation plan、实现执行、生命周期推进或 PR 跟进。

## 何时使用

- 用户明确想新增 AIM Task，而不是直接改代码、排期或执行任务时。
- 已经能够拿到明确的 `project_path`。
- 需要把用户意图收敛为完整的五段式 Task Spec，再写入 `POST /tasks` 时。

## 何时不使用

- 不用它替代调度器决定顺序、优先级或编排。
- 不用它替代 `aim-verify-task-spec`。
- 不把它扩展成写 implementation plan、改代码、跑验证、汇报生命周期。

## 必需输入

- 已经被用户确认要创建 Task 的目标意图。
- 明确的 `project_path`。
- 足够形成五段式 Task Spec 的上下文：范围、边界、关键约束、潜在冲突与价值取舍。

## 工作流程

### 1. 先补齐信息，不要从模糊请求直接落 Task

如果用户给的只是方向、主题或一句需求，先继续访谈。

至少要补齐：

- 这次要推进的基线增量是什么。
- 明确不做什么。
- 当前已知前提事实是什么。
- 可能出现哪些冲突场景，以及冲突时价值排序是什么。
- `project_path` 是什么。

不要猜 `project_path`，也不要把背景故事直接抄进 Spec。

### 2. 基于最新基线起草候选 Task Spec

起草前先做只读了解，确认最新基线、相关 AIM Task、相邻 spec 或设计文档，目标是：

- 避免重复建 Task。
- 让 `Assumptions` 贴近当前可验证事实。
- 让范围边界与已有增量保持一致。

这一步只用于起草候选 Task Spec，不得顺势扩展成 implementation plan 或执行清单。

### 3. 每个候选都必须写完整五段式 Task Spec

候选 Task 不能只给标题、摘要或实现提示。每个候选都必须包含完整五段。

- `Title`
- `Assumptions`
- `Goal vs Non-Goal`
- `Core Path`
- `Value Alignment`

参考 Markdown 格式如下：

```markdown
# Custom Task Title

Descriptions Paragraphs...

## Fact Assumptions

(To clarify the current baseline, please explicitly describe the key facts and assumptions that are relevant to this Task. This will help downstream to understand the starting point and avoid misunderstandings.)

### Fact 1 Title

- What is Fact 1 (Concepts only, no implementation details)
- How to verify Fact 1

### Fact 2 Title

- What is Fact 2 (Concepts only, no implementation details)
- How to verify Fact 2

## Goal vs Non-Goal

(To clarify the scope of this Task, please explicitly describe what is in scope (Goal) and what is out of scope (Non-Goal). This will help downstream to understand the intended outcome and avoid scope creep.)

### Goal 1 Title

- What is Goal 1 (Concepts only, no implementation details)
- How to verify Goal 1 is achieved
- Why Goal 1 is important

### Goal 2 Title

- What is Goal 2 (Concepts only, no implementation details)
- How to verify Goal 2 is achieved
- Why Goal 2 is important

### Non-Goal 1 Title

- What is Non-Goal 1 (Concepts only, no implementation details)
- How to verify Non-Goal 1 is not in scope
- Why Non-Goal 1 is not in scope

### Non-Goal 2 Title

- What is Non-Goal 2 (Concepts only, no implementation details)
- How to verify Non-Goal 2 is not in scope
- Why Non-Goal 2 is not in scope

## Core Path

(To construct a proof of this path can take actual baseline to goal. Extreme High Inference Effort is needed in this section, please be very careful when writing this part. Notion of "Core Path" is very different from "Implementation Plan". Core Path should be more about the key concept changes, the main path selection and the trade-offs with alternative paths. It should not be a file change list, a function change list or a mechanical step list.)

Summary paragraph of the main path to achieve the Goal from the current baseline.

Steps of the Core Path...

- Step 1: Description of Step 1

  Related concepts, why this step is needed, and how to verify it is done.

- Step 2: Description of Step 2

  Related concepts, why this step is needed, and how to verify it is done.

- Step Final: Description of the final step

  How to verify the Goal is achieved after this step.

## Value Alignment

(When there are conflicts, please describe the conflict scenario and the value priority in this section. This will help downstream to make informed trade-offs when they encounter similar conflicts.)

### Value 1 is better than Value 2 when...

The conflict scenario between Value 1 and Value 2, and why Value 1 is preferred in this scenario.

### Value 3 is better than Value 4 when...

The conflict scenario between Value 3 and Value 4, and why Value 3 is preferred in this scenario.
```

并且还要附带：

- `project_path`
- 可选的 `dependencies`

五段写法必须遵循 `docs/task-spec.md` 的语义：

#### Title

- 必须是一句“基线增量目标”，不是泛泛主题。
- 应该能自然映射为一个 PR 标题。
- 像“优化任务系统”“清理创建流程”这种宽泛话题不合格。

示例：

- 好：`为 Task 创建阶段补齐独立的 Spec 校验门`
- 差：`Task 创建`

#### Assumptions

- 只写当前可验证的基线事实，不写背景故事。
- 优先写可通过只读检查确认的外部可观测事实。
- 不要写容易漂移的实现猜测或“之前发生过什么”。

示例：

- 好：`当前 Task 创建 skill 允许起草者直接自我判断 Spec 是否可创建。`
- 差：`之前大家在创建 Task 时经常觉得流程不够严格，所以需要加强。`

#### Goal vs Non-Goal

- `Goal` 和 `Non-Goal` 必须一起把范围夹紧。
- `Goal` 说明这次增量要推进到哪里。
- `Non-Goal` 要具体到足以阻止范围蔓延，不能只是礼貌性地说“暂不处理其他问题”。

示例：

- 好的 Goal：`要求每个候选 Task Spec 在创建前都经过独立校验。`
- 好的 Non-Goal：`不改动调度器排序逻辑，不在创建阶段引入 implementation plan 或执行状态字段。`
- 差的 Non-Goal：`其他优化后续再说。`

#### Core Path

- 解释当前概念格局、目标概念变化，以及为什么选这条主路径。
- 必须交代放弃了哪些备选路径，以及为什么不选。
- 不能退化成文件改动清单、函数改动清单或机械步骤。

示例：

- 好：`把“候选 Spec 起草”和“Spec 可创建性校验”拆成两个职责：起草侧只负责表达用户批准的增量，校验侧独立判断该增量在最新基线上是否仍然成立；不采用起草者自检路径，因为那会把起草偏见带入创建门。`
- 差：`修改 SKILL.md，并在创建前多调用一个 skill。`

#### Value Alignment

- 必须写成“冲突场景 + 价值排序”，给下游自由裁量证据。
- 不是抽象口号，不是单句偏好。
- 要说明遇到分歧时，哪些价值优先级更高。

示例：

- 好：`当“更快创建 Task”和“避免把失效 Spec 写入系统”冲突时，优先后者；当“覆盖更多候选方向”和“保持每个候选都有清晰边界”冲突时，优先后者。`
- 差：`优先保持简单。`

### 4. 起草后必须先做独立 Spec 校验，禁止自我批准

在任何创建动作之前，每一个候选 Task Spec 都必须先调用 `aim-verify-task-spec` 做校验。

这道校验必须通过 SubAgent 派发完成，不能由同一个起草 agent 一边写候选、一边自己判定“已经没问题”。

要求如下：

- 起草 agent 负责整理候选 Task Spec。
- 独立的 SubAgent 负责对每个候选调用 `aim-verify-task-spec`。
- 只有校验结论为 `pass` 时，候选才能进入用户审批；`waiting_assumptions` 或 `failed` 都不得进入创建。
- 如果校验指出结构不足、假设失效或边界不清，先回到起草环节修订，不得跳过。

如果一次生成多个候选 Task Spec，且它们之间没有相互依赖，应并行派发多个 SubAgent 分别校验，避免串行拖慢确认过程。

不要在这里重复 `aim-verify-task-spec` 的完整判定细节；创建前校验的职责边界以该 skill 为准。

### 5. 用户明确批准后，才能执行创建

候选经过独立校验后，先把候选列表返回给用户确认。

只有用户明确表示批准创建，才能调用 `POST /tasks`。像“看起来差不多”“先这样吧”这类模糊反馈，不算批准。

如果用户要求修改候选，回到访谈或起草步骤，重新形成候选并再次经过独立校验。

### 6. 创建调用

创建目标是 `POST ${SERVER_BASE_URL:-http://localhost:8192}/tasks`。

示例：

```bash
curl -X POST "${SERVER_BASE_URL:-http://localhost:8192}/tasks" \
  -H "Content-Type: application/json" \
  --data '{
    "task_spec": "# Title\n\n## Assumptions\n...",
    "project_path": "/abs/path/to/repo",
    "dependencies": ["task-id-a"]
  }'
```

- `task_spec` 和 `project_path` 是创建必需字段。
- `dependencies` 只是软提示，不是调度门禁。
- 如果没有可靠的依赖提示，可以传空数组，或在服务端契约允许时省略该字段。
- 创建成功后，要把每个新建 Task 的标识返回给用户。

## 失败处理

- 用户目标仍然模糊：继续访谈，不要创建。
- 缺少 `project_path`：停止并补齐，不要猜测。
- 候选没有完整五段，或五段内容空洞：回到起草环节修订。
- 候选尚未经过独立 SubAgent 校验：不得进入创建。
- 用户尚未明确批准：不得调用 `POST /tasks`。
- `POST /tasks` 失败：区分哪些候选已创建、哪些失败，以及失败原因。

报告失败时，区分内容问题和传输问题：

- 内容问题：如 `task_spec` 不完整、`project_path` 无效、请求体格式错误。
- 传输问题：如超时、连接失败、服务端异常响应。

## 边界

- 只负责把已获批的用户意图整理为候选 Task，并在批准后创建。
- 不负责替代 `aim-verify-task-spec` 本身的校验逻辑。
- 不负责调度、排期、执行、implementation plan、生命周期推进。
- 不把 `dependencies` 升级为硬性顺序约束。

## 常见错误

- 错误：只有标题或 issue 摘要就直接建 Task。
  修正：先补齐五段式 Task Spec，再进入校验与审批。
- 错误：起草 agent 自己判断候选“看起来可以创建了”。
  修正：必须派发独立 SubAgent 调用 `aim-verify-task-spec`，禁止自我批准。
- 错误：多个候选逐个慢慢校验，即使它们彼此独立。
  修正：在可并行时并行派发 SubAgent 做校验。
- 错误：把 `Core Path` 写成文件修改清单。
  修正：回到概念变化、主路径选择和备选路径取舍。
- 错误：把 `dependencies` 当成必须先完成的硬门。
  修正：只把它当成调度提示，最终顺序仍由调度器和最新基线决定。
