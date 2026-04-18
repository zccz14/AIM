# `@cz-stack/*` -> `@aim-ai/*` 包作用域与 CLI 命令迁移设计说明

## 背景与目标

当前仓库的一方 workspace package 统一使用 `@cz-stack/*` 作用域，CLI 包 `@cz-stack/cli` 也对外暴露 `cz-stack` 二进制命令。随着仓库定位收敛到 AIM 体系，现有 npm 包身份与 CLI 命令身份已经不再匹配；继续保留旧作用域会让 workspace 依赖、发布元数据、文档示例与命令使用说明长期分裂在两套命名之下。

本次设计的目标是把仓库内一方 package 的 npm 身份统一迁移到 `@aim-ai/*`，并把 CLI 对外命令从 `cz-stack` 收敛为更短的 `aim`。后续实现必须把这次变更视为“包身份与命令身份迁移”，而不是泛化成整仓品牌重写：只有直接依赖包名或 CLI 命令名的内容需要同步调整。

## 范围

本次设计覆盖以下内容：

1. 将一方 workspace package 名称从 `@cz-stack/<name>` 迁移为 `@aim-ai/<name>`。
2. 覆盖至少以下四个已知 package：`api`、`cli`、`contract`、`web`。
3. 同步更新 workspace 内部依赖、脚本过滤条件、测试引用、文档示例与 Changesets 元数据中的旧作用域引用。
4. 将 CLI package 的对外二进制命令从 `cz-stack` 迁移为 `aim`，并同步更新 oclif 配置、测试与文档中的命令调用。
5. 清理仓库内对旧包作用域和旧 CLI 命令的直接引用，确保同一仓库内不再同时维护两套一方命名。

## 非范围

本次变更明确不包含以下内容：

1. 不修改仓库目录名、GitHub 仓库名或本地 worktree 命名规则。
2. 不把所有出现 `cz-stack` 文案的品牌描述都替换为 `aim` 或 `AIM`；只有直接表示 package 名、import specifier、workspace filter、发布条目或 CLI 命令的引用才在本次范围内。
3. 不新增兼容别名包，不同时发布 `@cz-stack/*` 与 `@aim-ai/*` 两套一方 package。
4. 不为 CLI 同时保留 `cz-stack` 与 `aim` 两个长期并存的二进制入口；迁移后的基线命令只有 `aim`。
5. 不借机调整模块职责、测试架构、构建流程或 release 流程，除非相关改动是修正包名 / 命令名直接引用所必需的最小伴随修改。
6. 不把根 `package.json` 的 `name: "cz-stack"` 视为本次必须迁移项；除非后续实现确认它会直接影响 package identity、changeset 解析或 CLI 命令分发，否则根包名保持现状。

## 受影响模块与文件类别

后续实现预期影响范围应收敛在与 package identity / CLI identity 直接相关的文件类别，至少包括：

- `modules/api/package.json`、`modules/cli/package.json`、`modules/contract/package.json`、`modules/web/package.json`：更新 package `name`、内部依赖与脚本中的 workspace filter。
- package 源码与测试文件：更新 `import` / `export` specifier、内联命令示例、快照或断言中的旧作用域与旧命令。
- 根 `package.json` 与其他脚本配置文件：更新 `pnpm --filter`、构建脚本、验证脚本或 smoke 脚本中对旧 package 名的直接引用。
- `.changeset/*.md`：把受影响 package 的 frontmatter 条目与正文说明同步为新作用域，并确保 release 元数据不再混用旧名。
- `README.md`、`docs/**`、`docs/superpowers/**`：仅更新其中直接引用 package 名或 CLI 命令名的内容。
- 若存在生成配置、发布配置、脚手架模板或 CI 脚本直接写死 `@cz-stack/*` / `cz-stack`，也应视为本次范围内的直接引用并同步更新。

