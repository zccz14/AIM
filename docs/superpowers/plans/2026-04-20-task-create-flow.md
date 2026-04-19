# Task Dashboard Create Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `modules/web` 的任务看板内补齐前端直连 Task API 的首版创建主路径：顶部唯一主按钮、`task_spec`-only 创建 drawer、提交成功后刷新并自动打开新任务详情。

**Architecture:** 继续把 dashboard 保持为单页单事实源：读取仍走 `task-dashboard-api.ts` + adapter/view-model，写入新增一个 feature-local create API/mutation，不引入路由、BFF、全局状态或第二套详情承载。创建 drawer 与现有详情 drawer 并列挂在 `DashboardPage`，成功后由页面层串联“关闭创建 drawer -> 刷新 query -> 选中新建 task”这条闭环，同时通过 adapter 新增 `summarizeTaskSpec()` 保证列表、概览、依赖图和详情入口对标题来源保持一致。

**Tech Stack:** React 19、TypeScript、Mantine、`@tanstack/react-query`、Playwright、Biome、pnpm workspace

---

## 文件结构

**新增文件**
- `modules/web/src/features/task-dashboard/components/create-task-drawer.tsx`：承载首版创建表单 UI，只暴露 `task_spec` 文本域、提交按钮、取消按钮、局部错误提示和 pending 态。
- `modules/web/src/features/task-dashboard/use-task-create-mutation.ts`：封装 create mutation，统一把 `task_spec` 提交给现有 contract client，并复用 dashboard error message 风格。

**修改文件**
- `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`：新增顶部主按钮、创建 drawer 开关状态、create success 回调，以及和现有详情 drawer 的选中状态编排。
- `modules/web/src/features/task-dashboard/components/task-details-drawer.tsx`：详情 drawer 展示完整 `taskSpec`，避免列表标题被摘要化后丢失正文。
- `modules/web/src/features/task-dashboard/components/overview-section.tsx`：保持概览快捷入口继续消费 adapter 派生标题，无需直接读 `task_spec`。
- `modules/web/src/features/task-dashboard/components/task-table-section.tsx`：继续消费 adapter 派生标题，并让过滤逻辑同时匹配完整 `taskSpec`，避免标题截断后无法检索正文。
- `modules/web/src/features/task-dashboard/api/task-dashboard-api.ts`：在现有 `getTaskDashboard()` 旁新增 `createTaskFromDashboard()`，只提交 `{ task_spec }`。
- `modules/web/src/features/task-dashboard/queries.ts`：补充 create mutation 的错误消息 helper，保持 dashboard feature 内统一的 contract error 文案风格。
- `modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts`：给 `DashboardTask` 增加 `taskSpec` 字段，供详情 drawer 和表格过滤使用。
- `modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`：新增 `summarizeTaskSpec()`，把 `task_spec` 转成首行摘要/截断标题，并保持 graph/table/overview/drawer 使用同一标题来源。
- `modules/web/test/app.spec.ts`：补充源码边界断言，锁定 dashboard page 中的创建入口和 feature-local create drawer / mutation 边界。
- `modules/web/test/task-dashboard.spec.ts`：补充浏览器回归，覆盖顶部主按钮、drawer 开关、只提交 `task_spec`、创建失败提示、成功后刷新并自动打开详情、标题来源一致性。

**只读参考文件**
- `docs/superpowers/specs/2026-04-20-task-create-flow-design.md`：唯一 scope 来源；不得扩展到依赖、session、worktree、PR、编辑、删除或新页面。
- `modules/web/src/lib/api-client.ts`：确认 `createWebApiClient()` 已透传 `createContractClient()`，无需引入第二套 transport。
- `modules/contract/src/index.ts`：确认 `CreateTaskRequest` 允许首版只传 `task_spec`。
- `modules/contract/generated/zod.ts`：确认 `task_spec` 是唯一必填字段，其他 create 字段均为 optional。

## 实施约束

- 创建请求体只能是 `{ task_spec: string }`；不要顺手传 `dependencies: []`、`status: "created"` 或任何空字段。
- 不增加标题输入框；UI 内唯一必填事实仍然是 `task_spec`。
- 不新增页面路由、modal 套 modal、全局 store、URL state、toast 系统或新的详情承载方式。
- 成功闭环必须发生在 `DashboardPage` 页面层：关闭创建 drawer、刷新 dashboard query、自动打开新建任务的详情 drawer。
- 标题派生只能在 adapter 内集中完成；组件继续消费 `task.title`，不要在组件里各自 `split("\n")` 或截断。
- 详情 drawer 必须展示完整 `taskSpec`，避免摘要标题替代正文造成信息丢失。
- 浏览器验证优先使用现有 Playwright 通道；不新增 Vitest/Jest/Cypress。

