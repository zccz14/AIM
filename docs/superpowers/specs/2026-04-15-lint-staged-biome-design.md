# lint-staged + Husky + Biome 接入设计说明

## 背景/目标

当前仓库已经以 `pnpm workspace` 作为统一包管理入口，并在根 `package.json` 中通过 `pnpm lint` 使用 Biome 检查仓库级配置文件。但提交前缺少一个面向开发者本地工作流的轻量门禁：即在 `git commit` 前，仅对暂存区内的变更文件执行快速格式化与静态检查，尽早拦截明显问题。

本设计的目标是在不改变现有验证主链路的前提下，为仓库补充最小化的提交前检查能力：引入 Husky 作为 `pre-commit` 钩子入口，引入 `lint-staged` 作为暂存文件筛选与命令分发层，并继续复用现有 Biome 配置，只处理已暂存文件，避免把无关工具调整扩展到本次范围之外。

## 范围

- 在根 `package.json` 增加 `husky`、`lint-staged` 所需的最小配置与脚本入口。
- 增加 Husky `pre-commit` 钩子，用于在提交前触发 `lint-staged`。
- 使用 Biome 作为唯一执行器，对暂存区内且被 Biome 支持的文件执行格式化与检查。
- 保持与现有 `pnpm`、`Biome`、仓库级配置方式一致，不新增第二套格式化或 lint 工具。
- 文档或说明仅覆盖本次接入所需的最小使用信息。

## 非目标

- 不调整现有 `pnpm lint`、`pnpm validate`、`pnpm release:check` 等完整验证命令的职责。
- 不引入 ESLint、Prettier、commitlint 或其他提交阶段工具。
- 不把类型检查、单元测试、Playwright、OpenAPI 校验等重型校验塞入 `pre-commit`。
- 不为每个 workspace 包分别维护独立的 `lint-staged` 规则。
- 不借本次任务重构 Biome 配置、目录结构、CI 流程或安装流程中的其他历史问题。

## 方案设计

### 1. 钩子入口

在仓库根目录接入 Husky，并新增 `.husky/pre-commit` 作为唯一提交前钩子入口。该钩子只负责调用仓库根脚本，不承载额外逻辑，以保证后续维护时职责清晰：Git 钩子只做触发，实际规则统一收敛在根配置中。

### 2. 暂存文件筛选

在根 `package.json` 中声明 `lint-staged` 配置，匹配由 Biome 原生支持且当前仓库实际会修改的文件类型，首版以 `*.{js,cjs,mjs,ts,tsx,json,jsonc,md}` 为主。`lint-staged` 只接收已暂存文件列表，不主动扫描整个仓库，也不处理未暂存改动。

该策略与当前仓库已有的全量校验分层互补：

- `pre-commit` 阶段只做局部、快速、可自动修复的检查。
- `pnpm lint` 及其他验证命令仍负责仓库级、全量、一致性校验。

### 3. Biome 执行方式

`lint-staged` 调用 Biome 时应直接面向暂存文件列表执行，而不是复用当前仅覆盖固定根配置文件的 `pnpm lint`。原因如下：

- 当前 `pnpm lint` 只检查少量根文件，不能直接覆盖工作区源码与文档文件。
- `lint-staged` 的目标是处理具体暂存文件，需要把文件路径作为参数传给 Biome。
- 继续使用同一个 `biome.json`，可避免引入额外配置分叉。

执行命令应以 Biome 的写入式检查为主，使其在提交前自动修复可修复问题，并在存在不可自动修复问题时阻止提交。实现时保持单一命令路径，避免把格式化与检查拆成多轮复杂脚本。

### 4. 依赖与安装策略

`husky` 与 `lint-staged` 作为仓库级开发依赖添加到根 `package.json`。Husky 通过根级 `prepare` 脚本启用 `.husky` 目录，但不改动现有 `pnpm bootstrap` 的职责边界，也不新增与本任务无关的初始化封装。

若现有安装流程继续保留 `pnpm install --ignore-scripts` 路径，则本次设计只补充一条最小说明：在该路径下需要由开发者手动执行一次 Husky 初始化命令；除此之外不额外扩展自动化行为，以避免影响当前仓库对安装副作用的控制。

## 文件变更

预期只涉及以下最小集合：

- `package.json`：增加 `husky`、`lint-staged` 开发依赖，补充最小脚本与 `lint-staged` 配置。
- `.husky/pre-commit`：新增提交前钩子，触发 `lint-staged`。
- 如确有必要，可补充一处简短文档说明提交前钩子的启用方式；若现有 README 已足够承载，则不新增独立文档。

除上述文件外，不应扩展到 CI、workspace 结构、各模块 `package.json` 或 Biome 规则本身。

## 提交流程

开发者的预期提交流程如下：

1. 修改文件并执行 `git add`，把目标文件加入暂存区。
2. 执行 `git commit`。
3. Husky 触发 `.husky/pre-commit`。
4. `pre-commit` 调用 `lint-staged`，仅把暂存文件传给 Biome。
5. 若 Biome 自动修复成功且无剩余错误，则提交继续。
6. 若 Biome 返回不可通过的问题，则提交中止，开发者修复后重新暂存并再次提交。

该流程不替代后续的 `pnpm lint`、`pnpm typecheck`、`pnpm test` 等验证，只是把最低成本、最靠前的质量门禁提前到本地提交阶段。

## 风险与回退

主要风险如下：

- `pre-commit` 覆盖的文件模式过宽，导致 Biome 处理仓库中尚未纳入其日常工作流的文件类型，引发无关阻塞。
- Husky 启用方式若与当前 `pnpm install --ignore-scripts` 路径冲突，可能导致部分环境下钩子未自动生效。
- 若命令设计过于复杂，提交失败时开发者难以判断问题来自 Husky、`lint-staged` 还是 Biome。

对应控制策略：

- 首版仅匹配仓库内已由 Biome 实际覆盖的常见文件类型，避免激进扩面。
- 钩子中只保留单一调用链，减少诊断分叉。
- 如接入后影响面超出预期，可先移除 `.husky/pre-commit` 与根配置中的 `lint-staged`/`husky` 相关项，回退到当前仅依赖手动运行 `pnpm lint` 的状态。

## 验证方案

本设计落地后，至少应验证以下场景：

1. 标准 `pnpm install` 路径下，Husky 能通过根级 `prepare` 脚本启用并识别 `pre-commit` 钩子；`--ignore-scripts` 路径下，按文档执行一次手动初始化后也能生效。
2. 暂存一个可被 Biome 自动修复的文件后执行 `git commit`，提交前命令能够运行并自动修复该文件。
3. 暂存一个包含 Biome 不可通过问题的文件后执行 `git commit`，提交会被阻止并输出明确错误。
4. 仅存在未暂存修改时，`pre-commit` 不应把这些未暂存内容意外纳入处理范围。
5. 现有全量命令如 `pnpm lint` 仍保持原有职责，不因本次接入被替换或语义漂移。

文档自检要求：最终 spec 不出现占位符、不把实现范围扩展到测试/CI/其他工具链改造，并明确“只对暂存文件运行 Biome”这一核心约束。
