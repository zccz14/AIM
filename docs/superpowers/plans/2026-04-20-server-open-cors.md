# Server Open CORS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以最小改动在 `modules/api` 顶层统一开启全局开放 CORS，让所有现有与未来端点在所有环境中都允许任意来源访问，并让普通请求与预检请求都具备可验证的响应头行为。

**Architecture:** 保持改动集中在 API 入口 `modules/api/src/app.ts`，通过一次顶层 `app.use("*", cors({ origin: "*" }))` 让整棵路由继承相同跨域策略，不增加环境分支、白名单或按路由例外。测试沿用现有 `modules/api/test/health-route.test.ts` 基线用例，在同一文件补充一个普通 GET 请求断言和一个 OPTIONS 预检断言，避免新增无必要测试文件。

**Tech Stack:** TypeScript、Hono、Vitest、pnpm、Biome。

---

## 文件结构与职责映射

- Modify: `modules/api/src/app.ts:1-16` - 引入 `hono/cors` 并在 `createApp()` 中对顶层 `Hono` 实例注册一次全局 CORS 中间件，作用范围覆盖健康检查、任务路由和 `/openapi.json`。
- Modify: `modules/api/test/health-route.test.ts:44-158` - 在现有 API 基线测试文件中增加 CORS 行为断言，验证普通跨域请求和预检请求都继承全局开放策略。
- No change: `package.json` - 根脚本已提供本次所需的最小构建与 Vitest 运行能力，不需要新增或调整脚本。
- No change: `modules/api/package.json` - API 包已具备 `build`、`test:type`、`test:lint`、`test` 脚本，本次不需要改包清单。

## 实施约束

- 不修改已批准 spec：`docs/superpowers/specs/2026-04-20-server-open-cors-design.md`。
- 不新增环境变量、origin 白名单、凭据开关、按路由差异化配置或辅助封装函数。
- 不新增测试文件；直接在 `modules/api/test/health-route.test.ts` 中补充最小必要断言即可。
- 若实现后发现现有测试已自然覆盖某一条普通请求响应头，仅保留缺失的断言，不要为了形式重复覆盖同一行为。

### Task 1: 在 API 顶层注册全局开放 CORS 并补足回归测试

**Files:**
- Modify: `modules/api/test/health-route.test.ts:55-158`
- Modify: `modules/api/src/app.ts:1-16`

- [ ] **Step 1: 先在现有 API 基线测试中写出失败断言，覆盖普通跨域请求与预检请求。**

```ts
  it("returns permissive CORS headers for normal API responses", async () => {
    const app = apiModule.createApp();

    const response = await app.request(contractModule.healthPath, {
      headers: {
        origin: "https://frontend.example",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("answers CORS preflight requests with the same global policy", async () => {
    const app = apiModule.createApp();

    const response = await app.request(contractModule.healthPath, {
      method: "OPTIONS",
      headers: {
        origin: "https://frontend.example",
        "access-control-request-method": "GET",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });
```

Run: `pnpm --filter @aim-ai/contract run build && pnpm --filter @aim-ai/api run build && pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/health-route.test.ts`
Expected: 新增的两个用例失败，且失败点集中在缺少 `access-control-allow-origin` / 预检响应不符合预期，证明当前顶层 app 还未注册全局 CORS。

- [ ] **Step 2: 在 `createApp()` 顶层注册一次 Hono 官方 CORS 中间件，只表达“任意来源访问全部端点”。**

```ts
import { openApiDocument } from "@aim-ai/contract";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { registerHealthRoute } from "./routes/health.js";
import { registerTaskRoutes } from "./routes/tasks.js";

export const createApp = () => {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));

  registerHealthRoute(app);
  registerTaskRoutes(app);

  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
```

Run: `git diff -- modules/api/src/app.ts`
Expected: diff 只显示新增 `hono/cors` import 和一条顶层 `app.use("*", cors({ origin: "*" }))`；路由注册顺序与 `/openapi.json` 暴露保持不变。

- [ ] **Step 3: 重新运行同一组构建加目标测试，确认普通请求与预检请求都通过。**

Run: `pnpm --filter @aim-ai/contract run build && pnpm --filter @aim-ai/api run build && pnpm exec vitest run --config vitest.workspace.ts --project api modules/api/test/health-route.test.ts`
Expected: `modules/api/test/health-route.test.ts` 全部通过；新增用例分别证明健康检查响应带有 `access-control-allow-origin: *`，且 `OPTIONS` 预检返回允许方法头。

- [ ] **Step 4: 对本次实际修改文件执行最小静态校验，确认没有引入格式或类型问题。**

Run: `pnpm --filter @aim-ai/api run test:type && pnpm --filter @aim-ai/api run test:lint`
Expected: 两个命令均通过；不出现 `modules/api/src/app.ts` 或 `modules/api/test/health-route.test.ts` 的 TypeScript / Biome 报错。

- [ ] **Step 5: 人工复核最终差异，确认没有超出 spec 范围，也明确说明没有其他测试文件需要改动。**

Run: `git diff -- modules/api/src/app.ts modules/api/test/health-route.test.ts docs/superpowers/plans/2026-04-20-server-open-cors.md`
Expected: 只看到计划文件、`modules/api/src/app.ts` 与 `modules/api/test/health-route.test.ts` 的最小必要变更；没有其他测试文件被修改，因为现有基线测试文件已经足够覆盖本次全局 CORS 需求。

- [ ] **Step 6: 提交实现改动，提交信息聚焦 API 顶层开放 CORS。**

```bash
git add modules/api/src/app.ts modules/api/test/health-route.test.ts docs/superpowers/plans/2026-04-20-server-open-cors.md
git commit -m "feat: enable open cors for api"
```

Run: `git status --short`
Expected: 不再出现本次实现文件处于已暂存未提交状态；若工作区仍有其他改动，必须确认它们与当前任务无关且未被本次提交带入。
