# `@aim-ai/opencode-plugin` 设计说明

## 背景 / 问题

仓库当前已经逐步明确 `AIM` 的产品边界：核心产品形态应保持独立，不把自身缩成 `OpenCode` 内部能力的一部分；但同时，仓库内也已经出现过基于 `.opencode/plugins` 的运行时方向探索。继续沿着“仓库内临时插件文件”演进，会带来两个问题：

1. 打包边界不清晰，难以形成可发布、可复用、可验证的插件产物。
2. 很容易把“插件骨架”与“完整 AIM workflow 自动化”混在一起，导致第一版范围失控。

因此，本次设计只解决一个更小、更明确的问题：在当前 monorepo 内新增一个面向 OpenCode 的标准 TypeScript 包 `@aim-ai/opencode-plugin`，用最小插件骨架把包内 `skills/` 目录注册到 OpenCode 的 `config.skills.paths` 中，并为后续 AIM 资源沉淀保留稳定边界。

## 目标

1. 在 monorepo 中新增一个普通叶子包 `modules/opencode-plugin`，包名为 `@aim-ai/opencode-plugin`。
2. 采用与仓库现有叶子包一致的 TypeScript + `tsdown` 构建方式，构建产物输出到 `dist/`。
3. 明确 `package.json` 入口指向 `dist/index.js`，并围绕该入口组织发布产物。
4. 在插件加载时，把包内随包分发的 `skills/` 目录追加注册到 OpenCode 的 `config.skills.paths`。
5. 第一版仅提供静态骨架资源：`skills/` 与 `agents/` 目录、占位文件与边界说明，不实现完整 AIM workflow 能力。
6. 给出最小可执行验证标准，确保该包能完成 typecheck、build，并且打包结果包含 `dist/`、`skills/`、`agents/`、`README.md`。

## 非目标

1. 本次不实现完整 AIM workflow，不落地任务调度、SQLite、PR 跟进、自动闭环或任何执行链路。
2. 本次不做跨 Agent 宿主兼容层，不抽象成同时适配 OpenCode 之外其他宿主的通用插件框架。
3. 本次不自动注入 bootstrap prompt、系统上下文、默认 agent 指令或启动时会话消息。
4. 本次不设计复杂插件 runtime API，不新增 runtime tool 集、event hook 编排或其他自动执行逻辑。
5. 本次不把旧的 `.opencode/plugins/*` 运行时方案迁移为完整新实现；只定义新的包结构和第一版骨架边界。

## 方案定位

### 1. 采用 OpenCode 专用插件包，而不是仓库内零散脚本

推荐方案是在 `modules/opencode-plugin` 下创建一个标准可构建包，沿用当前仓库 `modules/api`、`modules/cli`、`modules/contract` 的叶子包组织方式。

这样做的原因是：

1. 当前仓库已经有清晰的 workspace + `tsdown` 叶子包模式，新插件包应直接复用该模式，而不是引入新的打包体系。
2. 把插件能力收敛为单独包后，发布内容、运行入口、验证方式与后续版本演进边界都会更清楚。
3. 第一版真正需要验证的不是 workflow 自动化，而是“包能被构建、资源能被随包分发、OpenCode 加载后能注册 skills 路径”这条最短主路径。

### 2. 不做跨宿主兼容层

本次包明确是 OpenCode-focused plugin packaging，设计参考 superpowers 的资源组织方式，但不复制 superpowers 的跨 Agent 兼容思路。

第一版只围绕 OpenCode 所需的插件入口与资源注册能力设计，禁止额外引入：

- 宿主识别分支
- 多平台 bootstrap 逻辑
- 通用 skill 加载适配层
- OpenCode 之外的 API 兼容封装

结论是：`@aim-ai/opencode-plugin` 是一个面向 OpenCode 的专用骨架包，而不是多宿主 AIM SDK。

## 包结构设计

推荐文件结构如下：

```text
modules/opencode-plugin/
  package.json
  tsconfig.json
  tsdown.config.ts
  README.md
  src/
    index.ts
  skills/
    README.md
    ...
  agents/
    README.md
    ...
```

各部分职责如下：

1. `package.json`：声明包名、构建入口、发布文件白名单与脚本。
2. `tsconfig.json`：沿用仓库现有叶子包写法，继承根 `tsconfig.base.json`。
3. `tsdown.config.ts`：声明本包的构建入口与输出目录，延续仓库既有 `tsdown` 用法。
4. `src/index.ts`：插件运行入口，负责在 OpenCode 加载时注册 `skills/` 目录。
5. `skills/`：随包分发的 AIM 静态 skills 骨架。
6. `agents/`：随包分发的 AIM 静态 agents 骨架与边界占位。
7. `README.md`：说明该包当前只提供 OpenCode 插件骨架，不包含完整 AIM workflow。

这里的关键约束是：`skills/` 与 `agents/` 必须作为包内容的一部分进入发布产物，而不是只存在于源码目录供本地开发使用。

## 运行时行为

### 1. 唯一关键行为：注册 `skills/` 路径

第一版插件在运行时只承担一个核心职责：当 OpenCode 加载该插件包时，把当前包内已分发的 `skills/` 目录加入 `config.skills.paths`。

