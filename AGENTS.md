# AGENTS 执行手册

## 1. 文档定位与优先级

1. 本文件是仓库级硬性执行手册，目标是约束 Agent 的实际行为，而不是提供宽松建议。
2. 本文件中的“必须 / 禁止 / 仅允许 / 只能 / 不得”均为硬规则，Agent 不得擅自放宽、重写含义或按习惯替代执行。
3. 当本文件与通用默认行为冲突时，优先遵循本文件。
4. 当本文件与仓库内其他历史文档、计划文档、流程说明或上下文记录冲突时，优先遵循本文件；除非用户直接明确要求按其他文档执行。
5. 当用户直接明确要求与本文件冲突时，优先遵循用户要求；未出现明确冲突时，不得把用户意图扩展解释为例外。

## 2. 核心定义

1. “开发任务”指任何会产生仓库内容变更、提交记录变更、分支状态变更、PR 状态变更的任务。
2. “主工作区”指用户当前默认打开的仓库根目录工作区，而非通过 `git worktree add` 创建的独立工作目录。
3. “worktree”指通过 `git worktree add` 从 `origin/main` 派生出的、位于 `<repo>/.worktrees/` 下的独立工作目录。
4. “仓库准备操作”仅指 `git fetch origin`、`git worktree add`、`git worktree remove`，以及为协调所需的只读仓库检查命令（如 `git status`、`git branch`、`git log`）。仓库准备操作不等于开发相关操作。
5. “PR 跟进阶段”指 PR 创建后，到 PR 合并、关闭或确认废弃，且对应 worktree 已清理、主工作区基线已刷新为止的整个阶段。
6. “开发任务完成”指对应 PR 已合并、关闭或确认废弃，相关 review 处理完成，对应 worktree 已删除，并且主工作区已执行 `git fetch origin && git checkout origin/main` 完成基线刷新；仅完成创建 PR、push 分支、等待平台状态或清理 worktree 均不构成完成。

## 3. 角色分工

### 3.1 主 Agent 只能做什么

1. 读取用户要求。
2. 判定是否进入开发流程。
3. 派发合适的 Sub Agent。
4. 审核 Sub Agent 结果。
5. 维护任务状态与上下文。
6. 在主工作区执行仓库准备操作与只读检查。

### 3.2 主 Agent 禁止做什么

1. 禁止直接执行开发相关任务。
2. 禁止在主工作区编写 spec、implementation plan、代码、测试、脚本、配置、CI。
3. 禁止在主工作区执行 commit、push、PR 创建、PR 更新、merge、review 修改、checks 修复、worktree 清理后的补丁操作。
4. 禁止因为任务较小、改动较少或时间较短而绕过 Sub Agent。

### 3.3 Sub Agent 负责什么

1. 所有开发相关任务必须由 Sub Agent 执行，包括：
   - 编写或修改 spec、implementation plan。
   - 修改源码、测试、脚本、配置、CI、仓库内文档。
   - 运行实现验证、文档校验、测试、构建、lint、验证脚本。
   - 执行 commit、push、PR 创建与更新。
   - 处理 checks 失败、review 意见、merge、worktree 清理。
2. 对 PR 闭环流程，Sub Agent 必须持续推进，直到达到本文件定义的“开发任务完成”。

## 4. Git / Worktree 强制规则

