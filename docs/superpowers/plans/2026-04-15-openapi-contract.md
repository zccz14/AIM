# OpenAPI Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `@cz-stack/contract` 切换为 OpenAPI-first 单一事实源，生成类型 / client / Zod schema，并保持根入口稳定 API 与全仓库消费者边界不变。

**Architecture:** 在 `modules/contract/openapi/openapi.yaml` 手工维护唯一契约源，通过 `@hey-api/openapi-ts` 与 `openapi-zod-client` 生成 `modules/contract/generated/*`，再由 `modules/contract/src/*` 做薄包装与稳定导出。测试与脚本同步迁移到“验证生成链路 + 验证根入口边界”的模式，一次性删除旧的手写 schema / 手写 OpenAPI 实现。

**Tech Stack:** pnpm workspace、TypeScript、Zod、OpenAPI 3.1 YAML、@hey-api/openapi-ts、openapi-zod-client、Vitest、tsdown。

---

## 文件结构与职责映射

- Create: `modules/contract/openapi/openapi.yaml` — 唯一手工维护的 OpenAPI 3.1 契约源。
- Create: `modules/contract/generated/types.ts` — `@hey-api/openapi-ts` 生成的类型定义。
- Create: `modules/contract/generated/client.ts` — `@hey-api/openapi-ts` 生成的基础调用客户端。
- Create: `modules/contract/generated/zod.ts` — `openapi-zod-client` 生成的运行时校验 schema。
- Modify: `modules/contract/package.json` — 添加生成依赖、生成脚本、构建前置命令与发布文件清单。
- Modify: `package.json` — 根脚本改为显式包含 contract 生成 / 校验链路，收敛 `openapi:check`。
- Modify: `modules/contract/src/index.ts` — 仅聚合稳定公开边界，禁止直接透出 `generated/*` 路径。
- Modify: `modules/contract/src/client.ts` — 改为包裹生成 client，并用生成的 Zod schema 解析成功 / 错误响应。
- Modify: `modules/contract/src/openapi.ts` — 从 YAML / 生成产物包装稳定的 `openApiDocument` 导出，不再手写对象拼装。
- Modify: `modules/api/src/app.ts`、`modules/api/src/routes/health.ts`、`modules/web/src/lib/api-client.ts`、`modules/cli/src/commands/health.ts` — 继续只消费根入口稳定 API，并适配 `createContractClient({ fetch })` 新边界。
- Modify: `tests/contracts/contract-package.test.ts`、`tests/api/health-route.test.ts`、`tests/cli/health-command.test.ts`、`tests/web/app.spec.ts` — 覆盖生成产物存在、根入口稳定、OpenAPI JSON 与 schema 一致、消费者不依赖 `generated/*`。
- Delete: `modules/contract/src/schemas/health.ts` — 删除手写 schema。

## 实施约束

- 只实现 `docs/superpowers/specs/2026-04-15-openapi-contract-design.md` 已批准范围；不新增 transport 配置、重试、token 注入、isomorphic fetch 兼容层。
- `generated/*` 允许提交入库，但必须通过脚本重生成，任何任务都不得手工维护生成文件。
- 其他模块只允许从 `@cz-stack/contract` 根入口导入；若测试或源码出现 `generated/*` 直连导入，必须一并迁回根入口。
- `createContractClient()` 的稳定输入只保留 `fetch: typeof fetch`；URL 解析与认证逻辑由调用方包装后的 `fetch` 负责。

### Task 1: 先写失败测试，锁定 OpenAPI-first 边界

**Files:**
- Modify: `tests/contracts/contract-package.test.ts`
- Modify: `tests/api/health-route.test.ts`
- Modify: `tests/cli/health-command.test.ts`
- Modify: `tests/web/app.spec.ts`

- [ ] Step 1: 在 `tests/contracts/contract-package.test.ts` 先补一组失败断言，要求 built package 只导出根入口稳定成员、存在 `openApiDocument` 与运行时 schema、且不再依赖 `src/schemas/health.ts`。测试片段直接写成：

