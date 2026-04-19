# Task Dashboard Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `modules/web` 内用 approved dashboard UI 替换当前 health 模板首页，基于现有 Stub OpenAPI Mock 提供 overview-first 的任务编排控制台，并覆盖约定的只读测试路径。

**Architecture:** 保留 `React 19 + Vite` 单应用边界，把任务读取收敛到 feature-local query + adapter/view-model 层，禁止组件直接消费 contract 原始字段。页面保持单 landing view，由 overview、task list、dependency graph 和共享 drawer 组成；`SERVER_BASE_URL` 通过单一本地配置模块读写 Local Storage，并在测试中显式覆盖为 `/api` 以继续复用本地 mock。

**Tech Stack:** React 19、TypeScript、Vite、`@tanstack/react-query`、Mantine、TanStack Table、React Flow、Recharts、Lucide React、Playwright、Biome、pnpm workspace

---

## 文件结构

**新增文件**
- `modules/web/src/lib/server-base-url.ts`：集中管理 `SERVER_BASE_URL` 的 Local Storage key、默认值 `https://aim.zccz14.com`、读写与空值回退逻辑。
- `modules/web/src/features/task-dashboard/api/task-dashboard-api.ts`：封装 task dashboard 专用 contract client 调用，只暴露只读 `listTasks` 请求。
- `modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts`：声明 adapter 输出的稳定展示类型，例如 `DashboardTask`, `DashboardSummaryCard`, `DashboardNode`, `DashboardEdge`。
- `modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`：把 `TaskListResponse` 转为 overview、table、drawer、graph 共用 view-model，并定义 contract status 到 UI status 的单一映射。
- `modules/web/src/features/task-dashboard/queries.ts`：定义 dashboard query key、query options、错误消息映射。
- `modules/web/src/features/task-dashboard/use-task-dashboard-query.ts`：封装 `useQuery`，供页面只消费 feature-local hook。
- `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`：页面编排壳层，组织 overview、table、graph、drawer 与配置入口。
- `modules/web/src/features/task-dashboard/components/overview-section.tsx`：渲染 summary cards、status board、Recharts 图表、recent active tasks。
- `modules/web/src/features/task-dashboard/components/task-table-section.tsx`：渲染过滤输入、TanStack Table 和点击行选中逻辑。
- `modules/web/src/features/task-dashboard/components/dependency-graph-section.tsx`：渲染 React Flow DAG、状态色节点与点击节点选中逻辑。
- `modules/web/src/features/task-dashboard/components/task-details-drawer.tsx`：唯一的只读详情 drawer。
- `modules/web/src/features/task-dashboard/components/server-base-url-form.tsx`：本地 `SERVER_BASE_URL` 配置入口与保存反馈。
- `modules/web/src/features/task-dashboard/components/task-status-badge.tsx`：统一 overview、table、graph、drawer 的状态色与文案。
- `modules/web/test/task-dashboard.spec.ts`：Playwright 源码约束 + 浏览器回归测试，覆盖 overview/table/filter/drawer/graph/error/local config。

**修改文件**
- `modules/web/package.json`：新增 Mantine、TanStack Table、React Flow、Recharts、Lucide React 依赖。
- `pnpm-lock.yaml`：记录新增前端依赖解析结果。
- `modules/web/src/main.tsx`：引入 Mantine 样式与 Provider，并保留 `QueryClientProvider`。
- `modules/web/src/app.tsx`：删除 health 模板入口，改为只渲染 dashboard feature。
- `modules/web/src/lib/api-client.ts`：继续保留 typed transport，但把默认基地址解析委托给 `server-base-url.ts`。
- `modules/web/test/app.spec.ts`：删除 health 页面专用断言与浏览器用例，避免旧模板测试继续约束新页面。

**删除文件**
- `modules/web/src/features/health/queries.ts`
- `modules/web/src/features/health/use-health-query.ts`

**只读参考文件**
- `modules/contract/src/index.ts`：确认 `Task`, `TaskListResponse`, `ContractClientError`, `tasksPath` 等公开边界。
- `modules/contract/generated/zod.ts`：确认 task contract 原始字段与状态枚举。
- `modules/api/src/routes/tasks.ts`：确认当前 stub task 返回字段、默认时间戳和本地 mock 行为。
- `playwright.config.ts`：继续沿用现有 API + Vite 联调方式，浏览器测试通过 Local Storage 覆盖基地址到 `/api`。

