# Remove DB Package Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 CZ-Stack 首版模板中移除 `modules/db` / `@cz-stack/db` 基线包，并把 SQLite-first 的默认叙述收回到后端服务内部职责，同时清理脚本、测试、文档与变更元数据中的独立 db 包心智。

**Architecture:** 本次收敛只做删除和改写，不新增任何新的共享数据库抽象层。`modules/api` 继续作为后端服务代表，在文档中承担“服务内直接组织数据库接入”的默认叙述；仓库级测试、构建、验证入口不再把 `db` 视为独立模块，而是只验证现存的 contract、api、cli、web 基线。

**Tech Stack:** pnpm workspace、TypeScript、Vitest、Playwright、Biome、tsdown、Hono、Changesets、Markdown 文档。

---

## 文件结构与职责映射

- Delete: `modules/db/package.json` — 移除 `@cz-stack/db` 包清单。
- Delete: `modules/db/tsconfig.json` — 移除 db 包类型检查入口。
- Delete: `modules/db/src/index.ts` — 移除 db 包导出入口。
- Delete: `modules/db/src/boundary.ts` — 移除共享数据库边界定义。
- Delete: `modules/db/src/sqlite-adapter.ts` — 移除共享 SQLite adapter 默认实现。
- Delete: `tests/contracts/db-boundary.test.ts` — 移除 dedicated db package 测试。
- Modify: `package.json` — 删除 `modules/db` 的 build/test fixture 串联与 db project 测试入口。
- Modify: `vitest.workspace.ts` — 删除 `db` project。
- Modify: `README.md` — 删除独立 db 模块描述，改写为 SQLite-first in service。
- Modify: `docs/architecture/module-roles.md` — 删除 `db-adapter` 角色，扩展 `api-service` 的数据库内聚职责。
- Modify: `docs/architecture/repo-conventions.md` — 删除 `db` 作为核心模块的叙述，更新依赖方向与 SQLite-first 文案。
- Modify: `docs/architecture/validation.md` — 删除 db 包测试/构建排查入口，改为服务内数据库责任说明。
- Modify: `docs/superpowers/plans/2026-04-15-cz-stack-template-implementation-plan.md` — 清理旧基线计划中 `modules/db`、`db-adapter`、db task 与 db 构建/测试表述。
- Modify: `.changeset/green-crabs-move.md` — 删除 `@cz-stack/db` 的 release note 条目，并把摘要改写为四个核心模块基线。

## 实施约束

- 不修改 `docs/superpowers/specs/2026-04-15-remove-db-package-design.md`；实现必须严格按该 spec 收敛。
- 不新增任何新的 `modules/*` 数据层包、共享 helper 包或“轻量版 db boundary”。
- 不把数据库能力上推到 `contract`、`web`、`cli`；文档只能强调数据库由后端服务按业务边界直接组织。
- `modules/api` 当前源码未直接依赖 `@cz-stack/db`，因此本次实现默认不新增 API 运行时代码；若执行时发现必须改动运行时代码才能维持仓库通过，需要先确认是否超出本 spec。
- 历史 spec 文档作为设计记录保留不改；仅清理会继续指导实现、验证或发布的活跃文档与元数据。

### Task 1: 删除 `modules/db` 包与 dedicated db package 测试

**Files:**
- Delete: `modules/db/package.json`
- Delete: `modules/db/tsconfig.json`
- Delete: `modules/db/src/index.ts`
- Delete: `modules/db/src/boundary.ts`
- Delete: `modules/db/src/sqlite-adapter.ts`
- Delete: `tests/contracts/db-boundary.test.ts`

- [ ] **Step 1: 删除整个 `modules/db` 包目录与独立 db 边界测试文件**

```bash
git rm modules/db/package.json modules/db/tsconfig.json modules/db/src/index.ts modules/db/src/boundary.ts modules/db/src/sqlite-adapter.ts tests/contracts/db-boundary.test.ts
```

Expected: `git status --short` 显示上述 6 个文件为 `D`，且不出现新的替代性 db 包文件。

- [ ] **Step 2: 确认仓库内不再保留 `@cz-stack/db` 的实现入口**