本次设计不要求预先枚举每一个具体文件，但要求后续实现按“是否直接依赖旧 package / 旧命令名”这一标准稳定筛选变更范围。

## 包名迁移规则

### 1. 统一映射规则

所有一方 workspace package 一律按以下规则迁移：

- `@cz-stack/api` -> `@aim-ai/api`
- `@cz-stack/cli` -> `@aim-ai/cli`
- `@cz-stack/contract` -> `@aim-ai/contract`
- `@cz-stack/web` -> `@aim-ai/web`

如果后续在仓库中发现其他仍属于一方 workspace、且现名为 `@cz-stack/<name>` 的 package，也应按同一规则迁移为 `@aim-ai/<name>`，不再额外引入例外命名。

### 2. 作用域替换适用面

后续实现必须把以下位置中的旧作用域引用视为强制迁移项：

1. `package.json` 的 `name`、`dependencies`、`devDependencies`、`peerDependencies`、`optionalDependencies`。
2. 源码与测试中的静态 import/export specifier、动态 import specifier，以及任何用于断言 package 名的文本。
3. `pnpm --filter ...`、workspace 脚本、构建命令、验证命令中的旧 package 选择器。
4. Changesets frontmatter 与正文中的旧 package 发布条目。
5. 文档中的安装命令、导入示例与模块说明。

### 3. 不引入兼容层

本次迁移以“仓库基线切换”为目标，而不是做双命名兼容期。因此后续实现不应：

1. 在代码中保留对 `@cz-stack/*` 的继续引用。
2. 通过 alias、二次导出或额外 package 保持旧作用域可用。
3. 在文档里把旧作用域描述为仍受支持的并行入口。

若未来需要对外兼容发布，应作为单独设计处理，而不是在本次迁移中隐式加入。

## CLI 二进制名迁移规则

### 1. 命令名目标状态

CLI 对外命令统一从 `cz-stack` 迁移为 `aim`。迁移完成后，仓库内文档、测试与 smoke 校验都应以 `aim` 作为唯一基线命令名。

### 2. 必须同步更新的位置

至少以下位置必须保持一致：

1. `modules/cli/package.json` 中的 `bin` 字段键名。
2. `modules/cli/package.json` 中 oclif 的 `bin` 配置。
3. CLI smoke test、命令调用测试、README 示例与其他直接调用 CLI 的脚本。
4. 若任何文档、脚手架输出或示例代码写死 `cz-stack <subcommand>`，应改为 `aim <subcommand>`。

### 3. 兼容策略

本次设计不保留长期双命令兼容，因此默认不新增 `cz-stack` -> `aim` 的别名入口。后续实现只需确保仓库基线与测试全部切换到 `aim`；如果执行过程中发现外部平台约束强制要求短期兼容，应暂停并升级决策，而不是在当前任务内自行扩大范围。

## 文档与 Changeset 同步要求

后续实现必须把文档与 release 元数据当作 package identity 迁移的一部分，而不是可选收尾项。

具体要求如下：

1. 所有 Changesets 中涉及受影响 package 的 frontmatter 条目必须改为 `@aim-ai/*`，正文中若直接提到旧 package 名，也应同步改写。
2. README、模块说明、架构文档、spec / plan 文档中，凡是把 `@cz-stack/*` 当作当前有效 package 名、或把 `cz-stack` 当作当前 CLI 命令的内容，都必须同步更新。
3. 纯品牌叙述类文案若不直接构成 package / CLI 引用，可保持不动，避免把任务扩展为整仓文案重写。
4. 文档中的命令示例、安装示例、import 示例必须与最终代码状态一致，不能出现“代码已迁移、文档仍指导用户使用旧名”的分裂状态。

## 验证策略

本次是命名迁移，不要求引入新的验证体系；后续实现应以最小必要验证证明仓库已完成身份切换。

至少应覆盖以下检查：