## 实施约束

- 严格只做 approved frontend scope：overview、task list、status board、dependency graph、共享 drawer、错误态、空态和本地 `SERVER_BASE_URL`。
- 不修改 `modules/api` 与 `modules/contract` 的契约、数据结构或 mock 路由。
- 不增加路由、鉴权、写操作、DAG 编辑、批量操作、PR 按钮或额外运行时配置中心。
- UI status 必须通过 adapter 单点派生，避免组件自行解释 contract status。建议固定映射：`created -> ready`、`waiting_assumptions -> blocked`、`running | outbound | pr_following | closing -> running`、`succeeded -> done`、`failed -> failed`。
- `SERVER_BASE_URL` 默认值必须只定义在 `modules/web/src/lib/server-base-url.ts`，请求层与测试都从该模块读取，不能散落常量。
- 继续使用现有 Playwright 测试通道，不新增 Vitest/Jest/Cypress。

### Task 1: 接入 dashboard UI runtime 并替换模板入口

**Files:**
- Modify: `modules/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `modules/web/src/main.tsx`
- Modify: `modules/web/src/app.tsx`
- Modify: `modules/web/test/app.spec.ts`

- [ ] **Step 1: 先写入口源码约束，锁定模板首页必须被 dashboard 入口替换**

把 `modules/web/test/app.spec.ts` 改成只保留 dashboard 入口约束，先让当前 health 模板失败。示例断言：

```ts
import { expect, test } from "@playwright/test";

test("boots the dashboard app with Mantine and query providers", async () => {
  const { readFile } = await import("node:fs/promises");
  const mainSource = await readFile(
    `${process.cwd()}/modules/web/src/main.tsx`,
    "utf8",
  );
  const appSource = await readFile(
    `${process.cwd()}/modules/web/src/app.tsx`,
    "utf8",
  );

  expect(mainSource).toContain("@mantine/core/styles.css");
  expect(mainSource).toContain("<MantineProvider>");
  expect(mainSource).toContain("<QueryClientProvider client={webQueryClient}>");
  expect(appSource).toContain("./features/task-dashboard/components/dashboard-page.js");
  expect(appSource).not.toContain("useHealthQuery");
  expect(appSource).not.toContain("CZ-Stack Web");
});
```

- [ ] **Step 2: 运行入口约束测试，确认当前模板实现先失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "boots the dashboard app with Mantine and query providers"`

Expected: FAIL，提示 `main.tsx` 还没有 Mantine Provider，`app.tsx` 仍引用 health 模板。

- [ ] **Step 3: 安装 approved UI 依赖并替换应用入口**

1. 在 `modules/web/package.json` 的 `dependencies` 中新增：
   - `@mantine/core`
   - `@mantine/hooks`
   - `@tabler/icons-react` 不在 approved 清单中，不要添加
   - `@tanstack/react-table`
   - `lucide-react`
   - `reactflow`
   - `recharts`
2. 运行 `pnpm install --filter @aim-ai/web...` 更新 `pnpm-lock.yaml`。
3. 修改 `modules/web/src/main.tsx`，引入 Mantine 样式与 `MantineProvider`，保留现有 `QueryClientProvider`。
4. 修改 `modules/web/src/app.tsx`，只渲染新的 `DashboardPage`。

建议入口代码骨架如下：

```tsx
// modules/web/src/main.tsx
import "@mantine/core/styles.css";
import "reactflow/dist/style.css";

import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { webQueryClient } from "./lib/query-client.js";

createRoot(container).render(
  <StrictMode>
    <MantineProvider>
      <QueryClientProvider client={webQueryClient}>
        <App />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
```

```tsx
// modules/web/src/app.tsx
import { DashboardPage } from "./features/task-dashboard/components/dashboard-page.js";

export const App = () => <DashboardPage />;
```

