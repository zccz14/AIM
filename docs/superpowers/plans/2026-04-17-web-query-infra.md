# Web Query 基础设施落地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `modules/web` 内以最小基础设施接入 `@tanstack/react-query`，并仅将 health 请求迁移为 feature-local query hook，保持页面行为与 contract 生成链路不变。

**Architecture:** 共享层只新增一个稳定的 `QueryClient` 实例和应用级 `QueryClientProvider`，不引入中央 query registry。health 查询定义、错误映射与 `useHealthQuery` 全部放在 `modules/web/src/features/health/` 附近，由 `App` 只消费 hook 返回的状态。

**Tech Stack:** React 19、TypeScript、Vite、`@tanstack/react-query`、Playwright、Biome、pnpm workspace

---

## 文件结构

**新增文件**
- `modules/web/src/lib/query-client.ts`：创建并导出 Web 端唯一的 `QueryClient` 实例与最小默认配置。
- `modules/web/src/features/health/queries.ts`：定义 health feature 的 query key、query options 构造与错误映射辅助函数。
- `modules/web/src/features/health/use-health-query.ts`：封装 `useQuery`，向页面暴露稳定的 health 查询接口。

**修改文件**
- `modules/web/package.json`：新增 `@tanstack/react-query` 依赖，保持现有测试脚本不变。
- `modules/web/src/main.tsx`：挂载 `QueryClientProvider`，继续保留 `StrictMode`。
- `modules/web/src/app.tsx`：删除手写 `useEffect + useState` 请求逻辑，改为消费 `useHealthQuery`。
- `modules/web/test/app.spec.ts`：更新源码约束与浏览器回归测试，覆盖 provider 接入与 health 成功/失败行为。

**只读参考文件**
- `modules/web/src/lib/api-client.ts`：继续复用 `createWebApiClient`，不扩展为 query registry。
- `playwright.config.ts`：继续沿用现有 Web/API 联调测试命令。
- `modules/web/tsconfig.json`：确认新增文件仍在 `src/**/*.ts(x)` 覆盖范围内，无需额外配置。

## 实施约束

- 仅实现 spec 中批准的 Web query 基础设施与 health 首次迁移，不修改 `modules/contract`。
- 不新增共享 query key 总表、endpoint registry、全局错误适配层或全局 toast。
- `createWebApiClient` 保持 typed transport 封装职责，不引入 health 业务逻辑。
- Query 默认配置保持最小，仅在必要处显式关闭/调整默认行为，避免健康检查语义被自动重试等默认值放大。

### Task 1: 接入 query runtime 依赖与入口约束

**Files:**
- Modify: `modules/web/package.json`
- Create: `modules/web/src/lib/query-client.ts`
- Modify: `modules/web/src/main.tsx`
- Test: `modules/web/test/app.spec.ts`

- [ ] **Step 1: 先写入口约束测试，让 provider 接入有失败信号**

在 `modules/web/test/app.spec.ts` 新增一个源码断言测试，先约束入口必须从新文件引入 query client，并用 `QueryClientProvider` 包裹 `App`。示例断言：

```ts
test("wraps the app with QueryClientProvider", async () => {
  const { readFile } = await import("node:fs/promises");
  const mainSource = await readFile(
    `${process.cwd()}/modules/web/src/main.tsx`,
    "utf8",
  );

  expect(mainSource).toContain("@tanstack/react-query");
  expect(mainSource).toContain("./lib/query-client.js");
  expect(mainSource).toContain("<QueryClientProvider client={webQueryClient}>");
});
```

- [ ] **Step 2: 运行单个 Playwright 文件，确认新断言先失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "wraps the app with QueryClientProvider"`

Expected: FAIL，提示 `main.tsx` 还未包含 `QueryClientProvider` 或 `query-client` 引入。

- [ ] **Step 3: 在包与入口层实现最小 query runtime**

1. 在 `modules/web/package.json` 的 `dependencies` 中新增 `@tanstack/react-query`。
2. 新建 `modules/web/src/lib/query-client.ts`，导出单例 `webQueryClient`。
3. 修改 `modules/web/src/main.tsx`，将 `App` 包裹在 `QueryClientProvider` 内。

建议代码骨架如下：

```ts
// modules/web/src/lib/query-client.ts
import { QueryClient } from "@tanstack/react-query";

