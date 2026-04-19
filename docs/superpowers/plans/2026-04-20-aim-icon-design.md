# AIM Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前仓库内落地一套与 approved spec 一致的 AIM 几何化靶心 Icon 资产，并把它最小接入现有 web 入口与 README 品牌位，确保小尺寸场景至少有可执行的验证闭环。

**Architecture:** 把品牌图形的事实源收敛到仓库内的 `docs/brand/` SVG 源文件，再把 web 运行时需要的稳定 URL 版本放到 `modules/web/public/`，避免把品牌骨架散落到组件内手写。现有前端入口只做三处最小接线：`index.html` 提供 favicon、`dashboard-page.tsx` 提供应用内品牌标记、`README.md` 提供仓库主品牌展示；验证继续优先走当前已有的 Playwright + Vite + build 链路，并用源码断言补足 SVG 结构与小尺寸约束。

**Tech Stack:** SVG、TypeScript、React 19、Mantine、Vite、Playwright、Biome、pnpm workspace

---

## 文件结构

**新增文件**
- `docs/brand/aim-icon.svg`：AIM 标准版几何靶心 SVG 源文件，供 README 与后续品牌触点复用。
- `docs/brand/aim-icon-16.svg`：针对 favicon / 16px 识别的简化小尺寸 SVG 源文件，只保留最稳定的外轮廓、内环与中心命中点。
- `modules/web/public/aim-icon.svg`：web 运行时引用的标准版 Icon 静态资源。
- `modules/web/public/favicon.svg`：web 浏览器标签页直接引用的小尺寸 Icon 静态资源。

**修改文件**
- `modules/web/index.html`：把当前过时标题改为 `AIM`，并接入 `/favicon.svg`。
- `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`：在现有 dashboard 顶部标题区域加入 AIM 品牌图形，形成当前唯一的应用内品牌位。
- `modules/web/test/app.spec.ts`：新增源码边界断言，锁定品牌资产路径、favicon 接线、README 品牌位与 SVG 的小尺寸骨架约束。
- `modules/web/test/task-dashboard.spec.ts`：新增浏览器级断言，确认页面实际渲染 AIM Icon 且 `head` 中存在 favicon link。
- `README.md`：在仓库主入口顶部加入与正式 Icon 同源的品牌图形展示，不额外包装成插画式 hero。

**只读参考文件**
- `docs/superpowers/specs/2026-04-20-aim-icon-design.md`：approved 语义、视觉约束、多场景适配原则与非目标。
- `modules/web/package.json`：确认当前最小验证脚本仍以 `build`、`test:web`、`test:lint` 为主，不引入新的验证工具。
- `docs/architecture/validation.md`：复用仓库现有“最小回归优先、无需新增专用文档 lint”口径。

## 实施约束

- Icon 必须保持“几何化、产品化、去 emoji 化的靶心图形”语义，不把任何 SVG 做成系统 emoji 临摹稿、写实箭矢或装饰插画。
- 本次只落地最小必要资产与接线：标准版源文件、小尺寸源文件、web public 拷贝、favicon 接线、dashboard 顶部品牌位、README 顶部品牌位。
- 不扩展为完整品牌系统，不新增 brand color token、设计系统、独立图标组件库、PWA manifest、apple-touch icon、营销海报或更多页面改造。
- `docs/brand/aim-icon-16.svg` 必须显式面向 16px 使用，避免细描边；优先用实心圆环和中心点，不依赖细线箭头。
- `dashboard-page.tsx` 只在现有标题区域做品牌接入，不重排 dashboard 信息架构，不引入新的 header/navbar。
- README 只增加同源 Icon 展示，不重写现有产品定位正文，不引入额外品牌口号或视觉主图。

### Task 1: 先写失败断言，锁定品牌资产与接线边界