- [ ] **Step 4: 重新运行入口约束测试，确认 runtime 与入口替换成立**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "boots the dashboard app with Mantine and query providers"`

Expected: PASS。

- [ ] **Step 5: 提交 runtime 与入口替换**

```bash
git add modules/web/package.json pnpm-lock.yaml modules/web/src/main.tsx modules/web/src/app.tsx modules/web/test/app.spec.ts
git commit -m "feat: replace web template shell"
```

### Task 2: 建立本地配置、task query 与 adapter/view-model 边界

**Files:**
- Create: `modules/web/src/lib/server-base-url.ts`
- Modify: `modules/web/src/lib/api-client.ts`
- Create: `modules/web/src/features/task-dashboard/api/task-dashboard-api.ts`
- Create: `modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts`
- Create: `modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`
- Create: `modules/web/src/features/task-dashboard/queries.ts`
- Create: `modules/web/src/features/task-dashboard/use-task-dashboard-query.ts`
- Modify: `modules/web/test/app.spec.ts`

- [ ] **Step 1: 先写源码边界测试，禁止组件直接读 contract shape 或散落默认 base URL**

在 `modules/web/test/app.spec.ts` 中新增 source assertions，要求 dashboard feature 通过 adapter 输出 view-model，并且默认基地址只存在于 `server-base-url.ts`。示例：

```ts
test("keeps task dashboard data behind adapter and local config boundaries", async () => {
  const { readFile } = await import("node:fs/promises");
  const appSource = await readFile(
    `${process.cwd()}/modules/web/src/app.tsx`,
    "utf8",
  );
  const apiClientSource = await readFile(
    `${process.cwd()}/modules/web/src/lib/api-client.ts`,
    "utf8",
  );
  const configSource = await readFile(
    `${process.cwd()}/modules/web/src/lib/server-base-url.ts`,
    "utf8",
  );
  const adapterSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`,
    "utf8",
  );

  expect(appSource).not.toContain("task_spec");
  expect(appSource).not.toContain("waiting_assumptions");
  expect(apiClientSource).toContain("readServerBaseUrl");
  expect(apiClientSource).not.toContain("https://aim.zccz14.com");
  expect(configSource).toContain("https://aim.zccz14.com");
  expect(adapterSource).toContain("toDashboardStatus");
  expect(adapterSource).toContain("created");
  expect(adapterSource).toContain("waiting_assumptions");
});
```

- [ ] **Step 2: 运行边界测试，确认新增约束先失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "keeps task dashboard data behind adapter and local config boundaries"`

Expected: FAIL，因为相关文件还不存在，`api-client.ts` 也尚未委托 `readServerBaseUrl`。

- [ ] **Step 3: 实现本地 base URL 事实源并把 transport 默认值迁移过去**

在 `modules/web/src/lib/server-base-url.ts` 中集中定义常量和读写函数：

```ts
const SERVER_BASE_URL_STORAGE_KEY = "aim.serverBaseUrl";
export const DEFAULT_SERVER_BASE_URL = "https://aim.zccz14.com";

const normalizeServerBaseUrl = (value: string | null | undefined) => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : DEFAULT_SERVER_BASE_URL;
};

export const readServerBaseUrl = () => {
  if (typeof window === "undefined") {
    return DEFAULT_SERVER_BASE_URL;
  }

  return normalizeServerBaseUrl(
    window.localStorage.getItem(SERVER_BASE_URL_STORAGE_KEY),
  );
};

export const saveServerBaseUrl = (value: string) => {
  const normalizedValue = normalizeServerBaseUrl(value);
  window.localStorage.setItem(SERVER_BASE_URL_STORAGE_KEY, normalizedValue);
  return normalizedValue;
};
```

然后把 `modules/web/src/lib/api-client.ts` 的默认参数改成读取该模块：

```ts
import { readServerBaseUrl } from "./server-base-url.js";

export const createWebApiClient = (baseUrl = readServerBaseUrl()) => {
  const resolvedBaseUrl = new URL(baseUrl, window.location.origin);
  return createContractClient({
    fetch: (input, init) => fetch(toAbsoluteRequest(resolvedBaseUrl, input, init)),
  });
};
```

- [ ] **Step 4: 实现 task dashboard API、query 和 adapter/view-model**

按下面的最小分层落地，避免在组件里解释 contract 字段：

```ts
// modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts
export type DashboardStatus = "ready" | "running" | "blocked" | "done" | "failed";

export type DashboardTask = {
  id: string;
  title: string;
  contractStatus: string;
  dashboardStatus: DashboardStatus;
  sessionId: string | null;
  worktreePath: string | null;
  pullRequestUrl: string | null;
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
  isDone: boolean;
};

export type DashboardSummaryCard = {
  key: "total" | "running" | "blocked" | "done";
  label: string;
  value: number;
};

export type DashboardMetricItem = {
  key: DashboardStatus;
  label: string;
  value: number;
};

export type DashboardActivityPoint = {
  label: string;
  value: number;
};
```

```ts
// modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts
import type { TaskListResponse, TaskStatus } from "@aim-ai/contract";

const toDashboardStatus = (status: TaskStatus) => {
  switch (status) {
    case "created":
      return "ready" as const;
    case "waiting_assumptions":
      return "blocked" as const;
    case "running":
    case "outbound":
    case "pr_following":
    case "closing":
      return "running" as const;
    case "succeeded":
      return "done" as const;
    case "failed":
      return "failed" as const;
  }
};

export const adaptTaskDashboard = (response: TaskListResponse) => {
  const tasks = response.items.map((task) => ({
    id: task.task_id,
    title: task.task_spec,
    contractStatus: task.status,
    dashboardStatus: toDashboardStatus(task.status),
    sessionId: task.session_id,
    worktreePath: task.worktree_path,
    pullRequestUrl: task.pull_request_url,
    dependencies: task.dependencies,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    isDone: task.done,
  }));
  const statusBoardItems = [
    { key: "ready", label: "Ready", value: tasks.filter((task) => task.dashboardStatus === "ready").length },
    { key: "running", label: "Running", value: tasks.filter((task) => task.dashboardStatus === "running").length },
    { key: "blocked", label: "Blocked", value: tasks.filter((task) => task.dashboardStatus === "blocked").length },
    { key: "done", label: "Done", value: tasks.filter((task) => task.dashboardStatus === "done").length },
    { key: "failed", label: "Failed", value: tasks.filter((task) => task.dashboardStatus === "failed").length },
  ];
  const activitySeries = [...tasks]
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .map((task, index) => ({
      label: task.updatedAt.slice(0, 10),
      value: index + 1,
    }));

  return {
    tasks,
    summaryCards: [
      { key: "total", label: "Total Tasks", value: tasks.length },
      { key: "running", label: "Running", value: tasks.filter((task) => task.dashboardStatus === "running").length },
      { key: "blocked", label: "Blocked", value: tasks.filter((task) => task.dashboardStatus === "blocked").length },
      { key: "done", label: "Done", value: tasks.filter((task) => task.dashboardStatus === "done").length },
    ],
    statusBoardItems,
    activitySeries,
    recentTasks: [...tasks].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 5),
  };
};
```

再在 API / query 层把 contract client 和 adapter 接起来：

```ts
// modules/web/src/features/task-dashboard/api/task-dashboard-api.ts
import { createWebApiClient } from "../../../lib/api-client.js";