```ts
expect(Object.keys(contractModule).sort()).toEqual([
  "ContractClientError",
  "createContractClient",
  "healthErrorSchema",
  "healthPath",
  "healthResponseSchema",
  "openApiDocument",
]);
expect(contractModule.openApiDocument.paths[contractModule.healthPath]).toBeDefined();
```

- [ ] Step 2: 在同一测试文件中增加生成链路断言，检查 `modules/contract/generated/types.ts`、`modules/contract/generated/client.ts`、`modules/contract/generated/zod.ts` 已被构建输入消费，且 `package.json` 存在生成脚本。可直接读取文件内容并断言：

```ts
expect(rootPackage.scripts["openapi:generate"]).toContain("modules/contract");
expect(await readFile(new URL("../../modules/contract/generated/zod.ts", import.meta.url), "utf8")).toContain("health");
```

- [ ] Step 3: 在 `tests/api/health-route.test.ts` 先把 `/openapi.json` 断言改成“与 contract 根入口导出的文档完全一致”，并保留使用 `healthResponseSchema.safeParse(payload)` 的断言，确保 API 侧不会回到手写 schema。

- [ ] Step 4: 在 `tests/cli/health-command.test.ts` 写入新失败断言，验证 CLI 侧通过调用方提供的 base URL 包装 fetch 命中 `/health`，但 contract 本身不再暴露 `ContractFetch` 类型或 `baseUrl` 配置约束。

- [ ] Step 5: 在 `tests/web/app.spec.ts` 保留页面主路径断言，并增加一条针对 `/api/health` 拦截的用例，证明 Web 层自己负责把相对 contract 路径绑定到浏览器中的 API 基地址。

- [ ] Step 6: 运行失败测试，确认当前实现尚未满足新边界。

**Commands:**
- `pnpm test:build-fixtures`
- `pnpm exec vitest run tests/contracts/contract-package.test.ts tests/api/health-route.test.ts tests/cli/health-command.test.ts`
- `pnpm exec playwright test tests/web/app.spec.ts`

**Expected:**
- 至少出现与缺少生成文件、旧导出清单或旧 client 边界相关的失败。

### Task 2: 引入 OpenAPI 源文件与代码生成脚本

**Files:**
- Create: `modules/contract/openapi/openapi.yaml`
- Modify: `modules/contract/package.json`
- Modify: `package.json`

- [ ] Step 1: 新建 `modules/contract/openapi/openapi.yaml`，把当前 health 契约完整转成 OpenAPI 3.1 YAML，包含 `info`、`paths./health.get`、`components.schemas.HealthResponse`、`components.schemas.HealthError`、`components.securitySchemes.bearerAuth` 与 operation 级 `security`。YAML 骨架直接按下面写：

```yaml
openapi: 3.1.0
info:
  title: CZ-Stack Contract
  version: 0.0.0
paths:
  /health:
    get:
      operationId: getHealth
      security:
        - bearerAuth: []
      responses:
        "200":
          description: Healthy response
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthResponse"
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
```

- [ ] Step 2: 在 `modules/contract/package.json` 添加生成依赖与脚本，包含 `@hey-api/openapi-ts`、`openapi-zod-client`、`yaml` 以及 `generate` / `generate:check` / `build` 串联命令。`src/openapi.ts` 统一采用运行时解析 YAML 的实现，脚本显式落到 `modules/contract/generated/*.ts`：

```json
{
  "scripts": {
    "generate:types": "pnpm exec openapi-ts --input ./openapi/openapi.yaml --output ./generated/types.ts",
    "generate:client": "pnpm exec openapi-ts --input ./openapi/openapi.yaml --output ./generated/client.ts --client @hey-api/client-fetch",
    "generate:zod": "pnpm exec openapi-zod-client ./openapi/openapi.yaml ./generated/zod.ts",
    "generate": "pnpm run generate:types && pnpm run generate:client && pnpm run generate:zod",
    "generate:check": "pnpm run generate && git diff --exit-code -- generated openapi/openapi.yaml",
    "build": "pnpm run generate && pnpm --dir ../.. exec tsdown --config tsdown.config.ts --entry modules/contract/src/index.ts --out-dir modules/contract/dist"
  }
}
```