1. 对仓库执行针对 `@cz-stack/` 与 `cz-stack` 的全文搜索，确认残留命中要么已经消除，要么被明确判定为非 package / 非 CLI 品牌文本且符合本 spec 的非范围定义。
2. 验证所有受影响 package 的 `package.json` 中 `name` 与内部依赖已完成迁移，不再混用旧作用域。
3. 验证 CLI package 的 `bin` 与 oclif 配置已统一到 `aim`，并且相关 smoke / 命令测试使用新命令名。
4. 运行最小必要的测试与脚本验证，至少覆盖受影响 package 的类型检查、lint、CLI smoke 路径，以及任何会直接因为 package rename / bin rename 失败的构建或测试路径。
5. 验证 Changesets 与文档中的直接引用已同步，避免 release 元数据或使用说明继续引用旧名。

若搜索结果中仍存在旧名，需要按以下规则判断：

- 直接表示 package identity、import specifier、workspace filter、Changeset 条目或 CLI 命令调用的命中，必须清理。
- 纯历史背景、issue 记录或本次 spec 之前的历史文档若被明确保留为历史上下文，可不强制重写，但不能让它们伪装成当前基线说明。

## 风险与注意事项

本次迁移的主要风险如下：

1. 只修改 package `name`，但漏改 workspace 内部依赖与 `pnpm --filter`，导致构建、测试或脚本在运行期找不到新 package。
2. 代码 import 已迁移，但 Changesets、README 或计划文档仍引用旧名，导致 release 元数据与使用说明脱节。
3. CLI `bin` 与 oclif 配置未同时切换，导致开发态可运行、打包后命令名却不一致。
4. 将所有 `cz-stack` 文案都机械替换为 `aim`，引发超出任务范围的品牌改写与无关 diff。
5. 为兼容旧命令或旧作用域临时加入别名，结果把本应一次性完成的身份切换变成长期双轨维护。

对应控制要求：

1. 以“新作用域 / 新命令是否成为唯一仓库基线”为验收准绳，而不是只看少数文件是否改名。
2. 先按 package identity / CLI identity 直接引用筛选文件，再做修改，避免无边界批量替换。
3. 对 CLI 相关改动保持 `bin`、oclif、测试、文档四处同步，避免局部生效。
4. 对保留旧名的残留文本给出明确理由，确保它们属于历史上下文而不是当前有效入口。

## 验收标准

当后续实现满足以下条件时，可视为符合本设计：

1. 仓库中的一方 workspace package 已统一以 `@aim-ai/*` 作为当前有效 package 名。
2. `api`、`cli`、`contract`、`web` 四个已知 package 不再在代码、脚本、依赖声明与 release 元数据中引用 `@cz-stack/*`。
3. CLI 对外命令已统一为 `aim`，仓库内测试与文档不再把 `cz-stack` 当作当前有效命令。
4. 文档与 Changesets 中所有直接依赖 package 名或 CLI 命令名的内容已与代码状态同步。
5. 残留的 `cz-stack` 文本如果仍存在，只能是被明确接受的非范围历史描述，而不能再承担当前 package / CLI 基线说明职责。

## 实施边界提醒

后续实现必须严格围绕“`@cz-stack/*` -> `@aim-ai/*` 包身份迁移”和“`cz-stack` -> `aim` CLI 命令迁移”推进。任何以下方向都属于 scope drift：整仓品牌文案翻新、根包独立品牌重命名、双命令长期兼容层、额外发布策略重构、与命名无关的代码结构调整。若执行过程中发现必须跨出这些边界，必须先升级决策，而不是在当前任务中自行扩展。

文档自检要求：本 spec 不得出现占位符，不得同时要求“只改直接引用”与“全仓品牌重写”这类自相矛盾目标，并始终保持以下单一结论：仓库后续实现应把一方 package 统一迁移为 `@aim-ai/*`，把 CLI 基线命令统一迁移为 `aim`，其余非直接相关品牌改动默认不在本次范围内。