1. 开始任何开发任务前，必须先在主工作区执行 `git fetch origin`，确保本地 `origin/main` 为最新状态。
2. 开发任务只能基于 `origin/main` 创建新的 git worktree；禁止基于任何本地分支创建 worktree。
3. git worktree 仅允许创建在仓库内的 `<repo>/.worktrees/` 目录下；禁止在其他路径创建 worktree。
4. 所有开发相关操作必须在对应 worktree 中执行。
5. 主工作区仅允许执行仓库准备操作、只读检查，以及任务终态所要求的主工作区基线刷新；除此之外不得承载任何开发动作。
6. spec、implementation plan 与对应代码变更必须位于同一个 worktree、同一个分支、同一个 PR 中；禁止拆分到不同 PR。
7. push 代码前，必须在 worktree 中执行 `git fetch origin` 与 `git rebase origin/main`，确保当前开发分支基于最新 `origin/main`；禁止基于过时基线直接 push。
8. 所有代码合并必须通过 PR 完成；禁止直接向 `main` 分支提交或推送任何变更。
9. 禁止使用本地 `main` 分支进行开发、提交、验证或承载临时改动。
10. 对应 PR 合并、关闭或确认废弃后，且后续 review 处理完成后，必须删除对应 worktree；禁止过早删除仍需处理后续动作的 worktree，也禁止保留已失去用途的 worktree。

## 5. 标准执行剧本

只要任务涉及写文档到仓库、改代码、改测试、跑验证、commit、push、开 PR、更新 PR 或处理 review，就必须按以下顺序推进。

### 阶段 A：准备

1. 在主工作区执行 `git fetch origin`。
2. 从 `origin/main` 创建新的 worktree，且路径必须位于 `<repo>/.worktrees/`。
3. 后续所有开发动作切换到该 worktree 内执行。

### 阶段 B：产物编写

1. 如果任务需要 spec，必须先在 worktree 中编写或更新 spec，且 spec 必须使用中文。
2. 如果任务需要 implementation plan，必须在 spec 之后编写或更新 implementation plan。
3. 如果任务涉及实现、修复、文档更新或验证，必须在 worktree 中完成相关修改与最小必要验证。
4. 如果任务仅涉及文档类变更，可不额外执行实现测试，但仍需完成与文档相关的最小必要校验。

### 阶段 C：提交与出站

1. 在 worktree 中提交 commit。
2. 在 worktree 中执行 `git fetch origin`。
3. 在 worktree 中执行 `git rebase origin/main`。
4. 在 worktree 中 push 分支。
5. 创建 PR。
6. PR 创建后，必须立即启用 auto-merge；若仓库策略、权限或平台状态暂时不允许启用，必须记录阻塞原因并持续跟进，直到启用或确认无法启用。
7. PR 创建后，不得立刻进入第一次跟进；必须主动执行一次有意的等待，sleep 1 到 10 分钟后，才开始首次 follow-up。原因是 checks 刚启动时立即跟进通常没有有效增量信息。

### 阶段 D：PR 跟进

1. 创建 PR 只是进入 PR 跟进阶段，不是任务终态；不得把“已开 PR”视为完成。
2. 完成首次延时 follow-up 后，必须主动持续跟进 checks、review 状态与 mergeability，不得等待用户再次提醒。
3. 若当前仅剩 checks 运行中、等待 reviewer 响应或等待外部平台状态变化，且已无新的 scope 内动作可执行，则应进入待跟进状态，而不是无界轮询；外部状态变化后应继续推进。
4. 若 checks 失败，必须先查看失败详情；若失败原因仍在当前任务 scope 内，必须在同一 worktree、同一分支、同一 PR 中修复、验证、push，并继续跟进。
5. 若 checks 失败原因超出当前任务 scope，必须先升级决策，不得擅自扩大范围。
6. 若存在 blocking review 或其他必须处理的 review 意见，必须在同一 worktree、同一分支、同一 PR 中继续处理、验证、push，并在阻塞解除前停止推进合并。
7. 若 review 意见与 spec、scope 或权限边界冲突，必须保持阻塞并升级决策。
8. 当 checks 全部通过、不存在 blocking review、merge conflict 或仓库保护规则阻塞时，必须按仓库允许策略主动完成合并；不得等待用户手动点击 merge，也不得绕过任何保护规则。

### 阶段 E：收尾与关闭

