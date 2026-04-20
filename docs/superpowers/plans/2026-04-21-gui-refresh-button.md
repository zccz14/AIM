# Dashboard Refresh Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 dashboard 页头新增一个显式 `Refresh` 按钮，并让它与错误态 `Retry` 共用同一个数据级刷新动作，在重新请求 dashboard 数据时保留当前筛选输入等本地 UI 状态。

**Architecture:** 保持现有 `React Query + feature-local page orchestration` 结构，不改 query key、不引入新的全局状态，也不做浏览器级 reload。刷新语义只收敛在 `dashboard-page.tsx` 的单一 `handleRefresh` 中，页头按钮、错误态 `Retry` 和 `SERVER_BASE_URL` 保存后的刷新都复用这一入口；浏览器回归测试只补充一次手动刷新路径，证明会重新发起请求且不会清空过滤条件。

**Tech Stack:** React 19、TypeScript、Mantine、`@tanstack/react-query`、Playwright、pnpm workspace

---

## 文件结构

**修改文件**
- `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`：收敛统一 `handleRefresh`，在页头 `Create Task` 旁增加 `Refresh` 按钮，并把错误态 `Retry` 与 `SERVER_BASE_URL` 保存后的刷新统一指向该 handler。
- `modules/web/test/app.spec.ts`：新增源码约束，锁定 `dashboard-page.tsx` 必须存在单一 `handleRefresh`，并且 `Refresh` / `Retry` 共用该入口而不是直接散落 `dashboardQuery.refetch()`。
- `modules/web/test/task-dashboard.spec.ts`：新增 Playwright 回归，验证点击页头 `Refresh` 会触发新的 dashboard GET 请求，同时保留 `Filter Tasks` 输入内容。

**只读参考文件**
- `modules/web/src/features/task-dashboard/components/task-table-section.tsx`：确认筛选状态当前由本地 `useState` 驱动，计划中的刷新实现必须避免整页重建，才能自然保留该输入值。
- `modules/web/src/features/task-dashboard/queries.ts`：确认现有 dashboard 查询仍通过同一 `taskDashboardQueryOptions` 读取，不在本次改造 query 层。
- `modules/web/src/features/task-dashboard/use-task-dashboard-query.ts`：确认页面继续消费同一个 `useQuery` 返回值，并直接复用现有 `isFetching` / `refetch` 能力。

## 实施约束

- 严格只做 spec 中的最小 scope：页头 `Refresh`、统一 `handleRefresh`、错误态 `Retry` 复用、Playwright 刷新回归。
- 禁止引入 `window.location.reload()`、路由跳转、query key 重构、toast、轮询或其他额外刷新入口。
- `Refresh` 的 loading / disabled 必须直接复用现有 `dashboardQuery` 刷新状态，不新增独立布尔状态。
- 若刷新成功，必须保持当前 `TaskTableSection` 的筛选输入内容；计划默认依赖组件不被整页卸载的现有结构，不预设额外状态上提。
- 若实现过程中发现 `TaskTableSection` 在 refetch 成功路径被意外卸载，再以最小方式把筛选状态上提到 `dashboard-page.tsx`；未出现该失败前，不扩展 scope。

### Task 1: 收敛统一刷新入口并在页头暴露 Refresh 按钮

**Files:**
- Modify: `modules/web/test/app.spec.ts`
- Modify: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`

- [ ] **Step 1: 先写源码约束测试，锁定单一 `handleRefresh` 与共享刷新入口**

在 `modules/web/test/app.spec.ts` 新增一个 source assertion，用字符串断言约束 `dashboard-page.tsx`：

```ts
test("keeps dashboard refresh actions behind a shared handler", async () => {
  const { readFile } = await import("node:fs/promises");
  const dashboardPageSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );

  expect(dashboardPageSource).toContain("const handleRefresh = async () =>");
  expect(dashboardPageSource).toContain("loading={dashboardQuery.isFetching}");
  expect(dashboardPageSource).toContain("disabled={dashboardQuery.isFetching}");
  expect(dashboardPageSource).toContain("Refresh");
  expect(dashboardPageSource).toContain("onClick={() => void handleRefresh()}");
  expect(dashboardPageSource).toContain("<ServerBaseUrlForm onSave={handleRefresh} />");
  expect(dashboardPageSource).toContain("Retry");
  expect(dashboardPageSource).not.toContain(
    'onClick={() => void dashboardQuery.refetch()}',
  );
});
```

- [ ] **Step 2: 运行源码约束测试，确认当前实现先失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "keeps dashboard refresh actions behind a shared handler"`

