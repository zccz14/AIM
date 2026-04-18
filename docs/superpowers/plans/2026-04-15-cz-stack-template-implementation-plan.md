# CZ-Stack Template Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 CZ-Stack 首版模板基线，使 Web、API、CLI 围绕共享 contract、统一 TypeScript 工具链、分层测试、release-aware CI 与文档入口协同工作。

**Architecture:** 以 pnpm workspace monorepo 为骨架，使用“模块角色优先、物理目录名可变”的组织约定，将 contract 作为单一协议事实源，API/Web/CLI 作为消费者接入。数据库能力采用后端服务内的 SQLite-first 默认落地姿态，测试、构建、发布与文档围绕同一基线集中治理，模块按需局部覆盖。

**Tech Stack:** pnpm workspace、TypeScript、Biome、tsdown、Hono、Vite、React、Zod、OpenAPI、oclif、Vitest、Playwright、Changesets、GitHub Actions。

---

## 文件结构与职责映射

- Create: `package.json` — 仓库级脚本、workspace 命令入口、统一开发依赖。
- Create: `pnpm-workspace.yaml` — workspace 包发现规则，允许以模块角色命名目录承载包。
- Create: `tsconfig.base.json` — 仓库共享 TypeScript 严格配置。
- Create: `biome.json` — 仓库级格式化与 lint 规则。
- Create: `tsdown.config.ts` — 共享构建默认值（供可发布包复用）。
- Create: `vitest.workspace.ts`、`playwright.config.ts` — 仓库级测试编排入口。
- Create: `.changeset/config.json`、`.github/workflows/ci.yml`、`.github/workflows/release.yml` — release-aware 发布与 CI 基线。
- Create: `docs/architecture/module-roles.md`、`docs/architecture/repo-conventions.md`、`docs/api/README.md` — 模块角色、依赖方向与 API 文档入口。
- Create: `modules/contract/package.json`、`modules/contract/src/index.ts`、`modules/contract/src/openapi.ts`、`modules/contract/src/schemas/*.ts` — contract 中心与 OpenAPI/Zod 导出。
- Create: `modules/api/package.json`、`modules/api/src/app.ts`、`modules/api/src/routes/health.ts`、`modules/api/src/server.ts` — Hono API 服务与 contract 绑定。
- Create: `modules/web/package.json`、`modules/web/src/main.tsx`、`modules/web/src/app.tsx`、`modules/web/src/lib/api-client.ts` — Vite + React Web 应用与 contract-driven client。
- Create: `modules/cli/package.json`、`modules/cli/src/index.ts`、`modules/cli/src/commands/health.ts` — oclif CLI 基线与共享客户端接入。
- Create: `modules/tooling/*`（按需）— 封装共享脚本、配置 helper 或生成命令。
- Create: `tests/contracts/*.test.ts`、`tests/api/*.test.ts`、`tests/web/*.spec.ts`、`tests/cli/*.test.ts` — contract/API/Web/CLI 验证面。

## 实施约束

- 不修改 `docs/superpowers/specs/2026-04-15-cz-stack-template-design.md`；实现若发现矛盾，暂停并升级决策。
- 目录命名示例采用 `modules/` 作为首版承载根目录，但文档与配置必须写明：模块角色是约束重点，未来可迁移到任意等价物理目录，只要 workspace globs 与依赖方向保持一致。
- 所有共享配置优先仓库级集中，模块仅保留必要差异化文件。
- SDK 生成保持可扩展入口，不纳入首版强制交付；contract 需保留未来生成位点。

### Task 1: 建立 workspace / package manager / TypeScript / Biome / tsdown 基线

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `tsdown.config.ts`
- Create: `.npmrc`
- Create: `.gitignore`

- [ ] Step 1: 写入仓库根 `package.json`，定义 `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke`、`pnpm validate` 等统一脚本，并加入 Biome、TypeScript、Vitest、Playwright、Changesets、tsdown 所需 devDependencies。
- [ ] Step 2: 写入 `pnpm-workspace.yaml`，包含 `modules/*`、`tooling/*`、`docs-site` 等可演进 glob，明确“不是强制目录规范，只是首版示例发现规则”。
- [ ] Step 3: 写入 `tsconfig.base.json` 与包级 `tsconfig.json` 模板约定，启用严格模式、路径引用与 monorepo 共享编译选项。
- [ ] Step 4: 写入 `biome.json` 与 `tsdown.config.ts`，让可发布包统一继承格式化/lint/构建基线，Web 应用保留 Vite 原生构建链。
- [ ] Step 5: 运行 `pnpm install`、`pnpm lint`（允许在模块尚未创建时仅校验 root config）、`pnpm typecheck`（允许首轮为空实现但命令必须可运行）。
- [ ] Step 6: 提交一次基础工具链 commit。