1. 当 PR 已合并、关闭或确认废弃，且后续 review 处理完成后，必须删除对应 worktree。
2. worktree 删除后，必须回到主工作区执行 `git fetch origin && git checkout origin/main`，刷新本地基线分支状态。
3. 只有在 PR 终态成立、worktree 已清理、主工作区基线刷新完成后，任务才算完全关闭。

## 6. Spec / Implementation Plan 规则

1. spec 文档必须使用中文。
2. implementation plan 不需要请求用户 review，也不需要询问用户是否同意 implementation plan。
3. 用户只 review spec 文档；Agent 不得把 implementation plan 当作等待用户批准的门禁。
4. implementation plan 完成后，后续执行只能继续由 Sub Agent 执行；禁止改为由主 Agent 直接执行（即 Inline Execution）。
5. Agent 不得询问用户是选择 Sub Agent 执行还是主 Agent 直接执行（即 Inline Execution）。
6. 如果任务需要 spec，则必须先完成 spec，再进入 implementation plan 和实现阶段；禁止跳过 spec 直接编码。
7. 如果任务不需要 spec，不得为了走流程而强制补写 spec。
8. 如果 spec 已存在，后续实现必须以该 spec 为准；禁止在实现阶段擅自扩展超出 spec 的 scope，除非用户明确要求。

## 7. 文件系统边界

1. 任何写操作、落盘产物、持久化缓存都只能发生在当前 repo 内；禁止在 repo 外创建、修改、删除任何文件。
2. 所有日志、临时产物、诊断输出如需落盘，必须写入当前 repo 内部。
3. 禁止把任务文档、工作日志、脚本输出或其他持久化产物写到用户主目录、系统临时目录或仓库外的任意目录。

## 8. 明确禁令

1. 禁止在主工作区编写 spec。
2. 禁止在主工作区编写 implementation plan。
3. 禁止在主工作区修改代码、测试、脚本、配置、CI。
4. 禁止在主工作区执行 commit、push、PR 创建或 PR 更新。
5. 禁止从本地分支创建 worktree。
6. 禁止在 `<repo>/.worktrees/` 之外创建 worktree。
7. 禁止直接向 `main` 分支开发、提交、push。
8. 禁止使用本地 `main` 分支承载任务。
9. 禁止跳过 `git fetch origin`。
10. 禁止跳过 `git rebase origin/main` 后直接 push。
11. 禁止让 spec、implementation plan 与代码变更分散到不同 PR。
12. 禁止主 Agent 亲自执行开发任务。
13. 禁止在 repo 外写入文件或留下持久化产物。
14. 禁止把“已创建 PR”视为开发任务终点。
15. 禁止在 PR 创建后未启用 auto-merge 就将流程视为正常出站完成；若无法启用，必须显式记录阻塞。
16. 禁止在 PR 创建后立即开始第一次 follow-up；首次跟进前必须先 sleep 1 到 10 分钟。
17. 禁止在 PR checks 失败、存在 blocking review、存在 merge conflict 或存在仓库保护规则阻塞时提前合并。
18. 禁止通过绕过审批、绕过 checks 或其他 bypass 保护规则的方式强行合并 PR。
19. 禁止在仍需继续处理 checks / review / merge / worktree 清理 / 主工作区基线刷新时宣告任务完成。
20. 禁止在 implementation plan 完成后改为由主 Agent 直接执行（即 Inline Execution）。
21. 禁止要求用户在 Sub Agent 执行与主 Agent 直接执行（即 Inline Execution）之间做选择。

## 9. 快速判定口径

1. 只要任务包含写文档到仓库、改代码、改测试、跑验证、提交 commit、push、开 PR、更新 PR 内容或处理 review 中任一动作，就视为开发任务。
2. “Sub Agent 执行”指实际实施变更、运行验证、提交代码、推进 PR 与完成收尾的执行主体必须是 Sub Agent，而不是主 Agent。
3. “任务终态”不是“PR 已创建”，也不是“PR 已合并但还没清理”；必须满足本文件第 2.6 条定义。
