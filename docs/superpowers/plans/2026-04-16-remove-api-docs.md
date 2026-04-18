# Remove API Docs Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 `@cz-stack/api` 中移除内置 `/docs` 路由与 Swagger UI HTML 渲染逻辑，保留 `/openapi.json` 行为不变，并同步收紧测试与文档边界。

**Architecture:** 本次实现只做边界收缩，不新增替代入口、抽象层或兼容逻辑。API 应继续作为运行时路由容器暴露 `/health` 与 `/openapi.json`，而文档展示职责只保留在仓库文档描述层，不再内嵌到 `modules/api/src/app.ts`。

**Tech Stack:** TypeScript、Hono、Vitest、Biome、pnpm。

---

## 文件结构与职责映射

- Modify: `modules/api/src/app.ts` - 删除 `renderDocsHtml` 与 `app.get("/docs", ...)`，保留 `openApiDocument` 的 `/openapi.json` 导出。
- Modify: `tests/api/health-route.test.ts` - 把 `/docs` 成功入口断言改为“`@cz-stack/api` 不再承担 `/docs` 展示职责”的基线，同时继续覆盖 `/openapi.json`。
- Modify: `docs/architecture/module-roles.md` - 把 `api-service` 的当前落地要求更新为仅暴露 `/health` 与 `/openapi.json`，将文档展示责任归回 `docs-site` / 独立文档入口。
- Modify: `docs/api/README.md` - 删除 API 自带 `/docs` 的描述，改为只说明 `/openapi.json` 是当前 API 侧保留的文档入口，展示层需由 API 之外承载。

## 实施约束

- 只处理 `@cz-stack/api` 的 `/docs` 移除，不修改 `@cz-stack/contract`。
- 不新增新的 `/docs` 替代路由、重定向、静态 HTML 或 feature flag。
- `/openapi.json` 返回值必须继续与 `@cz-stack/contract` 导出的 `openApiDocument` 一致。
- 测试步骤必须遵循 TDD：先改测试制造失败，再做最小实现让其通过。
- 文档更新只能反映“移除 `/docs`、保留 `/openapi.json`”这一边界，不扩展到新的 docs-site 实现。

### Task 1: 用 TDD 收紧 API 路由与测试基线

**Files:**
- Modify: `tests/api/health-route.test.ts`
- Modify: `modules/api/src/app.ts`

- [ ] Step 1: 先修改 `tests/api/health-route.test.ts`，把现有 `/docs` 成功入口测试与 prefix-aware 源码边界测试替换成“`/docs` 不再由 API 提供”的失败测试，同时保留 `/openapi.json` 断言不动。

```ts
  it("does not expose a docs route from the api package", async () => {
    const app = apiModule.createApp();

    const response = await app.request("/docs");

    expect(response.status).toBe(404);
  });

  it("removes docs rendering logic from the api app boundary", async () => {
    const apiSource = await readFile(apiSourceUrl, "utf8");

    expect(apiSource).toContain('import { openApiDocument } from "@cz-stack/contract";');
    expect(apiSource).toContain('app.get("/openapi.json", (context) => context.json(openApiDocument, 200));');
    expect(apiSource).not.toContain('app.get("/docs"');
    expect(apiSource).not.toContain("renderDocsHtml");
    expect(apiSource).not.toContain('new URL("./openapi.json", context.req.url).pathname');
    expect(apiSource).not.toContain("SwaggerUIBundle");
    expect(apiSource).not.toContain("contract/generated");
  });
```

- [ ] Step 2: 运行 API 集成测试，确认新基线先失败，失败点应来自源码里仍然存在 `/docs` 实现。

Run: `pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project api tests/api/health-route.test.ts`
Expected: FAIL；`does not expose a docs route from the api package` 仍收到 `200`，且/或源码断言仍匹配到 `app.get("/docs"`、`renderDocsHtml`、`SwaggerUIBundle`。

- [ ] Step 3: 以最小改动更新 `modules/api/src/app.ts`，直接删除 Swagger UI HTML 与 `/docs` 路由，只保留健康检查和 `/openapi.json`。

```ts
import { openApiDocument } from "@cz-stack/contract";
import { Hono } from "hono";

import { registerHealthRoute } from "./routes/health.js";

export const createApp = () => {
  const app = new Hono();

  registerHealthRoute(app);

  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
```

- [ ] Step 4: 重新运行同一组 API 测试，确认最小实现已经满足新边界。