### Task 1: 先锁定创建入口与 drawer 壳层

**Files:**
- Modify: `modules/web/test/app.spec.ts`
- Modify: `modules/web/test/task-dashboard.spec.ts`
- Modify: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`
- Create: `modules/web/src/features/task-dashboard/components/create-task-drawer.tsx`

- [ ] **Step 1: 先写源码边界测试，锁定主按钮和 feature-local create drawer 接线**

在 `modules/web/test/app.spec.ts` 追加一个源码约束，要求创建能力仍然留在 dashboard feature 内，不引入新页面或标题字段。新增测试应为：

```ts
test("keeps task creation inside the dashboard shell", async () => {
  const { readFile } = await import("node:fs/promises");
  const dashboardPageSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );
  const createDrawerSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/create-task-drawer.tsx`,
    "utf8",
  );

  expect(dashboardPageSource).toContain('Create Task');
  expect(dashboardPageSource).toContain("<CreateTaskDrawer");
  expect(dashboardPageSource).not.toContain("react-router");
  expect(createDrawerSource).toContain('label="Task Spec"');
  expect(createDrawerSource).not.toContain('label="Title"');
});
```

- [ ] **Step 2: 先写浏览器失败测试，锁定顶部 CTA 和 drawer 开关行为**

在 `modules/web/test/task-dashboard.spec.ts` 新增下面的用例，让当前实现先失败在缺少创建入口：

```ts
test("opens and closes the create task drawer from the dashboard header", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(
    page.getByRole("dialog", { name: "Create Task" }),
  ).toBeVisible();
  await expect(page.getByLabel("Task Spec")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Task" }).nth(1),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("dialog", { name: "Create Task" }),
  ).toHaveCount(0);
});
```

- [ ] **Step 3: 运行定向测试，确认当前基线先失败在缺少 create flow UI**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "keeps task creation inside the dashboard shell|opens and closes the create task drawer from the dashboard header"`

Expected: FAIL，至少出现 `Create Task` 按钮或 `create-task-drawer.tsx` 文件不存在的断言失败。

- [ ] **Step 4: 以最小壳层实现 dashboard 顶部 CTA 与空提交禁用态**

新增 `modules/web/src/features/task-dashboard/components/create-task-drawer.tsx`，先只落地 UI 壳层和本地输入状态，不接 mutation：

```tsx
import { Button, Drawer, Group, Stack, Textarea } from "@mantine/core";
import { useState } from "react";

export const CreateTaskDrawer = ({
  onClose,
  onSubmit,
  opened,
}: {
  onClose: () => void;
  onSubmit: (taskSpec: string) => Promise<unknown> | unknown;
  opened: boolean;
}) => {
  const [taskSpec, setTaskSpec] = useState("");
  const trimmedTaskSpec = taskSpec.trim();

  return (
    <Drawer
      closeButtonProps={{ "aria-label": "Close" }}
      onClose={onClose}
      opened={opened}
      position="right"
      size="md"
      title="Create Task"
    >
      <Stack gap="md">
        <Textarea
          autosize
          label="Task Spec"
          minRows={8}
          onChange={(event) => setTaskSpec(event.currentTarget.value)}
          placeholder="Describe the task to create"
          value={taskSpec}
        />
        <Group justify="flex-end">
          <Button onClick={onClose} variant="default">
            Cancel
          </Button>
          <Button
            disabled={!trimmedTaskSpec}
            onClick={() => void onSubmit(trimmedTaskSpec)}
          >
            Create Task
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
};
```

然后在 `modules/web/src/features/task-dashboard/components/dashboard-page.tsx` 增加创建 drawer 状态与 header CTA，先用占位提交函数维持测试通过：

```tsx
const [createDrawerOpened, setCreateDrawerOpened] = useState(false);

<Group justify="space-between">
  <Title order={1}>Task Dashboard</Title>
  <Button onClick={() => setCreateDrawerOpened(true)}>Create Task</Button>
</Group>

<CreateTaskDrawer
  onClose={() => setCreateDrawerOpened(false)}
  onSubmit={async () => undefined}
  opened={createDrawerOpened}
/>
```

- [ ] **Step 5: 重跑定向测试，确认 create shell 已建立**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "keeps task creation inside the dashboard shell|opens and closes the create task drawer from the dashboard header"`

Expected: PASS。

- [ ] **Step 6: 提交 create shell**

```bash
git add modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts modules/web/src/features/task-dashboard/components/dashboard-page.tsx modules/web/src/features/task-dashboard/components/create-task-drawer.tsx
git commit -m "feat: add task create drawer shell"
```

### Task 2: 接入 create API、mutation 与失败态

**Files:**
- Modify: `modules/web/test/app.spec.ts`
- Modify: `modules/web/test/task-dashboard.spec.ts`
- Modify: `modules/web/src/features/task-dashboard/api/task-dashboard-api.ts`
- Modify: `modules/web/src/features/task-dashboard/queries.ts`
- Create: `modules/web/src/features/task-dashboard/use-task-create-mutation.ts`
- Modify: `modules/web/src/features/task-dashboard/components/create-task-drawer.tsx`
- Modify: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`

- [ ] **Step 1: 先写源码边界测试，锁定提交路径必须经过 feature-local API/mutation**

在 `modules/web/test/app.spec.ts` 追加下列断言，避免页面组件直接 `fetch("/tasks")`：

```ts
test("routes task creation through feature-local api and mutation helpers", async () => {
  const { readFile } = await import("node:fs/promises");
  const dashboardPageSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );
  const apiSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/api/task-dashboard-api.ts`,
    "utf8",
  );
  const mutationSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/use-task-create-mutation.ts`,
    "utf8",
  );

  expect(dashboardPageSource).toContain("useTaskCreateMutation");
  expect(dashboardPageSource).not.toContain('fetch("/tasks"');
  expect(apiSource).toContain("createTaskFromDashboard");
  expect(apiSource).toContain("client.createTask({ task_spec: taskSpec })");
  expect(mutationSource).toContain("useMutation");
});
```

- [ ] **Step 2: 先写浏览器失败测试，锁定只提交 `task_spec` 与服务端错误提示**

在 `modules/web/test/task-dashboard.spec.ts` 新增两个用例。第一个验证 POST body 精确等于 `{ task_spec }`，第二个验证失败文案从 contract error 透传：

```ts
test("submits only task_spec to the existing task API", async ({ page }) => {
  let createRequestBody: unknown = null;

  await page.route("**/tasks", async (route) => {
    if (route.request().method() === "POST") {
      createRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          buildTask({
            spec: "Ship create flow",
            taskId: "task-created",
          }),
        ),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();
  await page.getByLabel("Task Spec").fill("Ship create flow");
  await page.getByRole("button", { name: "Create Task" }).nth(1).click();

  await expect.poll(() => createRequestBody).toEqual({
    task_spec: "Ship create flow",
  });
});

test("shows a local create error when the task API rejects the request", async ({
  page,
}) => {
  await page.route("**/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: "TASK_VALIDATION_ERROR",
          message: "task_spec cannot be blank",
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();
  await page.getByLabel("Task Spec").fill("Ship create flow");
  await page.getByRole("button", { name: "Create Task" }).nth(1).click();

  await expect(page.getByText("Task creation failed: task_spec cannot be blank")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Create Task" }),
  ).toBeVisible();
});
```

- [ ] **Step 3: 运行定向测试，确认当前壳层先失败在未接 mutation 和错误态**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "routes task creation through feature-local api and mutation helpers|submits only task_spec to the existing task API|shows a local create error when the task API rejects the request"`

Expected: FAIL，表现为源码边界缺少 `useTaskCreateMutation`，且浏览器用例没有发出 POST 或没有显示失败提示。

- [ ] **Step 4: 新增 create API 与 mutation 封装**

先把 `modules/web/src/features/task-dashboard/api/task-dashboard-api.ts` 扩成读写并列的 feature-local API：

```ts
import type { Task, TaskListResponse } from "@aim-ai/contract";

import { createWebApiClient } from "../../../lib/api-client.js";

export const getTaskDashboard = async (): Promise<TaskListResponse> => {
  const client = createWebApiClient();
  return client.listTasks();
};

export const createTaskFromDashboard = async (
  taskSpec: string,
): Promise<Task> => {
  const client = createWebApiClient();
  return client.createTask({ task_spec: taskSpec });
};
```

新增 `modules/web/src/features/task-dashboard/use-task-create-mutation.ts`：

```ts
import { useMutation } from "@tanstack/react-query";

import { createTaskFromDashboard } from "./api/task-dashboard-api.js";

export const useTaskCreateMutation = () =>
  useMutation({
    mutationFn: createTaskFromDashboard,
  });
```

并在 `modules/web/src/features/task-dashboard/queries.ts` 补一个和读取错误风格一致的 helper：

```ts
export const getTaskCreateErrorMessage = (error: unknown) =>
  error instanceof ContractClientError
    ? `Task creation failed: ${error.error.message}`
    : "Task creation failed: unexpected error";
```

- [ ] **Step 5: 把 create drawer 接上 mutation pending/error 状态**

把 `modules/web/src/features/task-dashboard/components/create-task-drawer.tsx` 改成受控组件，接收 `errorMessage` 和 `isSubmitting`，提交前清空本地错误：

```tsx
import { Alert, Button, Drawer, Group, Stack, Textarea } from "@mantine/core";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

export const CreateTaskDrawer = ({
  errorMessage,
  isSubmitting,
  onClose,
  onSubmit,
  opened,
}: {
  errorMessage: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (taskSpec: string) => Promise<unknown> | unknown;
  opened: boolean;
}) => {
  const [taskSpec, setTaskSpec] = useState("");
  const trimmedTaskSpec = taskSpec.trim();

  useEffect(() => {
    if (!opened) {
      setTaskSpec("");
    }
  }, [opened]);

  return (
    <Drawer
      closeButtonProps={{ "aria-label": "Close" }}
      onClose={onClose}
      opened={opened}
      position="right"
      size="md"
      title="Create Task"
    >
      <Stack gap="md">
        {errorMessage ? (
          <Alert color="red" icon={<AlertCircle size={16} />}>
            {errorMessage}
          </Alert>
        ) : null}
        <Textarea
          autosize
          label="Task Spec"
          minRows={8}
          onChange={(event) => setTaskSpec(event.currentTarget.value)}
          placeholder="Describe the task to create"
          value={taskSpec}
        />
        <Group justify="flex-end">
          <Button disabled={isSubmitting} onClick={onClose} variant="default">
            Cancel
          </Button>
          <Button
            loading={isSubmitting}
            disabled={!trimmedTaskSpec}
            onClick={() => void onSubmit(trimmedTaskSpec)}
          >
            Create Task
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
};
```

然后在 `modules/web/src/features/task-dashboard/components/dashboard-page.tsx` 接入 mutation：

```tsx
const createTaskMutation = useTaskCreateMutation();

<CreateTaskDrawer
  errorMessage={
    createTaskMutation.isError
      ? getTaskCreateErrorMessage(createTaskMutation.error)
      : null
  }
  isSubmitting={createTaskMutation.isPending}
  onClose={() => {
    createTaskMutation.reset();
    setCreateDrawerOpened(false);
  }}
  onSubmit={(taskSpec) => createTaskMutation.mutateAsync(taskSpec)}
  opened={createDrawerOpened}
/>
```

- [ ] **Step 6: 重跑定向测试，确认 POST contract 和 create error UI 成立**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "routes task creation through feature-local api and mutation helpers|submits only task_spec to the existing task API|shows a local create error when the task API rejects the request"`

Expected: PASS。

- [ ] **Step 7: 提交 API 与 mutation 接线**

```bash
git add modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts modules/web/src/features/task-dashboard/api/task-dashboard-api.ts modules/web/src/features/task-dashboard/queries.ts modules/web/src/features/task-dashboard/use-task-create-mutation.ts modules/web/src/features/task-dashboard/components/create-task-drawer.tsx modules/web/src/features/task-dashboard/components/dashboard-page.tsx
git commit -m "feat: connect task create mutation"
```

### Task 3: 完成成功闭环与标题语义统一

**Files:**
- Modify: `modules/web/test/task-dashboard.spec.ts`
- Modify: `modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts`
- Modify: `modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`
- Modify: `modules/web/src/features/task-dashboard/components/task-details-drawer.tsx`
- Modify: `modules/web/src/features/task-dashboard/components/task-table-section.tsx`
- Modify: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`

- [ ] **Step 1: 先写浏览器失败测试，锁定成功后刷新、自动钻取详情和统一标题来源**

在 `modules/web/test/task-dashboard.spec.ts` 追加下面的主路径用例。它同时锁定三件事：创建成功后 drawer 关闭、列表 refetch、新任务详情自动打开；列表/概览/详情继续使用 `task_spec` 首行摘要标题；详情正文仍保留完整 `task_spec`。

```ts
test("closes the create drawer, refreshes the dashboard, and opens the new task details", async ({
  page,
}) => {
  let listRequestCount = 0;

  await page.route("**/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          buildTask({
            spec: "Create release checklist\n- draft notes\n- notify team",
            taskId: "task-created",
          }),
        ),
      });
      return;
    }

    listRequestCount += 1;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          listRequestCount === 1
            ? [
                buildTask({
                  spec: "Existing task",
                  taskId: "task-existing",
                }),
              ]
            : [
                buildTask({
                  spec: "Existing task",
                  taskId: "task-existing",
                }),
                buildTask({
                  spec: "Create release checklist\n- draft notes\n- notify team",
                  taskId: "task-created",
                }),
              ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();
  await page
    .getByLabel("Task Spec")
    .fill("Create release checklist\n- draft notes\n- notify team");
  await page.getByRole("button", { name: "Create Task" }).nth(1).click();

  await expect(
    page.getByRole("dialog", { name: "Create Task" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Task Details" }),
  ).toBeVisible();
  await expect(page.getByText("Task ID: task-created")).toBeVisible();
  await expect(page.getByText("Create release checklist")).toBeVisible();
  await expect(page.getByText("Task Spec: Create release checklist\n- draft notes\n- notify team")).toBeVisible();
  await expect(page.getByRole("row", { name: /Create release checklist/i })).toBeVisible();
  await expect.poll(() => listRequestCount).toBe(2);
});
```

- [ ] **Step 2: 再写 adapter 级标题一致性测试，锁定摘要规则只定义一次**

在同一文件追加一个源码级断言，确保标题摘要逻辑存在于 adapter，而不是散落在组件里：

```ts
test("derives task titles from task_spec inside the adapter", async () => {
  const { readFile } = await import("node:fs/promises");
  const adapterSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`,
    "utf8",
  );
  const taskTableSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/task-table-section.tsx`,
    "utf8",
  );

  expect(adapterSource).toContain("summarizeTaskSpec");
  expect(adapterSource).toContain("task.task_spec");
  expect(taskTableSource).not.toContain("split(\"\\n\")");
});
```

- [ ] **Step 3: 运行定向测试，确认当前实现先失败在成功闭环缺失和标题仍直接等于全文**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "closes the create drawer, refreshes the dashboard, and opens the new task details|derives task titles from task_spec inside the adapter"`

Expected: FAIL，表现为 create success 后 drawer 未关闭、未触发第二次 GET、未自动打开详情，或 adapter 内仍没有 `summarizeTaskSpec()`。

- [ ] **Step 4: 在 view-model 与 adapter 中补齐完整正文和标题摘要规则**

先把 `modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts` 的 `DashboardTask` 扩成：

```ts
export type DashboardTask = {
  id: string;
  title: string;
  taskSpec: string;
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
```

然后在 `modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts` 新增统一标题派生函数，并让所有任务都保存完整 `taskSpec`：

```ts
const summarizeTaskSpec = (taskSpec: string) => {
  const [firstLine = ""] = taskSpec
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const summary = firstLine || taskSpec.trim();

  return summary.length <= 72 ? summary : `${summary.slice(0, 69)}...`;
};

const tasks = response.items.map<DashboardTask>((task) => ({
  id: task.task_id,
  title: summarizeTaskSpec(task.task_spec),
  taskSpec: task.task_spec,
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
```

- [ ] **Step 5: 把成功闭环编排到 `DashboardPage`，并让详情 drawer 显示完整正文**

在 `modules/web/src/features/task-dashboard/components/dashboard-page.tsx` 把提交逻辑改成显式串联成功步骤：

```tsx
const queryClient = useQueryClient();

const handleCreateTask = async (taskSpec: string) => {
  const createdTask = await createTaskMutation.mutateAsync(taskSpec);

  setCreateDrawerOpened(false);

  const refreshedDashboard = await queryClient.fetchQuery(taskDashboardQueryOptions);
  const createdDashboardTask =
    refreshedDashboard.tasks.find((task) => task.id === createdTask.task_id) ?? null;

  setSelectedTaskId(createdDashboardTask?.id ?? createdTask.task_id);
};
```

把 `CreateTaskDrawer` 的 `onSubmit` 改成 `handleCreateTask`，并在关闭时 `createTaskMutation.reset()`。

同时把 `modules/web/src/features/task-dashboard/components/task-details-drawer.tsx` 调整为既显示摘要标题，也显示完整正文：

```tsx
<Stack gap="sm">
  <Title order={3}>{task.title}</Title>
  <Text style={{ whiteSpace: "pre-wrap" }}>Task Spec: {task.taskSpec}</Text>
  <Text>Task ID: {task.id}</Text>
  <Text>Contract Status: {task.contractStatus}</Text>
  <Text>
    Dashboard Status: <TaskStatusBadge status={task.dashboardStatus} />
  </Text>
  <Text>Session ID: {task.sessionId ?? "None"}</Text>
  <Text>Worktree: {task.worktreePath ?? "None"}</Text>
  <Text>
    Dependencies: {task.dependencies.length > 0 ? task.dependencies.join(", ") : "None"}
  </Text>
  <Text>Created At: {task.createdAt}</Text>
  <Text>Updated At: {task.updatedAt}</Text>
</Stack>
```

最后把 `modules/web/src/features/task-dashboard/components/task-table-section.tsx` 的过滤文本扩成包含 `task.taskSpec`，保证标题截断后仍能按正文搜索：

```ts
  const searchText = [
    task.title,
    task.taskSpec,
    task.id,
    task.contractStatus,
    task.dashboardStatus,
    ...task.dependencies,
  ]
```

- [ ] **Step 6: 重跑主路径回归与最小静态验证**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "opens and closes the create task drawer from the dashboard header|submits only task_spec to the existing task API|shows a local create error when the task API rejects the request|closes the create drawer, refreshes the dashboard, and opens the new task details|derives task titles from task_spec inside the adapter"`

Expected: PASS，证明 create shell、POST body、错误态、成功闭环和标题一致性全部成立。

- [ ] **Step 7: 跑 web 最小回归三件套**

Run: `pnpm --filter @aim-ai/web run test:type && pnpm --filter @aim-ai/web run test:lint && pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium`

Expected: PASS，`tsc`、Biome 和 dashboard 相关 Playwright 用例全部通过。

- [ ] **Step 8: 提交成功闭环与标题统一实现**

```bash
git add modules/web/test/task-dashboard.spec.ts modules/web/src/features/task-dashboard/model/task-dashboard-view-model.ts modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts modules/web/src/features/task-dashboard/components/task-details-drawer.tsx modules/web/src/features/task-dashboard/components/task-table-section.tsx modules/web/src/features/task-dashboard/components/dashboard-page.tsx
git commit -m "feat: complete dashboard task create flow"
```

## 最小验证清单

- `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "keeps task creation inside the dashboard shell|opens and closes the create task drawer from the dashboard header"`
- `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "routes task creation through feature-local api and mutation helpers|submits only task_spec to the existing task API|shows a local create error when the task API rejects the request"`
- `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "closes the create drawer, refreshes the dashboard, and opens the new task details|derives task titles from task_spec inside the adapter"`
- `pnpm --filter @aim-ai/web run test:type`
- `pnpm --filter @aim-ai/web run test:lint`
- `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium`

## Self-Review

- Spec coverage：已覆盖顶部唯一主按钮、dashboard 内 create drawer、`task_spec` 唯一必填并直连既有 Task API、成功后关闭创建 drawer + 刷新列表 + 自动打开新任务详情、标题继续从 `task_spec` 首行摘要/截断文本派生，且未扩展到依赖/session/worktree/PR 或新页面。
- Placeholder scan：全文没有 `TODO`、`TBD`、"适当处理"、"类似 Task N" 或无代码/无命令的空泛步骤；每个代码步骤都给了实际片段，每个验证步骤都给了精确命令与期望结果。
- Consistency：统一使用 `CreateTaskDrawer`、`useTaskCreateMutation`、`createTaskFromDashboard`、`taskSpec`、`summarizeTaskSpec()`、`Task creation failed: ...` 这组命名；测试标题、grep 文案和实现片段保持一致。