export const getTaskDashboard = async () => {
  const client = createWebApiClient();
  return client.listTasks();
};
```

```ts
// modules/web/src/features/task-dashboard/queries.ts
import { ContractClientError } from "@aim-ai/contract";
import { queryOptions } from "@tanstack/react-query";

import { getTaskDashboard } from "./api/task-dashboard-api.js";
import { adaptTaskDashboard } from "./model/task-dashboard-adapter.js";

export const getTaskDashboardErrorMessage = (error: unknown) =>
  error instanceof ContractClientError
    ? `Task dashboard unavailable: ${error.error.message}`
    : "Task dashboard unavailable: unexpected error";

export const taskDashboardQueryOptions = queryOptions({
  queryKey: ["task-dashboard"],
  queryFn: async () => adaptTaskDashboard(await getTaskDashboard()),
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
```

- [ ] **Step 5: 运行类型校验，确认新边界先可编译**

Run: `pnpm --filter @aim-ai/web run test:type`

Expected: PASS，说明 Local Storage 配置模块、adapter、query hook 和 transport 改动都被当前工程接受。

- [ ] **Step 6: 提交数据边界与本地配置层**

```bash
git add modules/web/src/lib/server-base-url.ts modules/web/src/lib/api-client.ts modules/web/src/features/task-dashboard/api/task-dashboard-api.ts modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts modules/web/src/features/task-dashboard/queries.ts modules/web/src/features/task-dashboard/use-task-dashboard-query.ts modules/web/test/app.spec.ts
git commit -m "feat: add task dashboard data model"
```

### Task 3: 落地 overview-first dashboard、错误态与本地配置入口

**Files:**
- Create: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`
- Create: `modules/web/src/features/task-dashboard/components/overview-section.tsx`
- Create: `modules/web/src/features/task-dashboard/components/server-base-url-form.tsx`
- Create: `modules/web/src/features/task-dashboard/components/task-status-badge.tsx`
- Modify: `modules/web/test/task-dashboard.spec.ts`

- [ ] **Step 1: 先写 overview/error/local config 浏览器测试，让页面目标可观察**

新建 `modules/web/test/task-dashboard.spec.ts`，先覆盖默认 landing view、错误态和 Local Storage 配置。示例：

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("aim.serverBaseUrl", "/api");
  });
});