**Commands:**
- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`

**Expected:**
- workspace 能完成依赖安装。
- 根脚本已可枚举后续模块命令入口。
- Biome / TypeScript / tsdown 配置集中且无目录命名硬编码假设。

### Task 2: 固化模块角色约定与仓库文档入口

**Files:**
- Modify: `README.md`
- Create: `docs/architecture/module-roles.md`
- Create: `docs/architecture/repo-conventions.md`
- Create: `docs/api/README.md`

- [ ] Step 1: 改写 `README.md`，说明模板定位、快速开始、模块角色概览、验证入口与“Balanced core + optional modules”原则。
- [ ] Step 2: 新建 `docs/architecture/module-roles.md`，定义 `contract-package`、`api-service`、`web-app`、`cli-tool`、`tooling-package`、`docs-site` 的职责、依赖方向与禁止反向依赖规则。
- [ ] Step 3: 新建 `docs/architecture/repo-conventions.md`，明确“模块角色优先，不要求固定 `apps/`/`packages/`/`services/` 目录名”，并记录首版为何选择 `modules/` 作为示例物理容器。
- [ ] Step 4: 新建 `docs/api/README.md`，定义 API 文档展示入口如何从 contract 同源生成，而不是维护第二份手写规范。
- [ ] Step 5: 运行 `pnpm lint README.md docs` 或等价仓库命令，确保文档引用、命令与路径一致。
- [ ] Step 6: 提交文档与仓库约定 commit。

### Task 3: 建立 contract package 基线（OpenAPI + Zod）

**Files:**
- Create: `modules/contract/package.json`
- Create: `modules/contract/tsconfig.json`
- Create: `modules/contract/src/index.ts`
- Create: `modules/contract/src/openapi.ts`
- Create: `modules/contract/src/schemas/health.ts`
- Create: `modules/contract/src/client.ts`
- Test: `tests/contracts/contract-package.test.ts`

- [ ] Step 1: 创建 `modules/contract/package.json`，声明包名、导出字段、`build`/`typecheck`/`test` 脚本与 tsdown 构建入口。
- [ ] Step 2: 在 `src/schemas/health.ts` 定义首个健康检查 Zod schema、错误模型与共享类型导出；在 `src/openapi.ts` 组装最小 OpenAPI 文档对象。
- [ ] Step 3: 在 `src/client.ts` 提供基于 contract 的轻量请求封装接口（例如 health endpoint 的 typed fetch helper），作为 Web/CLI 共享客户端基线。
- [ ] Step 4: 在 `src/index.ts` 聚合导出 schemas、OpenAPI 文档与 typed client 工厂，保留未来 SDK 生成扩展位点说明。
- [ ] Step 5: 编写 `tests/contracts/contract-package.test.ts`，校验 Zod schema、OpenAPI 文档结构与导出 API 的一致性。
- [ ] Step 6: 运行 `pnpm --filter ./modules/contract test`、`pnpm --filter ./modules/contract build`。
- [ ] Step 7: 提交 contract 基线 commit。

**Expected:**
- 存在单一 contract 中心。
- OpenAPI 与 Zod 同源，Web/API/CLI 可共同消费。
- SDK 非强制，但后续生成不需要打破当前边界。

### Task 4: 建立 Hono API service 并接入 contract

**Files:**
- Create: `modules/api/package.json`
- Create: `modules/api/tsconfig.json`
- Create: `modules/api/src/app.ts`
- Create: `modules/api/src/routes/health.ts`
- Create: `modules/api/src/server.ts`
- Test: `tests/api/health-route.test.ts`

- [ ] Step 1: 创建 `modules/api` 包配置，声明对 `modules/contract` 的依赖与 `dev`/`build`/`test` 脚本。
- [ ] Step 2: 在 `src/routes/health.ts` 基于 contract 的 schema/类型定义健康检查路由输入输出，不手写漂移类型。
- [ ] Step 3: 在 `src/app.ts` 组装 Hono app，并提供 OpenAPI 文档与 JSON 响应入口。
- [ ] Step 4: 在 `src/server.ts` 提供本地启动入口，明确生产部署适配点与环境变量边界。
- [ ] Step 5: 编写 `tests/api/health-route.test.ts`，覆盖成功响应、响应 schema 校验与 OpenAPI 暴露结果。
- [ ] Step 6: 运行 `pnpm --filter ./modules/api test`、`pnpm --filter ./modules/api typecheck`。
- [ ] Step 7: 提交 API 基线 commit。

### Task 5: 建立 Vite + React Web app 并消费 contract-driven client

**Files:**
- Create: `modules/web/package.json`
- Create: `modules/web/tsconfig.json`
- Create: `modules/web/vite.config.ts`
- Create: `modules/web/index.html`
- Create: `modules/web/src/main.tsx`
- Create: `modules/web/src/app.tsx`
- Create: `modules/web/src/lib/api-client.ts`
- Test: `tests/web/app.spec.ts`

- [ ] Step 1: 创建 `modules/web` 包与 Vite/React 基础配置，保留与仓库共享 tsconfig、Biome 配置的衔接。
- [ ] Step 2: 在 `src/lib/api-client.ts` 封装对 `modules/contract/src/client.ts` 的消费，统一处理 base URL 与错误模型。
- [ ] Step 3: 在 `src/app.tsx` 构建最小页面，展示 contract 驱动的 health 请求结果与失败态。
- [ ] Step 4: 在 `src/main.tsx` 完成应用挂载；必要时提供 `.env.example` 说明 API 地址配置。
- [ ] Step 5: 编写 `tests/web/app.spec.ts`，使用 Playwright 覆盖页面加载、调用 health API、展示成功状态的主路径。
- [ ] Step 6: 运行 `pnpm --filter ./modules/web build`、`pnpm playwright test tests/web/app.spec.ts`。
- [ ] Step 7: 提交 Web 基线 commit。

### Task 6: 建立 oclif CLI 基线并复用共享 contract/client

**Files:**
- Create: `modules/cli/package.json`
- Create: `modules/cli/tsconfig.json`
- Create: `modules/cli/src/index.ts`
- Create: `modules/cli/src/commands/health.ts`
- Create: `modules/cli/bin/dev.js`
- Test: `tests/cli/health-command.test.ts`

- [ ] Step 1: 创建 `modules/cli` 包配置，接入 oclif、共享 tsconfig 与 `modules/contract` 依赖。
- [ ] Step 2: 在 `src/commands/health.ts` 实现健康检查命令，复用 contract-driven client，输出结构化成功/失败结果。
- [ ] Step 3: 在 `src/index.ts` 与 `bin/dev.js` 建立 CLI 入口，确保本地 smoke 命令可直接执行。
- [ ] Step 4: 编写 `tests/cli/health-command.test.ts`，覆盖最小启动、参数解析与成功输出。
- [ ] Step 5: 运行 `pnpm --filter ./modules/cli test`、`pnpm --filter ./modules/cli smoke`。
- [ ] Step 6: 提交 CLI 基线 commit。

### Task 7: 建立 Vitest / Playwright / CLI smoke 测试基线

**Files:**
- Create: `vitest.workspace.ts`
- Create: `playwright.config.ts`
- Modify: `package.json`
- Modify: `tests/contracts/contract-package.test.ts`
- Modify: `tests/api/health-route.test.ts`
- Modify: `tests/web/app.spec.ts`
- Modify: `tests/cli/health-command.test.ts`

- [ ] Step 1: 写入 `vitest.workspace.ts`，将 contract、api、cli、repo 等测试组织为可独立过滤的 workspace project。
- [ ] Step 2: 写入 `playwright.config.ts`，定义 Web app dev server 与基础浏览器矩阵；保持首版仅跑主路径测试。
- [ ] Step 3: 在根 `package.json` 补齐 `test:unit`、`test:e2e`、`smoke:cli`、`validate` 组合命令。
- [ ] Step 4: 校准各测试文件命名、脚本与 fixture 位置，使 `pnpm test` 在冷启动仓库可一键执行。
- [ ] Step 5: 运行 `pnpm test`、`pnpm smoke`，记录预期输出（Vitest 全绿、Playwright 通过、CLI smoke 返回 0）。
- [ ] Step 6: 提交测试基线 commit。

### Task 8: 建立 Changesets 与 release-aware CI

**Files:**
- Create: `.changeset/config.json`
- Create: `.changeset/README.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/actions/*`（如需复用 action）
- Modify: `package.json`

- [ ] Step 1: 配置 `.changeset/config.json`，启用多包版本编排、changelog 生成与 base branch 为 `main` 的发布流程。
- [ ] Step 2: 在根 `package.json` 加入 `changeset`、`version-packages`、`release:check` 等脚本。
- [ ] Step 3: 编写 `.github/workflows/ci.yml`，至少包含 install、typecheck、lint、test、build、OpenAPI 校验、changeset 校验、CLI smoke、Playwright。
- [ ] Step 4: 编写 `.github/workflows/release.yml`，实现 release-aware 流程：有 changeset 时生成版本 PR/发版准备，无 changeset 时只做发布前检查。
- [ ] Step 5: 若需要复用步骤，新增 `.github/actions/*` 本地 action，避免 workflow 复制粘贴。
- [ ] Step 6: 运行 `pnpm changeset status`、`pnpm release:check`，并通过本地 YAML 校验或最小 GitHub Actions lint 工具验证 workflow 语法。
- [ ] Step 7: 提交 CI / release commit。

### Task 9: 收口文档入口、架构说明与实现验证说明

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/module-roles.md`
- Modify: `docs/architecture/repo-conventions.md`
- Modify: `docs/api/README.md`
- Create: `docs/architecture/validation.md`

- [ ] Step 1: 在 `README.md` 增加快速验证命令、模块入口链接与首版模板包含/不包含能力清单。
- [ ] Step 2: 在 `docs/architecture/*.md` 标注 contract 中心、依赖方向、后端服务内的 SQLite-first 默认落地姿态、可选 SDK 生成与非目标约束。
- [ ] Step 3: 新建 `docs/architecture/validation.md`，列出本模板实现完成后必须通过的命令、预期结果与失败排查起点。
- [ ] Step 4: 运行 `pnpm lint` 与所有文档链接检查命令（若仓库无专用工具，则至少执行 Markdown 链接/路径自检）。
- [ ] Step 5: 提交文档收口 commit。

## 全量验证命令与预期结果

- `pnpm install` → 成功安装 workspace 依赖，无 peer dependency 致命错误。
- `pnpm lint` → Biome 检查通过；文档与源码格式一致。
- `pnpm typecheck` → root + 各模块 TypeScript 检查通过。
- `pnpm test` → Vitest 全部通过。
- `pnpm playwright test` → Web 主路径通过。
- `pnpm smoke` → CLI smoke 返回 0，输出 health 成功结果。
- `pnpm build` → contract / api / cli 等构建通过，web 产出 Vite 构建结果。
- `pnpm changeset status` → changeset 状态输出符合当前版本流程预期。
- `pnpm release:check` → 发布前检查通过。

## 推荐提交切分

1. `chore: add workspace tooling baseline`
2. `docs: document module roles and repo conventions`
3. `feat: add contract package baseline`
4. `feat: add hono api baseline`
5. `feat: add web app baseline`
6. `feat: add cli baseline`
7. `test: add unified validation baseline`
8. `ci: add release-aware workflows`
9. `docs: add validation entrypoints`

## 自检结果（已按 spec 逐项补齐）

- [x] 已覆盖 pnpm workspace、TypeScript only、Biome、tsdown 基线。
- [x] 已覆盖模块角色导向约定，并明确不把 `modules/` 视为唯一固定目录结构。
- [x] 已覆盖 contract package、OpenAPI + Zod、typed client 与文档入口同源。
- [x] 已覆盖 Hono API、Vite + React Web、oclif CLI 对共享 contract 的接入。
- [x] 已覆盖后端服务内的 SQLite-first 默认落地姿态，且未引入额外共享数据库抽象层。
- [x] 已覆盖 Vitest、Playwright、CLI smoke、Changesets、release-aware CI。
- [x] 已覆盖 README、架构文档、API 文档入口与验证命令。
- [x] 已扫描并移除占位性表述；所有步骤均给出明确文件路径与执行命令。