Expected: FAIL，因为当前 `dashboard-page.tsx` 还没有 `Refresh` 按钮，也还在错误态里直接调用 `dashboardQuery.refetch()`。

- [ ] **Step 3: 在页面壳层写最小实现，复用现有 query 刷新状态**

只改 `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`，不要触碰 query 层文件。实现骨架如下：

```tsx
export const DashboardPage = () => {
  const queryClient = useQueryClient();
  const dashboardQuery = useTaskDashboardQuery();
  const createTaskMutation = useTaskCreateMutation();
  const [createDrawerOpened, setCreateDrawerOpened] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskFallback, setSelectedTaskFallback] =
    useState<DashboardTask | null>(null);

  const handleRefresh = async () => {
    await dashboardQuery.refetch();
  };

  return (
    <AppShell padding="lg">
      <AppShell.Main>
        <Stack gap="lg">
          <Group justify="space-between">
            <Group align="center" gap="sm">
              <img alt="AIM icon" height={28} src="/aim-icon.svg" width={28} />
              <div>
                <Text fw={700} size="sm">
                  AIM
                </Text>
                <Title order={1}>Task Dashboard</Title>
              </div>
            </Group>
            <Group gap="sm">
              <Button
                disabled={dashboardQuery.isFetching}
                loading={dashboardQuery.isFetching}
                onClick={() => void handleRefresh()}
                variant="default"
              >
                Refresh
              </Button>
              <Button
                disabled={createDrawerOpened}
                onClick={() => setCreateDrawerOpened(true)}
              >
                Create Task
              </Button>
            </Group>
          </Group>

          <ServerBaseUrlForm onSave={handleRefresh} />

          {dashboardQuery.isError ? (
            <Alert
              color="red"
              icon={<AlertCircle size={16} />}
              title="Dashboard Error"
            >
              <Stack gap="sm">
                <Text>{getTaskDashboardErrorMessage(dashboardQuery.error)}</Text>
                <Button
                  disabled={dashboardQuery.isFetching}
                  loading={dashboardQuery.isFetching}
                  onClick={() => void handleRefresh()}
                  variant="light"
                >
                  Retry
                </Button>
              </Stack>
            </Alert>
          ) : null}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
};
```

实现要求：
- `handleRefresh` 只负责重新请求 dashboard 数据，不关闭 drawer、不清空选中项、不重置筛选。
- `Refresh` 放在页头 `Create Task` 左侧，保持按钮组紧邻现有主操作。
- `loading` 与 `disabled` 直接读 `dashboardQuery.isFetching`，不要新增 `isRefreshing`。
- 错误态 `Retry` 与 `ServerBaseUrlForm onSave` 都改为复用同一个 `handleRefresh`。

