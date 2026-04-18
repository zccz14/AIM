# 包内测试归属与根聚合编排设计说明

## 背景/目标

当前仓库对测试目录的组织仍暴露出根级 `tests/api`、`tests/cli`、`tests/contracts`、`tests/web` 这类按能力聚合的布局。该结构虽然可以集中管理测试入口，但会弱化包边界：测试文件不再由所属 package 就地维护，根包也同时承担了“测试实际归属者”和“测试编排者”两种职责。

本次设计的目标是把测试所有权收敛回各自 package，让每个 package 在自己的目录下维护自己的测试文件，同时把根包的职责收敛为仓库级测试与脚本编排入口。完成后，仓库不再依赖根级 `tests/api|cli|contracts|web` 布局；各 package 显式拥有自身测试；根包只保留 repo governance 类测试，并通过统一命名的 `test:*` 脚本聚合同名能力。

## 范围

本次设计覆盖以下内容：

1. 把现有 `tests/api`、`tests/cli`、`tests/contracts`、`tests/web` 中的测试迁移到对应 package 自有目录。
2. 把现有 `tests/repo` 迁移到根级 `test/repo`，作为根包唯一保留的测试目录。
3. 统一并规范各 package 的 `test:*` 脚本命名与职责边界。
4. 调整根级 `vitest.workspace.ts` 与 `playwright.config.ts` 的测试发现路径，使其指向包内测试目录与根级 `test/repo`。
5. 调整根 `package.json` 中的测试脚本，使根包按能力聚合 package 脚本，而不是直接指向具体测试文件路径。
6. 删除旧根级测试目录在脚本、配置与发现路径中的引用。

## 非目标

本次变更明确不包含以下内容：

1. 不新增共享 testing toolkit package。
2. 不替换现有测试框架。
3. 不把本次任务扩展为广义 task system 重写。
4. 不在本次变更中把 runner 配置全面下放到各 package 自治。
5. 不对测试行为做超出最小路径迁移与脚本适配之外的改写。

## 方案设计

### 1. 测试文件所有权回归 package

后续实现应以“测试跟随代码归属”为核心原则，把测试文件放回对应 package 内部维护。预期目录归属如下：

- `modules/contract` 在 `modules/contract/test/**` 下拥有自己的测试。
- `modules/api` 在 `modules/api/test/**` 下拥有自己的测试。
- `modules/cli` 在 `modules/cli/test/**` 下拥有自己的测试。
- `modules/web` 在 `modules/web/test/**` 下拥有自己的浏览器测试。
- 根包仅在 `test/repo/**` 下保留仓库治理类测试。

这里的关键约束是：根包不再承载面向业务 package 的测试文件；`modules/*` 目录应从结构上直接体现“谁拥有测试，谁维护测试”。

### 2. 脚本契约按统一命名收敛

所有 package 都应提供最小一致的测试脚本接口，至少包含：

- `test`
- `test:type`
- `test:lint`

仅当 package 具备相应能力时，才增加：

- `test:smoke`
- `test:web`

脚本命名需要满足两个约束：

1. 每个 `test:*` 名称只能表达单一职责，避免同名脚本同时混入多类语义。
2. `test` 必须是该 package 针对其适用测试范围的完整入口，而不是某个子集或临时快捷命令。

本次设计要求的 package 级映射如下：

- `contract`：`test` 运行 `test:type + test:lint + vitest`。
- `api`：`test` 运行 `test:type + test:lint + vitest`。
- `cli`：`test` 运行 `test:type + test:lint + vitest + test:smoke`。
- `web`：`test` 运行 `test:type + test:lint + test:web`。
- `root`：沿用同一命名体系，但职责是运行根级检查并聚合各 package 的同名脚本。

根包还应显式提供一个内部使用的私有脚本 `test:repo`，专门用于执行根级 `test/repo` 下的仓库级测试；根级 `test` 则负责调用 `test:repo` 加上各 package 的完整 `test` 入口。

### 3. 根包只做能力编排，不再直连具体测试文件

根包的职责应从“直接找到并执行所有测试文件”收敛为“按统一能力名称编排子 package”。这意味着根级 `test:type`、`test:lint`、`test:smoke`、`test:web`、`test` 都应以能力聚合为主，而不是继续硬编码到某个根级测试目录或具体文件路径。

设计要求如下：

1. 根级 `test:type` 聚合各 package 的 `test:type` 与根包自身对应检查。
2. 根级 `test:lint` 聚合各 package 的 `test:lint` 与根包自身对应检查。
3. 根级 `test:smoke` 聚合具备 smoke 能力的 package 脚本。
4. 根级 `test:web` 聚合具备 web 能力的 package 脚本。
5. 根级 `test` 聚合 `test:repo` 与各 package 的 `test`。