export const webQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});
```

```tsx
// modules/web/src/main.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { webQueryClient } from "./lib/query-client.js";

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={webQueryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: 重新运行入口约束测试，确认 provider 已接入**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "wraps the app with QueryClientProvider"`

Expected: PASS。

- [ ] **Step 5: 提交本任务的最小基础设施改动**

```bash
git add modules/web/package.json modules/web/src/lib/query-client.ts modules/web/src/main.tsx modules/web/test/app.spec.ts
git commit -m "feat: add web query client provider"
```

### Task 2: 在 health feature 旁定义 query key、请求与错误映射

**Files:**
- Create: `modules/web/src/features/health/queries.ts`
- Create: `modules/web/src/features/health/use-health-query.ts`
- Test: `modules/web/test/app.spec.ts`

- [ ] **Step 1: 先写源码边界测试，锁定 feature-local 组织方式**

在 `modules/web/test/app.spec.ts` 新增断言，确保 health 查询定义从 feature 目录导出，而不是回流到 `src/lib` 注册表。示例：

```ts
test("keeps health query definitions feature-local", async () => {
  const { readFile } = await import("node:fs/promises");
  const appSource = await readFile(
    `${process.cwd()}/modules/web/src/app.tsx`,
    "utf8",
  );

  expect(appSource).toContain("./features/health/use-health-query.js");
  expect(appSource).not.toContain("./lib/api-client.js");
  expect(appSource).not.toContain("ContractClientError");
});
```

- [ ] **Step 2: 运行该断言，确认当前实现仍然失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "keeps health query definitions feature-local"`

Expected: FAIL，因为 `app.tsx` 仍直接依赖 `createWebApiClient` 与 `ContractClientError`。

- [ ] **Step 3: 新建 health feature-local 查询文件**

在 `modules/web/src/features/health/queries.ts` 中保留 health 自己的 key、请求与错误映射；不要回写 `modules/web/src/lib/api-client.ts`。建议结构：

```ts
import { ContractClientError, type HealthError } from "@cz-stack/contract";
import { queryOptions } from "@tanstack/react-query";

import { createWebApiClient } from "../../lib/api-client.js";

const healthQueryKey = ["health"] as const;
const fallbackError: HealthError = {
  code: "UNAVAILABLE",
  message: "unexpected error",
};

const healthApiClient = createWebApiClient();

export const getHealthErrorMessage = (error: unknown) => {
  const healthError =
    error instanceof ContractClientError ? error.error : fallbackError;

  return `API unavailable: ${healthError.message}`;
};

export const healthQueryOptions = queryOptions({
  queryKey: healthQueryKey,
  queryFn: () => healthApiClient.getHealth(),
});
```

随后在 `modules/web/src/features/health/use-health-query.ts` 中封装 hook：

```ts
import { useQuery } from "@tanstack/react-query";

import { healthQueryOptions } from "./queries.js";

export const useHealthQuery = () => useQuery(healthQueryOptions);
```

- [ ] **Step 4: 先做类型校验，确认新增 health 查询文件可被当前工程接受**

Run: `pnpm --filter @cz-stack/web run test:type`

Expected: PASS，说明 `modules/web/src/features/health/queries.ts` 与 `modules/web/src/features/health/use-health-query.ts` 的导入路径、类型与 contract client 用法已成立，即使 `App` 迁移尚未完成。

- [ ] **Step 5: 提交 feature-local 查询定义**

```bash
git add modules/web/src/features/health/queries.ts modules/web/src/features/health/use-health-query.ts modules/web/test/app.spec.ts
git commit -m "feat: add health query hook"
```

### Task 3: 将 `App` 从手写副作用迁移到 `useHealthQuery`

**Files:**
- Modify: `modules/web/src/app.tsx`
- Modify: `modules/web/test/app.spec.ts`

- [ ] **Step 1: 先收紧页面源码测试，明确组件不再手写请求状态机**

在 `modules/web/test/app.spec.ts` 增加或更新断言，要求 `app.tsx` 删除 `useEffect`、`useState` 与直接请求代码。示例：

```ts
test("renders health state from the feature query hook", async () => {
  const { readFile } = await import("node:fs/promises");
  const appSource = await readFile(
    `${process.cwd()}/modules/web/src/app.tsx`,
    "utf8",
  );

  expect(appSource).toContain("useHealthQuery");
  expect(appSource).not.toContain("useEffect(");
  expect(appSource).not.toContain("useState(");
  expect(appSource).not.toContain("createWebApiClient()");
});
```

- [ ] **Step 2: 运行该测试，确认迁移前失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "renders health state from the feature query hook"`

Expected: FAIL，因为 `App` 还在使用手写副作用。

- [ ] **Step 3: 用最小渲染逻辑迁移 `App`**

将 `modules/web/src/app.tsx` 改为只关心展示，不再自己做副作用、取消标记或错误分类。建议形态：

```tsx
import { useHealthQuery } from "./features/health/use-health-query.js";
import { getHealthErrorMessage } from "./features/health/queries.js";

export const App = () => {
  const healthQuery = useHealthQuery();

  return (
    <main>
      <h1>CZ-Stack Web</h1>
      <p>Contract-driven health check</p>
      {healthQuery.isPending ? <p>Loading health status…</p> : null}
      {healthQuery.isSuccess ? <p>API health: {healthQuery.data.status}</p> : null}
      {healthQuery.isError ? <p>{getHealthErrorMessage(healthQuery.error)}</p> : null}
    </main>
  );
};
```

这里保持错误映射留在 health feature，`App` 只消费 hook 与 helper，不把 `ContractClientError` 再拉回页面层。

- [ ] **Step 4: 让源码边界测试全部转绿**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "feature-local|query hook|QueryClientProvider"`

Expected: PASS，说明 provider 接入、feature-local 组织与页面迁移都已成立。

- [ ] **Step 5: 提交页面迁移**

```bash
git add modules/web/src/app.tsx modules/web/test/app.spec.ts
git commit -m "refactor: move web health loading to query hook"
```

### Task 4: 回归验证成功/失败路径并确认 contract 链路未扩展

**Files:**
- Modify: `modules/web/test/app.spec.ts`
- Reference: `modules/web/src/lib/api-client.ts`
- Reference: `playwright.config.ts`

- [ ] **Step 1: 更新现有源码断言，确认共享层仍然最小**

保留并扩展 `keeps the web client as a contract-client fetch pass-through` 测试，继续确保 `modules/web/src/lib/api-client.ts`：

```ts
expect(apiClientSource).toContain("return createContractClient({");
expect(apiClientSource).not.toContain("queryOptions");
expect(apiClientSource).not.toContain("useQuery");
expect(apiClientSource).not.toContain("getHealth()");
```

这一步用于防止实现者把 health query 或 react-query 逻辑回塞到共享 client 文件。

- [ ] **Step 2: 运行成功场景浏览器测试，确认页面行为保持一致**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "loads the health status"`

Expected: PASS，并继续看到 `API health: ok`，同时请求仍落到 `/api/health`。

- [ ] **Step 3: 运行失败场景浏览器测试，确认最小错误映射仍成立**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "shows the shared error state"`

Expected: PASS，并继续看到 `API unavailable: offline`。

- [ ] **Step 4: 运行 Web 模块的完整验证命令**

Run: `pnpm --filter @cz-stack/web run test:type`

Expected: PASS。

Run: `pnpm --filter @cz-stack/web run test:lint`

Expected: PASS。

Run: `pnpm --filter @cz-stack/web run test:web`

Expected: PASS，chromium/firefox 下的现有 health 成功/失败回归均通过。

- [ ] **Step 5: 检查 contract 包没有新增职责，再提交最终实现**

先做只读确认：

```bash
git diff -- modules/contract
```

Expected: 无 diff。

然后提交：

```bash
git add modules/web/package.json modules/web/src/lib/query-client.ts modules/web/src/features/health/queries.ts modules/web/src/features/health/use-health-query.ts modules/web/src/main.tsx modules/web/src/app.tsx modules/web/test/app.spec.ts
git commit -m "feat: add web query infrastructure"
```

## 自检映射

- QueryClient 初始化与 Provider 挂载：Task 1。
- 保持 `modules/contract` 生成链路不变：Task 4 Step 1 与 Step 5。
- feature-local health query 组织，无中央 registry：Task 2 与 Task 4 Step 1。
- `App` 迁移到 `useQuery`/`useHealthQuery`：Task 3。
- health 成功/失败页面回归：Task 4 Step 2-4。
- 最小错误映射而非全局错误平台：Task 2 Step 3、Task 3 Step 3。

## 注意事项

- 如果实现时发现 `queryOptions` 与 `useHealthQuery` 合并到同一文件更简单，可以把 `modules/web/src/features/health/queries.ts` 与 `modules/web/src/features/health/use-health-query.ts` 合并；但必须保持在 `modules/web/src/features/health/` 下，且同步更新本计划中的导入路径与测试断言。
- 不要为本次 health 迁移顺手引入 `QueryClient` 工厂、全局默认错误处理器或跨 feature 公共 query helpers；当前规模下会超出 spec。
- 若 `@tanstack/react-query` 的类型导入触发额外 lint/format 差异，按现有 Biome 风格最小整理，不额外重排无关代码。