- [ ] **Step 4: 重新运行源码约束测试，确认页面刷新入口已经收敛**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "keeps dashboard refresh actions behind a shared handler"`

Expected: PASS。

- [ ] **Step 5: 提交统一刷新入口改动**

```bash
git add modules/web/test/app.spec.ts modules/web/src/features/task-dashboard/components/dashboard-page.tsx
git commit -m "feat: add dashboard refresh action"
```

### Task 2: 用 Playwright 验证刷新会重新请求数据且保留筛选输入

**Files:**
- Modify: `modules/web/test/task-dashboard.spec.ts`

- [ ] **Step 1: 先写浏览器回归测试，锁定“重新发请求 + 保留过滤条件”**

在 `modules/web/test/task-dashboard.spec.ts` 新增一个独立用例，使用请求计数和第二次返回内容变化来证明按钮触发了新的 dashboard GET 请求，而不是仅复用旧渲染结果：

```ts
test("refreshes the dashboard without clearing the current task filter", async ({
  page,
}) => {
  let dashboardRequestCount = 0;

  await page.route("**/tasks", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    dashboardRequestCount += 1;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          dashboardRequestCount === 1
            ? [
                buildTask({ spec: "needle task", taskId: "task-123" }),
                buildTask({ spec: "background task", taskId: "task-456" }),
              ]
            : [
                buildTask({
                  spec: "needle task refreshed",
                  taskId: "task-123",
                }),
                buildTask({ spec: "background task", taskId: "task-456" }),
              ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Filter Tasks").fill("needle");

  await expect(page.getByRole("row", { name: /needle task/i })).toBeVisible();
  await expect(
    page.getByRole("row", { name: /background task/i }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Refresh" }).click();

  await expect.poll(() => dashboardRequestCount).toBe(2);
  await expect(page.getByLabel("Filter Tasks")).toHaveValue("needle");
  await expect(
    page.getByRole("row", { name: /needle task refreshed/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /background task/i }),
  ).toHaveCount(0);
});
```

这个测试同时覆盖两件事：
- 第二次 GET 请求确实发生。
- 过滤输入值仍是 `needle`，并继续作用在刷新后的数据上。

- [ ] **Step 2: 运行新回归测试，确认它先因缺少 `Refresh` 按钮而失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "refreshes the dashboard without clearing the current task filter"`

Expected: FAIL，提示无法找到名为 `Refresh` 的按钮，或请求计数仍停留在 1。

- [ ] **Step 3: 复用 Task 1 的页面实现，不额外扩展状态管理**

这一步不新增页面实现，只确认 `task-table-section.tsx` 继续保持本地筛选状态，不做状态上提。验收标准：

```tsx
<TextInput
  label="Filter Tasks"
  onChange={(event) => setFilterValue(event.currentTarget.value)}
  value={filterValue}
/>
```

保持 `TaskTableSection` 现状，依赖 `dashboard-page.tsx` 的数据级 refetch 不触发整页重建来保留本地筛选值。本任务不修改 `task-table-section.tsx`，因为 spec 只要求在现有本地 UI 状态下避免整页刷新回退。

- [ ] **Step 4: 运行定向回归，确认刷新请求与筛选保留都成立**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "refreshes the dashboard without clearing the current task filter"`

Expected: PASS。

- [ ] **Step 5: 运行最小相关测试集，确认没有回归现有刷新路径**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "keeps dashboard refresh actions behind a shared handler|refreshes the dashboard without clearing the current task filter|shows a clear error state when the task request fails|refetches the dashboard after saving a new SERVER_BASE_URL"`

Expected: PASS，至少覆盖源码约束、新增手动刷新回归、既有错误态 `Retry` 页面分支，以及 `SERVER_BASE_URL` 保存后的 refetch 路径。

- [ ] **Step 6: 提交浏览器回归测试**

```bash
git add modules/web/test/task-dashboard.spec.ts
git commit -m "test: cover dashboard manual refresh"
```

## 自检清单

- [ ] spec coverage：确认计划已覆盖页头 `Refresh`、统一 `handleRefresh`、`Retry` 复用、`isFetching` 驱动 loading/disabled、Playwright 请求重拉取与筛选保留。
- [ ] placeholder scan：确认全文没有 `TODO`、`TBD`、`implement later`、`appropriate error handling` 之类空洞描述。
- [ ] type/name consistency：确认文中统一使用 `handleRefresh`、`dashboardQuery.isFetching`、`Refresh`、`Retry`、`Filter Tasks` 这些名称，没有混入 `reloadDashboard`、`refreshDashboard` 或其他未定义命名。