test("renders the overview landing view", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Task Dashboard" })).toBeVisible();
  await expect(page.getByText("Total Tasks")).toBeVisible();
  await expect(page.getByText("Status Board")).toBeVisible();
  await expect(page.getByText("Recent Activity")).toBeVisible();
  await expect(page.getByText("Recent Active Tasks")).toBeVisible();
});

test("shows a clear error state when the task request fails", async ({ page }) => {
  await page.route("**/tasks", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "TASK_VALIDATION_ERROR", message: "offline" }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("Task dashboard unavailable: offline")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("falls back to the default remote SERVER_BASE_URL when local storage is empty", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("aim.serverBaseUrl");
  });
  await page.goto("/");
  await expect(page.getByDisplayValue("https://aim.zccz14.com")).toBeVisible();
});
```

- [ ] **Step 2: 运行 overview/error/local config 测试，确认页面尚未实现时先失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "renders the overview landing view|shows a clear error state when the task request fails|falls back to the default remote SERVER_BASE_URL when local storage is empty"`

Expected: FAIL，因为 `DashboardPage`、错误态和配置入口尚未落地。

- [ ] **Step 3: 实现 query hook、overview 页面壳层和共享状态 badge**

先补上 hook，再做 overview 页面。建议最小结构：

```ts
// modules/web/src/features/task-dashboard/use-task-dashboard-query.ts
import { useQuery } from "@tanstack/react-query";

import { taskDashboardQueryOptions } from "./queries.js";

export const useTaskDashboardQuery = () => useQuery(taskDashboardQueryOptions);
```

```tsx
// modules/web/src/features/task-dashboard/components/task-status-badge.tsx
import { Badge } from "@mantine/core";

const statusColorMap = {
  ready: "blue",
  running: "yellow",
  blocked: "orange",
  done: "green",
  failed: "red",
} as const;

export const TaskStatusBadge = ({ status }: { status: keyof typeof statusColorMap }) => (
  <Badge color={statusColorMap[status]} variant="light">{status}</Badge>
);
```

```tsx
// modules/web/src/features/task-dashboard/components/overview-section.tsx
import { Card, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const OverviewSection = ({ dashboard, onSelectTask }) => (
  <Stack gap="lg">
    <SimpleGrid cols={{ base: 1, md: 4 }}>
      {dashboard.summaryCards.map((card) => (
        <Card key={card.key} withBorder>
          <Text size="sm" c="dimmed">{card.label}</Text>
          <Title order={2}>{card.value}</Title>
        </Card>
      ))}
    </SimpleGrid>
    <Card withBorder>
      <Title order={3}>Status Board</Title>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={dashboard.statusBoardItems}>
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="value" fill="#228be6" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
    <Card withBorder>
      <Title order={3}>Recent Activity</Title>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={dashboard.activitySeries}>
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Area dataKey="value" stroke="#5c7cfa" fill="#dbe4ff" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
    <Card withBorder>
      <Title order={3}>Recent Active Tasks</Title>
      <Stack gap="xs">
        {dashboard.recentTasks.map((task) => (
          <Group key={task.id} justify="space-between">
            <button type="button" onClick={() => onSelectTask(task.id)}>{task.title}</button>
          </Group>
        ))}
      </Stack>
    </Card>
  </Stack>
);
```

```tsx
// modules/web/src/features/task-dashboard/components/dashboard-page.tsx
import { Alert, AppShell, Button, Loader, Stack, Text, Title } from "@mantine/core";
import { AlertCircle } from "lucide-react";
import { useState } from "react";

import { getTaskDashboardErrorMessage } from "../queries.js";
import { useTaskDashboardQuery } from "../use-task-dashboard-query.js";
import { OverviewSection } from "./overview-section.js";
import { ServerBaseUrlForm } from "./server-base-url-form.js";

export const DashboardPage = () => {
  const dashboardQuery = useTaskDashboardQuery();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (dashboardQuery.isPending) {
    return <Loader aria-label="Loading task dashboard" />;
  }

  if (dashboardQuery.isError) {
    return (
      <Alert color="red" icon={<AlertCircle size={16} />}>
        <Stack>
          <Text>{getTaskDashboardErrorMessage(dashboardQuery.error)}</Text>
          <Button onClick={() => dashboardQuery.refetch()}>Retry</Button>
        </Stack>
      </Alert>
    );
  }

  return (
    <AppShell padding="lg">
      <Stack gap="lg">
        <Title order={1}>Task Dashboard</Title>
        <ServerBaseUrlForm />
        <OverviewSection
          dashboard={dashboardQuery.data}
          onSelectTask={setSelectedTaskId}
        />
      </Stack>
    </AppShell>
  );
};
```