这样做的目的是保持根包作为 monorepo orchestration entrypoint 的角色，同时避免其重新夺回测试文件的物理所有权。

### 4. Runner 与配置仍保留在根级，但发现路径改为包内测试

本次变更不做 runner 配置全面去中心化。根级配置文件继续保留，但其扫描目标改为新的包内测试路径：

- `vitest.workspace.ts` 继续放在仓库根目录，但应扫描 package-local 测试路径以及根级 `test/repo/**`。
- `playwright.config.ts` 继续放在仓库根目录，但 `testDir` 应指向 `modules/web/test`。

该设计刻意把“测试文件归属下沉”和“runner 配置完全分散”拆开处理。当前 change 只解决测试所有权和脚本编排边界，不扩大到完整的配置自治改造。

### 5. 迁移范围限定为路径与脚本适配

后续实现的迁移动作应限定为以下集合：

1. 移动现有 `tests/api|cli|contracts|web` 到对应 package 的 `test/**`。
2. 移动现有 `tests/repo` 到根级 `test/repo`。
3. 更新 `vitest.workspace.ts` 与 `playwright.config.ts` 的测试发现路径。
4. 为各 package 增加或规范化 `test:*` 脚本。
5. 更新根脚本，使其按能力聚合 package 脚本。
6. 删除旧根级测试目录的剩余引用。

除上述内容外，不应借机调整测试框架、抽象共享工具包、改造任务系统，或重写测试本身的行为语义。

## 影响范围

预期受影响文件与目录应以最小必要范围为准，通常包括：

- `modules/contract/test/**`、`modules/api/test/**`、`modules/cli/test/**`、`modules/web/test/**`：承接各自原有测试文件。
- `test/repo/**`：承接原 `tests/repo` 下的根级测试。
- 根 `package.json`：调整根级测试编排脚本，并增加内部 `test:repo`。
- 各 package 的 `package.json`：补齐或规范 `test`、`test:type`、`test:lint`，以及按需存在的 `test:smoke`、`test:web`。
- `vitest.workspace.ts`：收敛到包内测试与根级 `test/repo` 的发现路径。
- `playwright.config.ts`：把 `testDir` 指向 `modules/web/test`。

如果实现过程中需要更新少量与测试路径直接相关的导入、快照引用或辅助脚本，仅应作为路径迁移的伴随修正处理，而不应演化为测试体系重构。

## 风险与控制

本次调整的主要风险如下：

1. 目录迁移后仍残留旧根级 `tests/api|cli|contracts|web` 引用，导致脚本或配置继续依赖旧布局。
2. `test:*` 脚本命名表面统一，但职责边界仍不清晰，造成单个脚本混入多种能力。
3. 根脚本若继续直连具体测试路径，会让“根包是编排者而非拥有者”的目标失效。
4. `vitest.workspace.ts` 与 `playwright.config.ts` 若只改部分路径，可能出现测试发现不完整或重复执行。

对应控制策略：

- 以搜索与 diff 明确清除旧根级测试目录引用。
- 逐个 package 对照脚本契约，确认 `test` 是完整入口、`test:*` 保持单一职责。
- 把根脚本调整为 capability aggregation，而不是文件路径 aggregation。
- 对 runner 配置只做发现路径变更，避免同时引入其他行为性修改。

若迁移后发现某些测试依赖旧相对路径，应仅做最小必要路径修正；若修正需求超出“路径迁移与脚本适配”边界，则应视为超 scope 问题单独决策。

## 验收标准

当后续实现满足以下条件时，可视为符合本设计：

1. 仓库不再依赖根级 `tests/api`、`tests/cli`、`tests/contracts`、`tests/web`。
2. `modules/*` 目录能够从结构上直接看出各自拥有自己的测试。
3. 根包仅保留 repo-level 测试，即 `test/repo/**`。
4. 根级 `test:type`、`test:lint`、`test:smoke`、`test:web`、`test` 都可作为 orchestration entrypoint 正常工作。
5. 运行某个 package 的 `test` 或特定 `test:*` 时，只影响该 package 定义的测试范围。

## 实施边界提醒

后续实现必须严格以“测试文件归属下沉到 package、根包收敛为编排者”为边界。以下方向都属于 scope drift：共享测试工具包抽象、测试框架替换、任务系统大改、runner 配置全面去中心化，以及超出最小路径/脚本适配之外的测试行为重写。若实现过程中发现必须跨越这些边界，必须先升级决策，而不是在当前任务内自行扩展。

文档自检要求：最终 spec 不出现占位符，不在测试迁移之外扩展到共享测试基础设施、框架替换或任务系统重写，并始终明确“测试归属进入各 package、根包只保留 `test/repo` 并聚合同名能力脚本”这一核心约束。