**Files:**
- Modify: `modules/web/test/app.spec.ts`
- Modify: `modules/web/test/task-dashboard.spec.ts`
- Reference: `modules/web/index.html`
- Reference: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`
- Reference: `README.md`

- [ ] **Step 1: 在源码边界测试中锁定 icon 资产、favicon 接线与 README 品牌位**

把 `modules/web/test/app.spec.ts` 追加一个新的源码断言用例，直接读取 icon 资产和入口文件；当前基线下这些文件/片段尚不存在，因此会先失败。新增用例应为：

```ts
test("wires the shared AIM icon assets into web and README entry points", async () => {
  const { readFile } = await import("node:fs/promises");
  const appShellSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );
  const htmlSource = await readFile(
    `${process.cwd()}/modules/web/index.html`,
    "utf8",
  );
  const readmeSource = await readFile(`${process.cwd()}/README.md`, "utf8");
  const iconSource = await readFile(
    `${process.cwd()}/docs/brand/aim-icon.svg`,
    "utf8",
  );
  const faviconSource = await readFile(
    `${process.cwd()}/docs/brand/aim-icon-16.svg`,
    "utf8",
  );

  expect(htmlSource).toContain('<title>AIM</title>');
  expect(htmlSource).toContain('rel="icon"');
  expect(htmlSource).toContain('href="/favicon.svg"');

  expect(appShellSource).toContain('alt="AIM icon"');
  expect(appShellSource).toContain('src="/aim-icon.svg"');
  expect(appShellSource).toContain('AIM');

  expect(readmeSource).toContain('docs/brand/aim-icon.svg');
  expect(readmeSource).toContain('alt="AIM icon"');

  expect(iconSource).toContain('viewBox="0 0 64 64"');
  expect(iconSource).toContain('<circle cx="32" cy="32" r="30"');
  expect(iconSource).toContain('<circle cx="32" cy="32" r="6"');

  expect(faviconSource).toContain('viewBox="0 0 16 16"');
  expect(faviconSource).toContain('<circle cx="8" cy="8" r="7"');
  expect(faviconSource).toContain('<circle cx="8" cy="8" r="2"');
  expect(faviconSource).not.toContain('stroke-width="1"');
});
```

- [ ] **Step 2: 在浏览器测试中锁定实际渲染的品牌位与 favicon link**

把 `modules/web/test/task-dashboard.spec.ts` 追加一条浏览器断言，确认 dashboard 顶部存在 AIM 图形，且文档头部暴露 favicon 链接。新增用例应为：

```ts
test("renders the AIM brand mark and favicon entrypoint", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByAltText("AIM icon")).toBeVisible();
  await expect(page.getByText("AIM")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Task Dashboard" })).toBeVisible();

  await expect(
    page.locator('head link[rel="icon"][href="/favicon.svg"]'),
  ).toHaveCount(1);
});
```

- [ ] **Step 3: 运行定向测试，确认品牌工作尚未落地前先失败**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "wires the shared AIM icon assets into web and README entry points|renders the AIM brand mark and favicon entrypoint"`

Expected: FAIL；至少会因为 `docs/brand/aim-icon.svg` / `docs/brand/aim-icon-16.svg` 不存在、`index.html` 尚未接入 favicon、或页面中没有 `AIM icon` 品牌位而失败。

### Task 2: 创建几何化 icon 源文件，并提供 web 可直接引用的静态资源

**Files:**
- Create: `docs/brand/aim-icon.svg`
- Create: `docs/brand/aim-icon-16.svg`
- Create: `modules/web/public/aim-icon.svg`
- Create: `modules/web/public/favicon.svg`
- Verify against: `modules/web/test/app.spec.ts`

- [ ] **Step 1: 新建标准版 SVG 源文件，固定 64x64 几何靶心骨架**

创建 `docs/brand/aim-icon.svg`，使用低色数、同心圆、中心命中点与受约束方向切角来表达“目标收敛 + 命中”，不要使用细箭头描边。文件内容直接写为：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" role="img" aria-labelledby="aimIconTitle aimIconDesc">
  <title id="aimIconTitle">AIM icon</title>
  <desc id="aimIconDesc">Geometric target mark expressing convergence and precise execution.</desc>
  <circle cx="32" cy="32" r="30" fill="#E11D48" />
  <circle cx="32" cy="32" r="20" fill="#FFF7ED" />
  <circle cx="32" cy="32" r="11" fill="#E11D48" />
  <circle cx="32" cy="32" r="6" fill="#0F172A" />
  <path d="M41 9L55 9L55 23L49 23L49 16.24L43.24 22L39 17.76L44.76 12H41V9Z" fill="#0F172A" />
</svg>
```

- [ ] **Step 2: 新建 16px 小尺寸 SVG 源文件，并同步生成 web public 版本**

1. 创建 `docs/brand/aim-icon-16.svg`，只保留 favicon 必需骨架，避免任何依赖细描边的小元素：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" role="img" aria-label="AIM favicon">
  <circle cx="8" cy="8" r="7" fill="#E11D48" />
  <circle cx="8" cy="8" r="4.5" fill="#FFF7ED" />
  <circle cx="8" cy="8" r="2" fill="#0F172A" />
  <path d="M10.25 2H14V5.75H12.7V4.22L11.07 5.85L10.15 4.93L11.78 3.3H10.25V2Z" fill="#0F172A" />
</svg>
```