Run: `pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project api tests/api/health-route.test.ts`
Expected: PASS；`/health`、`/openapi.json` 继续通过，`/docs` 断言返回 `404`，源码边界断言确认 `modules/api/src/app.ts` 不再包含 Swagger UI 相关实现。

- [ ] Step 5: 做补丁级自检，确认 `modules/api/src/app.ts` 只发生边界收缩，没有引入额外路由或 helper。

Run: `git diff -- modules/api/src/app.ts tests/api/health-route.test.ts`
Expected: diff 只包含删除 `/docs` HTML/路由实现，以及测试从“成功展示文档”切换为“明确不再提供 `/docs`”。

### Task 2: 同步仓库文档到新模块边界

**Files:**
- Modify: `docs/architecture/module-roles.md`
- Modify: `docs/api/README.md`

- [ ] Step 1: 更新 `docs/architecture/module-roles.md` 的 `api-service` 与 `docs-site` 段落，删除“API 当前提供 `/docs`”的表述，并明确展示层不再属于 API 服务。

```md
- 当前落地要求：`@cz-stack/api` 已提供 `/health` 与 `/openapi.json`；其中 `/openapi.json` 必须继续由 contract 同源驱动，API 服务不再内置 `/docs` 文档页面。

- 当前落地要求：在完整 docs-site 尚未存在前，README 与 `docs/api/README.md` 只负责说明文档入口与边界；API 文档展示不再由 API 服务内置 `/docs` 承担。
```

- [ ] Step 2: 更新 `docs/api/README.md`，删除 `/docs` UI 入口、`http://localhost:3100/docs` 示例和“渲染后的 docs entry”描述，只保留 `/openapi.json` 与 contract 同源关系。

```md
- `@cz-stack/contract` 导出 OpenAPI 文档、Zod schema 与共享 client。
- `@cz-stack/api` 提供 `/openapi.json` 文档数据入口，不再内置 `/docs` 展示页面。

  contract-package (OpenAPI + Zod)
          -> export openApiDocument
          -> api-service exposes /openapi.json
          -> README / docs-site link to the exported OpenAPI document

- API 文档 JSON：`modules/api` 启动后访问 `/openapi.json`
- API 文档展示：应由 API 之外的独立文档入口承载

如果需要本地检查当前 API 侧文档出口，可先运行 `PORT=3100 pnpm --filter ./modules/api run dev`，再访问 `http://localhost:3100/openapi.json`。
```

- [ ] Step 3: 对文档做定向格式检查，确保 Markdown 改动无明显语法或格式问题。

Run: `pnpm exec biome check docs/architecture/module-roles.md docs/api/README.md`
Expected: 成功退出，无 Markdown/format 诊断。

- [ ] Step 4: 对照 spec 做一次文档范围自检，确认文档没有暗示本次会交付新的 docs-site 或替代 UI。

Run: `git diff -- docs/architecture/module-roles.md docs/api/README.md`
Expected: diff 只删除 `/docs` 相关现状描述，并把展示职责明确放回 API 之外；不存在新的站点实现说明、部署步骤或超出本次范围的重写。

## 全量验证命令与预期结果

- `pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project api tests/api/health-route.test.ts` -> API 测试通过，确认 `/docs` 已移除且 `/openapi.json` 保持不变。
- `pnpm exec biome check docs/architecture/module-roles.md docs/api/README.md` -> 两个 Markdown 文档检查通过。
- `git diff -- modules/api/src/app.ts tests/api/health-route.test.ts docs/architecture/module-roles.md docs/api/README.md` -> diff 只包含 `/docs` 删除、测试基线更新与文档边界收紧。
- `git diff --check` -> 无 trailing whitespace、冲突标记或补丁格式错误。

## 自检结果

- [x] 已覆盖 spec 要求的四个改动点：删除 `/docs`、删除 Swagger UI HTML 逻辑、保留 `/openapi.json`、同步更新测试与文档。
- [x] 计划保持最小实现，只触及 `modules/api/src/app.ts`、`tests/api/health-route.test.ts`、`docs/architecture/module-roles.md`、`docs/api/README.md`。
- [x] 测试任务采用 TDD 顺序，先让 `/docs` 新基线失败，再做最小代码删除使其通过。
- [x] 文档步骤没有引入 docs-site 新实现、兼容层、重定向或 contract 改造。
- [x] 已消除占位符；所有步骤都包含明确文件、命令与预期结果。