- [ ] Step 3: 在根 `package.json` 增加 `openapi:generate` 与新的 `openapi:check`，要求校验链路显式先生成 contract 产物，再 build contract，再断言 `openApiDocument.openapi === "3.1.0"` 且 `/health` 路径存在。

- [ ] Step 4: 运行生成命令并确认三类生成文件实际落盘，再运行 `pnpm openapi:check` 验证脚本入口可执行。

- [ ] Step 5: 提交一次“引入 OpenAPI 源与生成脚本”的 commit。

**Commands:**
- `pnpm --filter ./modules/contract generate`
- `pnpm openapi:check`

**Expected:**
- `modules/contract/openapi/openapi.yaml` 成为唯一手工维护契约源。
- `modules/contract/generated/{types,client,zod}.ts` 可由脚本稳定重生成。

### Task 3: 用生成产物重建 contract 根入口与薄包装

**Files:**
- Create: `modules/contract/generated/types.ts`
- Create: `modules/contract/generated/client.ts`
- Create: `modules/contract/generated/zod.ts`
- Modify: `modules/contract/src/index.ts`
- Modify: `modules/contract/src/client.ts`
- Modify: `modules/contract/src/openapi.ts`
- Delete: `modules/contract/src/schemas/health.ts`

- [ ] Step 1: 让 `modules/contract/src/openapi.ts` 改为从 `openapi/openapi.yaml` 构造稳定 `openApiDocument` 导出，而不是继续手写对象；若运行时直接读取 YAML，代码可按下面组织：

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const openapiSource = readFileSync(fileURLToPath(new URL("../openapi/openapi.yaml", import.meta.url)), "utf8");
export const openApiDocument = parse(openapiSource) as OpenApiDocument;
export const healthPath = "/health";
```

- [ ] Step 2: 把 `modules/contract/src/client.ts` 重写成只接收 `fetch: typeof fetch` 的薄包装，并通过生成的 client / Zod schema 做成功与错误响应解析。关键结构保持：

```ts
export type ContractClientOptions = {
  fetch: typeof fetch;
};