Run: `rg -n "@cz-stack/db|modules/db/src|db boundary package" modules tests`

Expected: 只允许命中计划/spec 等历史说明文件；`modules/` 与 `tests/` 下不再有可执行实现或测试引用。

- [ ] **Step 3: 提交删除包骨架的独立 commit**

```bash
git add modules/db tests/contracts/db-boundary.test.ts
git commit -m "Remove db package baseline files"
```

### Task 2: 清理仓库级脚本、Vitest project 与验证编排

**Files:**
- Modify: `package.json`
- Modify: `vitest.workspace.ts`

- [ ] **Step 1: 改写根 `package.json`，删除所有把 `modules/db` 当作独立构建/测试对象的脚本片段**

将以下脚本内容改为精确值：

```json
{
  "scripts": {
    "test:build-fixtures": "pnpm --filter ./modules/contract build && pnpm --filter ./modules/api build && pnpm --filter ./modules/cli build",
    "test:unit": "pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project contract",
    "test:integration": "pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project api --project cli",
    "test": "pnpm test:unit && pnpm test:integration && pnpm test:e2e",
    "build": "pnpm -r --if-present build",
    "release:check": "pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm openapi:check && pnpm smoke"
  }
}
```

要求：

```text
- `test:build-fixtures` 不再构建 `./modules/db`
- `test:integration` 不再运行 `--project db`
- 其余脚本名保持不变，避免扩大影响面
```

- [ ] **Step 2: 改写 `vitest.workspace.ts`，删除 `db` project，仅保留现存项目**

将 `projects` 保持为以下 4 个命名块，不再包含 `name: "db"`：

```ts
[
  { test: { name: "contract", include: ["tests/contracts/contract-package.test.ts"] } },
  { test: { name: "api", include: ["tests/api/**/*.test.ts"] } },
  { test: { name: "cli", include: ["tests/cli/**/*.test.ts"] } },
  { test: { name: "repo", include: ["tests/repo/**/*.test.ts"] } },
]
```

- [ ] **Step 3: 运行精确的脚本与测试编排回归**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected:

```text
- `pnpm typecheck` 通过，且不再尝试读取已删除的 `modules/db/tsconfig.json`
- `pnpm test` 通过，Vitest 输出中不再出现 `db` project
- `pnpm build` 通过，递归 workspace 构建不会再尝试构建 `@cz-stack/db`
```

- [ ] **Step 4: 提交脚本与测试编排清理 commit**

```bash
git add package.json vitest.workspace.ts
git commit -m "Update validation scripts after db package removal"
```