2. 创建 `modules/web/public/aim-icon.svg`，内容与 `docs/brand/aim-icon.svg` 保持一致。
3. 创建 `modules/web/public/favicon.svg`，内容与 `docs/brand/aim-icon-16.svg` 保持一致。

- [ ] **Step 3: 重跑源码边界测试，确认资产文件与小尺寸骨架已就位**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts --project chromium --grep "wires the shared AIM icon assets into web and README entry points"`

Expected: 仍可能 FAIL 在 `index.html`、`README.md` 或 `dashboard-page.tsx` 尚未接线的断言上，但不应再因为 `docs/brand/aim-icon.svg` 或 `docs/brand/aim-icon-16.svg` 缺失而报错。

### Task 3: 把 icon 接入现有 web 入口与 README 品牌位

**Files:**
- Modify: `modules/web/index.html`
- Modify: `modules/web/src/features/task-dashboard/components/dashboard-page.tsx`
- Modify: `README.md`
- Verify against: `modules/web/test/task-dashboard.spec.ts`
- Verify against: `modules/web/test/app.spec.ts`

- [ ] **Step 1: 在 `index.html` 中接入 AIM 标题与 favicon**

把 `modules/web/index.html` 改成以下内容，保持 Vite 启动入口不变，只新增正式标题和 favicon link：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>AIM</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 在 dashboard 顶部标题区域接入 AIM 品牌图形**

只修改 `modules/web/src/features/task-dashboard/components/dashboard-page.tsx` 的 import 和标题块，不新建独立 header。目标代码应为：

```tsx
import {
  Alert,
  AppShell,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AlertCircle } from "lucide-react";
import { useState } from "react";

import { getTaskDashboardErrorMessage } from "../queries.js";
import { useTaskDashboardQuery } from "../use-task-dashboard-query.js";
import { DependencyGraphSection } from "./dependency-graph-section.js";
import { OverviewSection } from "./overview-section.js";
import { ServerBaseUrlForm } from "./server-base-url-form.js";
import { TaskDetailsDrawer } from "./task-details-drawer.js";
import { TaskTableSection } from "./task-table-section.js";