- [ ] **Step 4: 实现 `SERVER_BASE_URL` 表单与空态处理**

在 `modules/web/src/features/task-dashboard/components/server-base-url-form.tsx` 中读取默认值、允许保存并显示轻量反馈；同时在 `dashboard-page.tsx` 对空列表给出明确空态，而不是空白区域。建议代码：

```tsx
import { Button, Group, TextInput } from "@mantine/core";
import { useState } from "react";

import { readServerBaseUrl, saveServerBaseUrl } from "../../../lib/server-base-url.js";

export const ServerBaseUrlForm = () => {
  const [value, setValue] = useState(() => readServerBaseUrl());
  const [savedValue, setSavedValue] = useState<string | null>(null);

  return (
    <Group align="end">
      <TextInput
        label="SERVER_BASE_URL"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <Button onClick={() => setSavedValue(saveServerBaseUrl(value))}>Save</Button>
      {savedValue ? <span>Saved: {savedValue}</span> : null}
    </Group>
  );
};
```

空态建议使用：

```tsx
if (dashboardQuery.data.tasks.length === 0) {
  return (
    <Stack>
      <Title order={1}>Task Dashboard</Title>
      <Text>No tasks available from the configured server.</Text>
      <ServerBaseUrlForm />
    </Stack>
  );
}
```

- [ ] **Step 5: 运行 overview/error/local config 测试，确认页面基础行为成立**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "renders the overview landing view|shows a clear error state when the task request fails|falls back to the default remote SERVER_BASE_URL when local storage is empty"`

Expected: PASS。

- [ ] **Step 6: 提交 overview 页面基础闭环**

```bash
git add modules/web/src/features/task-dashboard/components/dashboard-page.tsx modules/web/src/features/task-dashboard/components/overview-section.tsx modules/web/src/features/task-dashboard/components/server-base-url-form.tsx modules/web/src/features/task-dashboard/components/task-status-badge.tsx modules/web/src/features/task-dashboard/use-task-dashboard-query.ts modules/web/test/task-dashboard.spec.ts
git commit -m "feat: add task dashboard overview"
```

### Task 4: 落地任务列表、过滤与共享详情 drawer

**Files:**
- Create: `modules/web/src/features/task-dashboard/components/task-table-section.tsx`
- Create: `modules/web/src/features/task-dashboard/components/task-details-drawer.tsx`
- Modify: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`
- Modify: `modules/web/src/features/task-dashboard/components/overview-section.tsx`
- Modify: `modules/web/test/task-dashboard.spec.ts`

- [ ] **Step 1: 先写 table/filter/drawer 浏览器测试，约束共享详情入口**

在 `modules/web/test/task-dashboard.spec.ts` 中新增三个用例，覆盖列表渲染、过滤和从多个入口打开同一个 drawer。示例：

```ts
test("renders the task table with core columns", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("columnheader", { name: "Task" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Dependencies" })).toBeVisible();
});

test("filters tasks by free-text input", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Filter Tasks").fill("stub task spec");

  await expect(page.getByRole("row", { name: /stub task spec/i })).toBeVisible();
  await expect(page.getByText("No matching tasks.")).toHaveCount(0);
});

test("opens the shared task drawer from overview and table", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /stub task spec/i }).first().click();
  await expect(page.getByRole("dialog", { name: "Task Details" })).toBeVisible();
  await expect(page.getByText("Contract Status")).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("row", { name: /stub task spec/i }).click();
  await expect(page.getByRole("dialog", { name: "Task Details" })).toBeVisible();
});
```

- [ ] **Step 2: 运行列表与 drawer 测试，确认实现前失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "renders the task table with core columns|filters tasks by free-text input|opens the shared task drawer from overview and table"`

Expected: FAIL，因为 table、过滤器和 drawer 还未接入页面。

- [ ] **Step 3: 用 TanStack Table 实现列表与过滤器**

在 `modules/web/src/features/task-dashboard/components/task-table-section.tsx` 中保持最小功能：一组文本过滤器、客户端排序和点击行选中。建议骨架：

```tsx
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ScrollArea, Table, Text, TextInput } from "@mantine/core";
import { useState } from "react";