### Task 3: 改写 README 与架构/验证文档为服务内数据库职责表述

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/module-roles.md`
- Modify: `docs/architecture/repo-conventions.md`
- Modify: `docs/architecture/validation.md`

- [ ] **Step 1: 改写 `README.md` 的模板定位、模块入口、能力清单与角色概览**

必须完成以下精确调整：

```text
- 第 3 行附近把 “SQLite-first db 边界” 改为 “SQLite-first 的后端服务默认落地姿态”
- 删除 `modules/db` 模块入口条目
- 把 `tests` 描述从 `contract / api / db / cli / web` 改为 `contract / api / cli / web`
- 把“首版模板包含能力”中的 db boundary 表述改成“后端服务默认优先采用 SQLite 等嵌入式存储，不预置共享 db 包”
- 把“模块角色概览”中的 `db-adapter` 替换为 `api-service` 负责数据库接入与持久化实现
- 增加一句明确说明：需要更重数据库时，服务可直接接入 Postgres 等方案
```

- [ ] **Step 2: 改写 `docs/architecture/module-roles.md`，删除 `db-adapter` 角色并扩展 `api-service` 职责**

必须完成以下精确调整：

```text
- 第 5 行附近把五类核心模块改成四类：`contract`、`api`、`web`、`cli`
- 在 `api-service` 小节中把职责改成“基于 contract 暴露 HTTP API、组装运行时依赖，并在服务内部直接管理数据库接入与持久化实现”
- 在 `api-service` 允许依赖中删除 `db-adapter`
- 整段删除 `### db-adapter`
- 更新依赖方向图：删除 `db-adapter ------> base libraries only`，并把 `api-service` 行改为 `api-service -----> contract-package, tooling-package`
- 更新禁止反向依赖规则，去掉所有 `db-adapter` 字样，同时保留“SQLite-first 不是永久只能 SQLite”的边界提醒
```

- [ ] **Step 3: 改写 `docs/architecture/repo-conventions.md`，删除 `db` 模块作为当前现实的描述**

必须完成以下精确调整：

```text
- 第 5 行附近把“已落地 contract、api、web、cli、db 五个模块”改为四个模块
- 第 18 行附近移除 `db-adapter` 角色名
- 第 20-28 行依赖方向图删除 `db <- api`
- 第 33 行附近把“db 仅提供 SQLite-first 默认边界”改为“数据库接入默认由 api 等后端服务内部组织”
- 第 72 行附近把“SQLite-first 只说明默认 adapter 路线”改为“SQLite-first 只说明后端服务默认优先采用嵌入式存储，不排斥 Postgres 等按需升级”
```

- [ ] **Step 4: 改写 `docs/architecture/validation.md`，移除 dedicated db package 的验证口径**

必须完成以下精确调整：

```text
- `pnpm test` 目的说明改为执行 `contract / api / cli / web` 统一链路
- 删除 `db 失败` 排查子项
- `pnpm build` 目的说明改为确认 `contract / api / cli` 构建与 web 产物生成仍可完成
- 在“何时升级处理”中，把“需要把 SQLite-first 边界改为 ORM 绑定实现才能维持现有测试”改为“需要新增新的共享数据库抽象层才能维持现有测试或文档叙述”
```

- [ ] **Step 5: 运行文档一致性自检与仓库校验**

Run:

```bash
pnpm lint
pnpm openapi:check
pnpm smoke
rg -n "@cz-stack/db|modules/db|db-adapter" README.md docs/architecture docs/api
```

Expected:

```text
- `pnpm lint` 通过
- `pnpm openapi:check` 继续通过，说明 contract/API 文档入口未受影响
- `pnpm smoke` 继续通过，说明 CLI 主路径未被无关改动破坏
- 最后一条 `rg` 不应在 README 与架构/验证文档中再命中 `@cz-stack/db`、`modules/db`、`db-adapter`
```

- [ ] **Step 6: 提交文档口径收敛 commit**

```bash
git add README.md docs/architecture/module-roles.md docs/architecture/repo-conventions.md docs/architecture/validation.md
git commit -m "Rewrite docs for service-owned database access"
```

### Task 4: 清理活跃计划与 Changesets 元数据中的 db 基线引用

**Files:**
- Modify: `docs/superpowers/plans/2026-04-15-cz-stack-template-implementation-plan.md`
- Modify: `.changeset/green-crabs-move.md`

- [ ] **Step 1: 改写旧基线 implementation plan，删除把 db 视为核心模块的任务与验证说明**

必须完成以下精确调整：

```text
- 在“文件结构与职责映射”中删除 `modules/db/*` 与 `tests/contracts/db-boundary.test.ts`
- 在 `Task 2`、`Task 7`、`Task 8`、`Task 10`、全量验证命令、自检结果中删除 `db` / `db-adapter` 相关表述
- 重新编号后续任务，避免保留缺口编号
- 把任何“SQLite-first adapter boundary”改写为“后端服务内的 SQLite-first 默认落地姿态”
```

- [ ] **Step 2: 改写 `.changeset/green-crabs-move.md`，删除 `@cz-stack/db` 发布条目并修正文案**

将文件内容改为精确值：

```md
---
"@cz-stack/contract": minor
"@cz-stack/api": minor
"@cz-stack/web": minor
"@cz-stack/cli": minor
---