行为约束如下：

1. 注册目标是包内资源目录，而不是仓库开发态源码路径。
2. 注册动作应基于插件包自身定位到相邻 `skills/` 目录，避免依赖调用方当前工作目录。
3. 若 `config.skills.paths` 已存在其他路径，本插件应做追加，不覆盖既有配置。
4. 若目标路径已存在于数组中，应避免重复注册，保持结果稳定。

本次不要求插件对 `agents/` 做自动注册；`agents/` 在第一版仅作为静态边界占位资源随包分发。

### 2. 明确不自动注入 bootstrap prompt / context

第一版插件不得在加载时自动向 OpenCode 会话注入任何 bootstrap prompt、初始上下文或 AIM 指令文本。

原因是：

1. 当前目标只是建立插件包骨架与最小资源注册路径，不验证提示词策略。
2. 一旦引入自动注入，就会立刻把 scope 扩展到 prompt 生命周期、覆盖顺序、冲突处理与宿主行为假设。
3. 这会把“静态资源插件”提前推向“工作流控制插件”，与本次批准范围冲突。

因此，第一版的运行时副作用只允许是 `skills/` 路径注册，不允许新增其他自动化行为。

## 资源内容边界

### 1. `skills/` 只提供骨架与静态占位

`skills/` 在第一版可以包含最小目录结构、占位文档和边界说明，但不得提前承诺或实现完整 AIM 工作流能力。

允许的内容：

1. 目录结构与命名骨架。
2. 占位 `SKILL.md` 或资源说明文件。
3. 明确声明“当前仅为骨架，后续能力另行设计”的边界文字。

不允许的内容：

1. 完整的 AIM 调度、review、merge、follow-up 流程技能。
2. 未经批准的 bootstrap 指令注入。
3. 会直接驱动仓库执行自动化的完整工作流描述。

### 2. `agents/` 只提供占位边界

`agents/` 与 `skills/` 一样，第一版只承担静态资源占位职责，用来表达未来包内 agent 资源的组织边界；本次不要求形成可直接承载完整 AIM 角色分工的 agent 集合。

结论是：第一版资源层的关键词是“可分发、可定位、可扩展”，而不是“功能完整”。

## 包配置约束

### 1. 构建与入口

本包应采用普通 TypeScript 构建，输出目录为 `dist/`，并在 `package.json` 中把 `main` 指向 `dist/index.js`。

这里沿用批准设计中的最小约束：

1. 该包是 monorepo 中的普通 TypeScript-built package。
2. 构建产物目录固定为 `dist/`。
3. 默认 Node 入口以 `dist/index.js` 为主。

本设计不额外展开 ESM/CJS 双格式策略、`exports` 细节或 bin 配置；若实现时需要补齐，应以不偏离 `main -> dist/index.js` 这一主约束为前提，并保持最小化。

### 2. 发布文件

包发布内容至少应包含：

1. `dist/`
2. `skills/`
3. `agents/`
4. `README.md`

这样可以保证安装后的插件既有运行入口，也有运行期依赖的静态资源与最小说明文档。

## 验证方案

至少完成以下验证：

1. `typecheck`：确认 `modules/opencode-plugin` 能通过 TypeScript 类型检查。
2. `build`：确认包能成功构建，并生成 `dist/` 输出。
3. 产物检查：确认发布白名单或打包结果中包含 `dist/`、`skills/`、`agents/`、`README.md`。
4. 运行时检查：确认插件入口会把包内 `skills/` 目录注册到 `config.skills.paths`。
5. 若仓库现有测试模式允许，可增加一个轻量测试，单独断言 `config.skills.paths` 的注册行为；若仓库当前没有一致的插件测试模式，则该测试不是强制项。

这里的验证重点是“包结构与资源注册正确”，而不是 workflow 功能正确。

## 风险与范围保护

1. 风险：实现时顺手把 `agents/` 也做成自动注册或自动注入入口。
   控制：本设计已明确，第一版唯一运行时注册目标是 `skills/`。
2. 风险：实现时顺手加入 bootstrap prompt/context 注入。
   控制：本设计明确禁止自动注入，后续如需支持必须另立设计。
3. 风险：为了“未来兼容”提前加入多宿主适配层。
   控制：本设计明确限定为 OpenCode-focused package，不做 cross-agent compatibility layers。
4. 风险：把占位资源写成了完整 AIM workflow 能力，导致 scope 漂移。
   控制：`skills/` 与 `agents/` 第一版只允许静态骨架和边界说明，不实现完整流程能力。

## 文件影响

本次设计对应的实现落点应收敛在新的 `modules/opencode-plugin` 包内，预期会涉及：

1. `modules/opencode-plugin/package.json`
2. `modules/opencode-plugin/tsconfig.json`
3. `modules/opencode-plugin/tsdown.config.ts`
4. `modules/opencode-plugin/src/index.ts`
5. `modules/opencode-plugin/skills/**`
6. `modules/opencode-plugin/agents/**`
7. `modules/opencode-plugin/README.md`

除为接入 workspace 所必需的最小引用更新外，不应借此扩散到其他模块实现、旧插件 runtime 或 AIM workflow 文件。