export const DashboardPage = () => {
  const dashboardQuery = useTaskDashboardQuery();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask =
    dashboardQuery.data?.tasks.find((task) => task.id === selectedTaskId) ??
    null;

  return (
    <AppShell padding="lg">
      <AppShell.Main>
        <Stack gap="lg">
          <Group align="center" gap="sm">
            <img alt="AIM icon" height={28} src="/aim-icon.svg" width={28} />
            <div>
              <Text fw={700} size="sm">
                AIM
              </Text>
              <Title order={1}>Task Dashboard</Title>
            </div>
          </Group>
          <ServerBaseUrlForm onSave={() => dashboardQuery.refetch()} />

          {dashboardQuery.isPending ? (
            <Center mih={240}>
              <Loader aria-label="Loading task dashboard" />
            </Center>
          ) : null}

          {dashboardQuery.isError ? (
            <Alert
              color="red"
              icon={<AlertCircle size={16} />}
              title="Dashboard Error"
            >
              <Stack gap="sm">
                <Text>
                  {getTaskDashboardErrorMessage(dashboardQuery.error)}
                </Text>
                <Button
                  onClick={() => void dashboardQuery.refetch()}
                  variant="light"
                >
                  Retry
                </Button>
              </Stack>
            </Alert>
          ) : null}

          {dashboardQuery.isSuccess &&
          dashboardQuery.data.tasks.length === 0 ? (
            <Text>No tasks available from the configured server.</Text>
          ) : null}

          {dashboardQuery.isSuccess && dashboardQuery.data.tasks.length > 0 ? (
            <>
              <OverviewSection
                dashboard={dashboardQuery.data}
                onSelectTask={setSelectedTaskId}
              />
              <DependencyGraphSection
                graphEdges={dashboardQuery.data.graphEdges}
                graphNodes={dashboardQuery.data.graphNodes}
                onSelectTask={setSelectedTaskId}
              />
              <TaskTableSection
                onSelectTask={setSelectedTaskId}
                tasks={dashboardQuery.data.tasks}
              />
              <TaskDetailsDrawer
                onClose={() => setSelectedTaskId(null)}
                opened={selectedTask !== null}
                task={selectedTask}
              />
            </>
          ) : null}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
};
```

- [ ] **Step 3: 在 README 顶部加入与正式 icon 同源的品牌展示**

在 `README.md` 的 `# AIM` 标题下方、现有产品定位引用块上方插入以下片段；只展示单个 Icon，不扩写新的品牌文案：

```md
<p align="center">
  <img src="docs/brand/aim-icon.svg" alt="AIM icon" width="96" height="96" />
</p>
```

- [ ] **Step 4: 重跑定向 Playwright 用例，确认 web 入口与 README 接线全部成立**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "wires the shared AIM icon assets into web and README entry points|renders the AIM brand mark and favicon entrypoint"`

Expected: PASS；源码断言和浏览器断言都通过，说明资产路径、favicon、dashboard 品牌位与 README 品牌位已闭环。

### Task 4: 用最小回归确认小尺寸可用性与仓库集成没有被破坏

**Files:**
- Verify: `docs/brand/aim-icon-16.svg`
- Verify: `modules/web/public/favicon.svg`
- Verify: `modules/web/index.html`
- Verify: `modules/web/test/app.spec.ts`
- Verify: `modules/web/test/task-dashboard.spec.ts`

- [ ] **Step 1: 运行 web build，确认新增 SVG 资源能被现有入口正常打包**

Run: `pnpm --filter @aim-ai/web build`

Expected: PASS；Vite 成功输出 web 产物，说明 `modules/web/public/aim-icon.svg` 与 `modules/web/public/favicon.svg` 的接线没有破坏当前前端构建链路。

- [ ] **Step 2: 运行最小浏览器回归，确认品牌位接线没有影响 dashboard 主路径**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "renders the overview landing view|renders the AIM brand mark and favicon entrypoint"`

Expected: PASS；既保留原有 dashboard 首屏主路径，又确认新品牌位已经稳定存在。

- [ ] **Step 3: 用源码断言和静态搜索确认小尺寸 favicon 仍保持极简骨架**

Run: `rg -n 'viewBox="0 0 16 16"|circle cx="8" cy="8" r="7"|circle cx="8" cy="8" r="2"|stroke-width="1"' docs/brand/aim-icon-16.svg modules/web/public/favicon.svg`

Expected: 两个 SVG 都命中 `viewBox="0 0 16 16"`、外环 `r="7"` 和中心点 `r="2"`；不应命中 `stroke-width="1"`，说明 favicon 版本没有回退成依赖细描边的小尺寸脆弱实现。

- [ ] **Step 4: 对本次可被仓库现有工具直接检查的文件执行最小静态检查**

Run: `pnpm exec biome check README.md modules/web/src/features/task-dashboard/components/dashboard-page.tsx modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts`

Expected: PASS；README、TSX 与测试文件均无格式问题。`index.html` 与两个 SVG 继续通过前面的 Playwright 断言、`rg` 骨架检查和 `build` 命令间接覆盖，不为这次任务额外引入新的静态检查工具。

- [ ] **Step 5: 提交 icon 落地改动**

Run:

```bash
git add README.md modules/web/index.html modules/web/public/aim-icon.svg modules/web/public/favicon.svg modules/web/src/features/task-dashboard/components/dashboard-page.tsx modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts docs/brand/aim-icon.svg docs/brand/aim-icon-16.svg
git commit -m "feat: add AIM icon assets and web branding"
```

Expected: 生成单条聚焦 AIM Icon 落地的提交，范围只覆盖本计划列出的品牌资产、接线与验证文件。

## 最小验证清单

- `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "wires the shared AIM icon assets into web and README entry points|renders the AIM brand mark and favicon entrypoint"`
- `pnpm --filter @aim-ai/web build`
- `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "renders the overview landing view|renders the AIM brand mark and favicon entrypoint"`
- `rg -n 'viewBox="0 0 16 16"|circle cx="8" cy="8" r="7"|circle cx="8" cy="8" r="2"|stroke-width="1"' docs/brand/aim-icon-16.svg modules/web/public/favicon.svg`
- `pnpm exec biome check README.md modules/web/src/features/task-dashboard/components/dashboard-page.tsx modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts`

## Self-Review

- Spec coverage：已覆盖标准版与 16px 小尺寸资产、favicon 接线、app 内品牌位、README 同源品牌位，以及“小尺寸优先保轮廓和中心识别”的最小验证要求。
- Placeholder scan：已去掉过于宽泛的“validation”命令表述与脆弱 JSX 文本匹配；全文没有 `TODO`、`TBD`、泛化的“自行处理边界”或“类似 Task N”占位写法，每个改动步骤都给出了具体文件、代码或命令。
- Consistency：统一使用 `AIM icon`、`/aim-icon.svg`、`/favicon.svg`、`docs/brand/aim-icon.svg`、`docs/brand/aim-icon-16.svg` 这组命名，README、源码断言、浏览器断言与提交信息中的名称保持一致。