export const createContractClient = ({ fetch: fetchImpl }: ContractClientOptions): ContractClient => ({
  async getHealth() {
    const response = await fetchImpl(new Request(healthPath, { method: "GET", headers: { accept: "application/json" } }));
    const payload = await response.json();
    if (!response.ok) throw new ContractClientError(response.status, healthErrorSchema.parse(payload));
    return healthResponseSchema.parse(payload);
  },
});
```

- [ ] Step 3: 在 `modules/contract/src/index.ts` 仅重导出稳定名称：`createContractClient`、`ContractClientError`、`healthPath`、运行时 schema、公开类型、`openApiDocument`；删除 `ContractFetch` 导出，并且不要新增 `generated/*` re-export。

- [ ] Step 4: 删除 `modules/contract/src/schemas/health.ts`，把 health schema / 类型来源全部迁到 `generated/zod.ts` 与 `generated/types.ts` 的包装导出上；真实生成命名一律在 `src/index.ts` 或 `src/client.ts` 内做本地别名映射，不把生成命名泄漏出去。

- [ ] Step 5: 运行 contract 定向测试与构建，直到 Task 1 的失败测试转绿。

**Commands:**
- `pnpm --filter ./modules/contract test`
- `pnpm --filter ./modules/contract build`

**Expected:**
- `src/` 只剩稳定包装层。
- `generated/*` 成为内部实现细节，且运行时成功 / 错误响应都由生成 Zod schema 解析。

### Task 4: 迁移消费者与边界测试到新 client 约定

**Files:**
- Modify: `modules/api/src/app.ts`
- Modify: `modules/api/src/routes/health.ts`
- Modify: `modules/web/src/lib/api-client.ts`
- Modify: `modules/cli/src/commands/health.ts`
- Modify: `tests/api/health-route.test.ts`
- Modify: `tests/cli/health-command.test.ts`
- Modify: `tests/web/app.spec.ts`

- [ ] Step 1: 在 `modules/api/src/routes/health.ts` 继续从根入口导入 `healthPath`、`healthResponseSchema` 与类型，确保响应 payload 仍先通过 contract schema 解析再返回，不引入 `generated/*` 直连。

- [ ] Step 2: 在 `modules/web/src/lib/api-client.ts` 把调用改成“由 Web 先解析 `baseUrl`，再把包装后的 `fetch` 传给 `createContractClient`”，例如：

```ts
const resolvedBaseUrl = new URL(baseUrl, window.location.origin);
const contractClient = createContractClient({
  fetch: (input, init) => {
    const request = new Request(input, init);
    return fetch(new URL(request.url, resolvedBaseUrl), request);
  },
});
```

- [ ] Step 3: 在 `modules/cli/src/commands/health.ts` 做同样包装，把 `--base-url` 留在 CLI 层，而不是 contract 层；继续将 `ContractClientError` 转成结构化 JSON 输出。

- [ ] Step 4: 在 `modules/api/src/app.ts` 保持 `/openapi.json` 与 `/docs` 行为不变，但断言来源必须是新的 `openApiDocument` 包装层，而不是旧手写对象。

- [ ] Step 5: 在 `tests/web/app.spec.ts` 保持现有 UI 断言，同时确认路由拦截仍命中 `/api/health`，避免 contract client 改造后把浏览器请求退化成不可控的绝对 URL。

- [ ] Step 6: 运行 API / CLI / Web 测试，确认消费者无需知道 `generated/*` 命名与路径。

**Commands:**
- `pnpm --filter ./modules/api test`
- `pnpm --filter ./modules/cli test`
- `pnpm exec playwright test tests/web/app.spec.ts`

**Expected:**
- transport 边界被下沉到 Web / CLI 调用方包装 fetch。
- API / CLI / Web 继续只依赖 `@cz-stack/contract` 根入口。

### Task 5: 删除旧手写 OpenAPI / schema 资产并补齐生成校验

**Files:**
- Modify: `tests/contracts/contract-package.test.ts`
- Modify: `package.json`
- Modify: `modules/contract/package.json`
- Delete: `modules/contract/src/schemas/health.ts`

- [ ] Step 1: 搜索仓库内对 `modules/contract/src/schemas/health.ts`、`ContractFetch`、旧 `baseUrl` client 约定的引用，并把残留引用全部改为根入口稳定 API；若仅测试仍引用旧导出，也要一并删除。

- [ ] Step 2: 在 `tests/contracts/contract-package.test.ts` 补一个“无泄漏”断言，直接读取 `modules/contract/src/index.ts` 或 built exports，确认没有 `generated/`、`ContractFetch` 等字符串泄漏。例如：

```ts
const entrySource = await readFile(new URL("../../modules/contract/src/index.ts", import.meta.url), "utf8");
expect(entrySource).not.toContain("export * from \"../generated");
expect(Object.keys(contractModule)).not.toContain("ContractFetch");
```

- [ ] Step 3: 在根 `package.json` 与 `modules/contract/package.json` 保留 `generate:check` / `openapi:check` / `build` 的串联关系，确保 CI 或本地验证时生成文件过期能够直接暴露。

- [ ] Step 4: 运行 contract 测试 + 根 `openapi:check`，确认手写 schema 彻底退出工作流。

- [ ] Step 5: 提交一次“移除手写契约资产”的 commit。

**Commands:**
- `pnpm exec vitest run tests/contracts/contract-package.test.ts`
- `pnpm openapi:check`

**Expected:**
- 仓库不再保留手写 schema / 手写 OpenAPI 双轨维护。

### Task 6: 执行全量验证并整理提交

**Files:**
- Modify: `package.json`
- Modify: `modules/contract/package.json`
- Modify: `modules/contract/openapi/openapi.yaml`
- Modify: `modules/contract/generated/types.ts`
- Modify: `modules/contract/generated/client.ts`
- Modify: `modules/contract/generated/zod.ts`
- Modify: `modules/contract/src/index.ts`
- Modify: `modules/contract/src/client.ts`
- Modify: `modules/contract/src/openapi.ts`
- Modify: `modules/api/src/app.ts`
- Modify: `modules/api/src/routes/health.ts`
- Modify: `modules/web/src/lib/api-client.ts`
- Modify: `modules/cli/src/commands/health.ts`
- Modify: `tests/contracts/contract-package.test.ts`
- Modify: `tests/api/health-route.test.ts`
- Modify: `tests/cli/health-command.test.ts`
- Modify: `tests/web/app.spec.ts`

- [ ] Step 1: 运行 contract 生成、构建、类型检查与跨模块测试命令，顺序固定为“generate → build fixtures → targeted tests → root checks”，避免出现测试读取陈旧 dist。

- [ ] Step 2: 将 `openapi-zod-client` 与 `@hey-api/openapi-ts` 的真实导出名全部收敛到 `modules/contract/src/*` 内的稳定别名适配层，不改 spec 要求的公开边界。

- [ ] Step 3: 清理不再需要的导入、脚本或注释，确认 `generated/*` 全部为自动生成文件且没有手工编辑痕迹。

- [ ] Step 4: 按功能切分提交，优先使用以下 commit 序列：

```bash
git commit -m "test: lock openapi contract boundary"
git commit -m "build: add openapi generators"
git commit -m "refactor: switch contract package to generated artifacts"
git commit -m "test: migrate contract consumers"
```

- [ ] Step 5: 若实现阶段选择单提交，提交主题统一使用 repo 当前句式风格的祈使句，例如 `Refactor contract package around generated OpenAPI artifacts`。

**Commands:**
- `pnpm --filter ./modules/contract generate`
- `pnpm test:build-fixtures`
- `pnpm exec vitest run tests/contracts/contract-package.test.ts tests/api/health-route.test.ts tests/cli/health-command.test.ts`
- `pnpm exec playwright test tests/web/app.spec.ts`
- `pnpm --filter ./modules/contract typecheck`
- `pnpm openapi:check`

**Expected:**
- 定向验证全部通过。
- 公开 API、生成链路、消费者边界与文档导出均符合 spec。

## 全量验证命令与预期结果

- `pnpm --filter ./modules/contract generate` → 生成 `modules/contract/generated/{types,client,zod}.ts`，命令退出码为 0。
- `pnpm --filter ./modules/contract build` → contract 构建成功，`dist/index.mjs` 可被测试动态导入。
- `pnpm test:build-fixtures` → contract / api / db / cli fixture build 成功，无缺失导出。
- `pnpm exec vitest run tests/contracts/contract-package.test.ts tests/api/health-route.test.ts tests/cli/health-command.test.ts` → contract / api / cli 相关迁移测试全部通过。
- `pnpm exec playwright test tests/web/app.spec.ts` → Web 页面仍显示健康成功态，并在 503 mock 下展示共享错误态。
- `pnpm --filter ./modules/contract typecheck` → contract 包类型检查通过。
- `pnpm openapi:check` → 重新生成后无脏 diff，且 `openApiDocument.openapi === "3.1.0"`、`paths[healthPath]` 存在。

## 推荐提交切分

1. `test: lock openapi contract boundary`
2. `build: add openapi generators`
3. `refactor: switch contract package to generated artifacts`
4. `test: migrate contract consumers`

## 自检结果（已按 spec 逐项补齐）

- [x] 已覆盖 `modules/contract/openapi/openapi.yaml` 作为唯一事实源。
- [x] 已覆盖 `@hey-api/openapi-ts`、`openapi-zod-client` 依赖与脚本链路。
- [x] 已覆盖 `generated/types.ts`、`generated/client.ts`、`generated/zod.ts` 的产物布局与“提交入库但禁止手改”的约束。
- [x] 已覆盖 `modules/contract/src` 薄包装、`createContractClient()` / `ContractClientError` 稳定边界，以及 `ContractFetch` 移除。
- [x] 已覆盖 `tests/contracts`、`tests/api`、`tests/cli`、`tests/web` 与消费者迁移，并明确删除手写 schema / 手写 OpenAPI 资产。