建立 CZ-Stack 首版 contract、API、Web 与 CLI 模块基线，并补齐统一测试、CI 与 release-aware workflow 入口。
```

- [ ] **Step 3: 扫描活跃计划与变更元数据残留引用**

Run: `rg -n "@cz-stack/db|modules/db|db-adapter" docs/superpowers/plans .changeset`

Expected: 除 `docs/superpowers/specs/2026-04-15-remove-db-package-design.md` 以外，不再有活跃计划或 changeset 元数据把 db 包当作当前基线。

- [ ] **Step 4: 提交计划与 changeset 清理 commit**

```bash
git add docs/superpowers/plans/2026-04-15-cz-stack-template-implementation-plan.md .changeset/green-crabs-move.md
git commit -m "Clean plan and changeset db references"
```

### Task 5: 做最终全量验证并确认未引入替代性 db 抽象层

**Files:**
- Verify only: `package.json`
- Verify only: `README.md`
- Verify only: `docs/architecture/module-roles.md`
- Verify only: `docs/architecture/repo-conventions.md`
- Verify only: `docs/architecture/validation.md`
- Verify only: `docs/superpowers/plans/2026-04-15-cz-stack-template-implementation-plan.md`

- [ ] **Step 1: 运行最终全量验证命令**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm openapi:check
pnpm release:check
```

Expected:

```text
- 所有命令退出码均为 0
- 无命令再尝试访问 `modules/db`
- 无输出要求新增共享数据库层才能通过
```

- [ ] **Step 2: 运行残留引用与替代抽象层扫描**

Run:

```bash
rg -n "@cz-stack/db|modules/db|db-adapter" .
rg -n "shared db|database boundary|sqlite adapter|DbAdapter|createSqliteAdapter" modules docs tests package.json vitest.workspace.ts
```

Expected:

```text
- 第一条仅允许命中历史 spec / 本实施计划 / git 历史相关文本，不允许命中运行时源码、测试入口、README、架构文档、changeset 元数据
- 第二条若命中运行时源码，必须证明那是现有服务内实现；若命中新的共享层命名，说明实现已偏离 spec，需要停止并升级决策
```

- [ ] **Step 3: 形成最终提交并准备进入 PR 流程**

```bash
git status --short
git add README.md docs/architecture/module-roles.md docs/architecture/repo-conventions.md docs/architecture/validation.md docs/superpowers/plans/2026-04-15-cz-stack-template-implementation-plan.md .changeset/green-crabs-move.md package.json vitest.workspace.ts
git commit -m "Remove db package baseline from template"
```

Expected: 工作区只剩与当前任务直接相关的改动；commit 不包含新的共享 db abstraction 文件。

## 全量验证命令与预期结果

- `pnpm lint` → 根配置与文档相关改动通过 Biome 检查。
- `pnpm typecheck` → root 与现存 workspace 包类型检查通过，不再尝试读取 `modules/db`。
- `pnpm test` → unit、integration、e2e 全部通过，Vitest 不再包含 `db` project。
- `pnpm build` → contract、api、cli 与 web 构建通过。
- `pnpm smoke` → CLI smoke 返回 0。
- `pnpm openapi:check` → contract 导出的 OpenAPI 文档仍包含 health path，且 `openapi` 版本为 `3.1.0`。
- `pnpm release:check` → 聚合检查通过，证明删除 db 包后仓库入口仍闭环。

## 推荐提交切分

1. `Remove db package baseline files`
2. `Update validation scripts after db package removal`
3. `Rewrite docs for service-owned database access`
4. `Clean plan and changeset db references`
5. `Remove db package baseline from template`

## 自检结果（已按 spec 逐项补齐）

- [x] 已覆盖删除 `modules/db` 包与 dedicated db package 测试。
- [x] 已覆盖根脚本、Vitest project、build/test fixture 与验证口径清理。
- [x] 已覆盖 README、模块角色、仓库约定、验证文档对 SQLite-first in service 的改写。
- [x] 已覆盖 Postgres 等更重数据库仍允许、但不是默认姿态的文档要求。
- [x] 已覆盖活跃 implementation plan 与 changeset 元数据中的 db 基线引用清理。
- [x] 已明确禁止新增任何替代性共享 db abstraction，并给出扫描命令。
- [x] 已扫描计划正文，未发现需后续补全的模糊执行描述。
- [x] 文件路径、命令名与当前仓库现实一致：`package.json`、`vitest.workspace.ts`、`README.md`、`docs/architecture/*.md`、`.changeset/green-crabs-move.md`、旧基线 implementation plan 均已纳入。