export const TaskTableSection = ({ tasks, onSelectTask }) => {
  const [filterValue, setFilterValue] = useState("");
  const columns = [
    { header: "Task", accessorKey: "title", cell: ({ row }) => row.original.title },
    { header: "Status", accessorKey: "dashboardStatus", cell: ({ row }) => row.original.dashboardStatus },
    { header: "Dependencies", cell: ({ row }) => row.original.dependencies.length },
    { header: "Updated", accessorKey: "updatedAt", cell: ({ row }) => row.original.updatedAt },
  ];

  const table = useReactTable({
    data: tasks,
    columns,
    state: { globalFilter: filterValue },
    onGlobalFilterChange: setFilterValue,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <TextInput label="Filter Tasks" value={filterValue} onChange={(event) => setFilterValue(event.currentTarget.value)} />
      <ScrollArea>
        <Table highlightOnHover>
          <Table.Thead>
            {table.getHeaderGroups().map((group) => (
              <Table.Tr key={group.id}>
                {group.headers.map((header) => (
                  <Table.Th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</Table.Th>
                ))}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.map((row) => (
              <Table.Tr key={row.id} onClick={() => onSelectTask(row.original.id)}>
                {row.getVisibleCells().map((cell) => (
                  <Table.Td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {table.getRowModel().rows.length === 0 ? <Text>No matching tasks.</Text> : null}
    </>
  );
};
```

如果过滤后无结果，直接渲染 `<Text>No matching tasks.</Text>`，避免空表格无反馈。

- [ ] **Step 4: 实现唯一详情 drawer，并把 overview / table 统一接入同一选中状态**

在 `modules/web/src/features/task-dashboard/components/task-details-drawer.tsx` 中只做只读展示；`dashboard-page.tsx` 维护单一 `selectedTaskId`。建议代码：

```tsx
import { Anchor, Drawer, Group, Stack, Text, Title } from "@mantine/core";

export const TaskDetailsDrawer = ({ opened, task, onClose }) => (
  <Drawer opened={opened} onClose={onClose} title="Task Details" position="right" size="md">
    {task ? (
      <Stack gap="sm">
        <Title order={3}>{task.title}</Title>
        <Text>Task ID: {task.id}</Text>
        <Text>Contract Status: {task.contractStatus}</Text>
        <Text>Dashboard Status: {task.dashboardStatus}</Text>
        <Text>Session ID: {task.sessionId ?? "None"}</Text>
        <Text>Worktree: {task.worktreePath ?? "None"}</Text>
        <Text>Dependencies: {task.dependencies.join(", ") || "None"}</Text>
        {task.pullRequestUrl ? (
          <Group>
            <Anchor href={task.pullRequestUrl} target="_blank" rel="noreferrer">Open PR</Anchor>
          </Group>
        ) : null}
      </Stack>
    ) : null}
  </Drawer>
);
```

在 `dashboard-page.tsx` 中增加：

```tsx
const selectedTask = dashboardQuery.data.tasks.find((task) => task.id === selectedTaskId) ?? null;

<OverviewSection dashboard={dashboardQuery.data} onSelectTask={setSelectedTaskId} />
<TaskTableSection tasks={dashboardQuery.data.tasks} onSelectTask={setSelectedTaskId} />
<TaskDetailsDrawer
  opened={selectedTask !== null}
  task={selectedTask}
  onClose={() => setSelectedTaskId(null)}
/>
```

- [ ] **Step 5: 重新运行列表与 drawer 测试，确认共享详情行为成立**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "renders the task table with core columns|filters tasks by free-text input|opens the shared task drawer from overview and table"`

Expected: PASS。

- [ ] **Step 6: 提交任务列表与共享 drawer**

```bash
git add modules/web/src/features/task-dashboard/components/task-table-section.tsx modules/web/src/features/task-dashboard/components/task-details-drawer.tsx modules/web/src/features/task-dashboard/components/dashboard-page.tsx modules/web/src/features/task-dashboard/components/overview-section.tsx modules/web/test/task-dashboard.spec.ts
git commit -m "feat: add dashboard task explorer"
```

### Task 5: 落地依赖图、删除旧 health 代码并完成整体验证

**Files:**
- Create: `modules/web/src/features/task-dashboard/components/dependency-graph-section.tsx`
- Modify: `modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`
- Modify: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`
- Modify: `modules/web/test/task-dashboard.spec.ts`
- Delete: `modules/web/src/features/health/queries.ts`
- Delete: `modules/web/src/features/health/use-health-query.ts`

- [ ] **Step 1: 先写 graph 浏览器测试，锁定状态色与节点点击也复用共享 drawer**

在 `modules/web/test/task-dashboard.spec.ts` 中新增 graph 用例。示例：

```ts
test("renders the dependency graph with status-colored nodes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Dependency Graph")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(page.getByTestId("graph-node-task-123")).toContainText("ready");
});

test("opens the shared task drawer from a graph node", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("graph-node-task-123").click();

  await expect(page.getByRole("dialog", { name: "Task Details" })).toBeVisible();
  await expect(page.getByText("Task ID: task-123")).toBeVisible();
});
```

- [ ] **Step 2: 运行 graph 测试，确认当前页面先失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "renders the dependency graph with status-colored nodes|opens the shared task drawer from a graph node"`

Expected: FAIL，因为 graph 组件和测试标识还不存在。

- [ ] **Step 3: 在 adapter 中补齐 graph nodes/edges，并用 React Flow 实现依赖图**

先扩展 adapter 输出：

```ts
const statusColorMap = {
  ready: "#228be6",
  running: "#fab005",
  blocked: "#f08c00",
  done: "#2f9e44",
  failed: "#e03131",
} as const;

const graphNodes = tasks.map((task, index) => ({
  id: task.id,
  position: { x: (index % 3) * 240, y: Math.floor(index / 3) * 140 },
  data: {
    label: task.title,
    status: task.dashboardStatus,
    color: statusColorMap[task.dashboardStatus],
    testId: `graph-node-${task.id}`,
  },
}));

const graphEdges = tasks.flatMap((task) =>
  task.dependencies.map((dependencyId) => ({
    id: `${dependencyId}-${task.id}`,
    source: dependencyId,
    target: task.id,
  })),
);
```

再在 `modules/web/src/features/task-dashboard/components/dependency-graph-section.tsx` 中使用 `ReactFlow`：

```tsx
import { Card, Title } from "@mantine/core";
import ReactFlow, { Background, Controls, type NodeProps } from "reactflow";

const TaskGraphNode = ({ data }: NodeProps) => (
  <button
    data-testid={data.testId}
    onClick={data.onSelect}
    style={{ border: `2px solid ${data.color}`, borderRadius: 12, padding: 12, background: "white" }}
    type="button"
  >
    <strong>{data.label}</strong>
    <div>{data.status}</div>
  </button>
);

export const DependencyGraphSection = ({ graphNodes, graphEdges, onSelectTask }) => {
  const nodes = graphNodes.map((node) => ({
    ...node,
    type: "taskNode",
    data: {
      ...node.data,
      onSelect: () => onSelectTask(node.id),
    },
  }));

  return (
    <Card withBorder>
      <Title order={3}>Dependency Graph</Title>
      <div style={{ height: 420 }}>
        <ReactFlow
          fitView
          nodes={nodes}
          edges={graphEdges}
          nodeTypes={{ taskNode: TaskGraphNode }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </Card>
  );
};
```

- [ ] **Step 4: 删除旧 health feature 并跑完整验证**

1. 删除 `modules/web/src/features/health/queries.ts` 和 `modules/web/src/features/health/use-health-query.ts`。
2. 确认 `app.tsx`、`dashboard-page.tsx`、测试文件都不再引用 health 逻辑。
3. 依次运行完整验证：

Run: `pnpm --filter @aim-ai/web run test:type`
Expected: PASS。

Run: `pnpm --filter @aim-ai/web run test:lint`
Expected: PASS。

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium`
Expected: PASS，覆盖源码边界、overview、table、filter、drawer、graph、error、local config。

- [ ] **Step 5: 提交 graph、清理与最终验证结果**

```bash
git add modules/web/src/features/task-dashboard/components/dependency-graph-section.tsx modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts modules/web/src/features/task-dashboard/components/dashboard-page.tsx modules/web/test/task-dashboard.spec.ts modules/web/src/features/health/queries.ts modules/web/src/features/health/use-health-query.ts
git commit -m "feat: finish task dashboard frontend"
```
