# Web SERVER_BASE_URL Default to localhost:8192 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把前端默认 `SERVER_BASE_URL` 从 `https://aim.zccz14.com` 最小化调整为 `http://localhost:8192`，并同步直接绑定该默认值的测试与当前有效文档检查结果。

**Architecture:** 保持 `modules/web/src/lib/server-base-url.ts` 作为默认值和空值回退逻辑的唯一事实源，只替换 `DEFAULT_SERVER_BASE_URL` 常量，不新增配置层。测试继续覆盖两个边界：浏览器 Local Storage 为空时的表单默认值，以及请求层仍通过 `readServerBaseUrl()` 读取默认值而不在其他模块散落地址常量。

**Tech Stack:** TypeScript、React、Playwright、pnpm、ripgrep

---

## 文件结构

**修改文件**
- `modules/web/src/lib/server-base-url.ts`：唯一需要变更的运行时默认值常量文件。
- `modules/web/test/task-dashboard.spec.ts`：更新“Local Storage 为空时回退默认值”的浏览器断言与用例描述。
- `modules/web/test/app.spec.ts`：更新源码边界断言，确保配置模块中的默认值与请求层边界保持一致。

**可能修改文件**
- 无。先执行 live docs 搜索；若只命中 `docs/superpowers/specs/**` 与 `docs/superpowers/plans/**` 这类历史记录，则本次不额外改文档。

**只读参考文件**
- `docs/superpowers/specs/2026-04-20-web-server-base-url-localhost-8192-design.md`：approved scope 与非目标。
- `modules/web/src/lib/api-client.ts`：确认请求层仍经由 `readServerBaseUrl()` 读取配置，而不是内联默认地址。
- `modules/web/src/features/task-dashboard/components/server-base-url-form.tsx`：确认表单标签仍是 `SERVER_BASE_URL`，便于复用现有 Playwright 选择器。

## 实施约束

- 只替换 `modules/web/src/lib/server-base-url.ts` 中的 `DEFAULT_SERVER_BASE_URL` 值，不新增 helper、环境变量入口或兼容分支。
- `modules/web/test/task-dashboard.spec.ts` 中为复用 mock 而显式写入 `/api` 的初始化逻辑保持不变；只改“未配置时”的默认值断言。
- `modules/web/test/app.spec.ts` 继续验证 `api-client.ts` 不内联默认地址，并把配置模块源码断言同步到新默认值。
- 历史 spec / plan 文档中的旧值记录保持不变，不为了全文搜索一致性而改写历史上下文。
- 验证命令保持最小化，优先使用定向 Playwright 用例和一次受限 `rg` 搜索。

### Task 1: 先锁定会失败的默认值测试

**Files:**
- Modify: `modules/web/test/app.spec.ts`
- Modify: `modules/web/test/task-dashboard.spec.ts`
- Reference: `modules/web/src/lib/server-base-url.ts`

- [ ] **Step 1: 更新源码边界测试中的默认值断言**

把 `modules/web/test/app.spec.ts` 的配置模块断言改成新默认值，保持请求层边界断言不变。修改后的关键片段应为：

```ts
test("keeps task dashboard data behind adapter and local config boundaries", async () => {
  const { readFile } = await import("node:fs/promises");
  const appSource = await readFile(
    `${process.cwd()}/modules/web/src/app.tsx`,
    "utf8",
  );
  const dashboardPageSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
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
  expect(dashboardPageSource).toContain("DependencyGraphSection");
  expect(dashboardPageSource).toContain(
    "graphEdges={dashboardQuery.data.graphEdges}",
  );
  expect(dashboardPageSource).toContain(
    "graphNodes={dashboardQuery.data.graphNodes}",
  );
  expect(apiClientSource).toContain("readServerBaseUrl");
  expect(apiClientSource).not.toContain("https://aim.zccz14.com");
  expect(configSource).toContain("http://localhost:8192");
  expect(adapterSource).toContain("toDashboardStatus");
  expect(adapterSource).toContain("created");
  expect(adapterSource).toContain("waiting_assumptions");
  expect(adapterSource).toContain("graphNodes");
  expect(adapterSource).toContain("graphEdges");
});
```

- [ ] **Step 2: 更新浏览器回退用例名称与断言**

把 `modules/web/test/task-dashboard.spec.ts` 中 Local Storage 为空的用例改成指向新默认值；保留删除 `aim.serverBaseUrl` 的初始化步骤。修改后的完整用例应为：

```ts
test("falls back to the default localhost SERVER_BASE_URL when local storage is empty", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("aim.serverBaseUrl");
  });

  await page.goto("/");

  await expect(page.getByLabel("SERVER_BASE_URL")).toHaveValue(
    "http://localhost:8192",
  );
});
```

- [ ] **Step 3: 运行定向测试，确认它们先失败在旧默认值上**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "keeps task dashboard data behind adapter and local config boundaries|falls back to the default localhost SERVER_BASE_URL when local storage is empty"`

Expected: FAIL，至少出现一处断言仍读到 `https://aim.zccz14.com`，说明测试已经正确锁定待修改行为。

### Task 2: 以最小代码改动切换唯一默认值事实源

**Files:**
- Modify: `modules/web/src/lib/server-base-url.ts`
- Verify against: `modules/web/test/app.spec.ts`
- Verify against: `modules/web/test/task-dashboard.spec.ts`

- [ ] **Step 1: 只替换默认值常量，不改读写语义**

把 `modules/web/src/lib/server-base-url.ts` 调整为以下内容，除了默认地址外不做其他逻辑变化：

```ts
const SERVER_BASE_URL_STORAGE_KEY = "aim.serverBaseUrl";

export const DEFAULT_SERVER_BASE_URL = "http://localhost:8192";

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

- [ ] **Step 2: 重跑定向测试，确认新默认值通过两个直接边界**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "keeps task dashboard data behind adapter and local config boundaries|falls back to the default localhost SERVER_BASE_URL when local storage is empty"`

Expected: PASS，源码边界断言和浏览器默认值断言都通过。

- [ ] **Step 3: 扩大到与默认值直接相关的最小回归集合**

Run: `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "renders the overview landing view|falls back to the default localhost SERVER_BASE_URL when local storage is empty|refetches the dashboard after saving a new SERVER_BASE_URL"`

Expected: PASS，证明默认值变化没有破坏页面加载、空配置回退和显式保存自定义地址优先级。

### Task 3: 同步 live docs 检查结果并完成提交

**Files:**
- Verify: `README.md`
- Verify: `modules/**/*.md`
- Verify: `docs/**/*.md`
- Exclude from edits: `docs/superpowers/specs/**`, `docs/superpowers/plans/**`

- [ ] **Step 1: 搜索当前有效文档是否仍把旧默认值写成前端默认地址**

Run: `rg -n "https://aim\.zccz14\.com" README.md modules docs --glob '!docs/superpowers/specs/**' --glob '!docs/superpowers/plans/**'`

Expected: 若无输出，则表示没有额外 live docs 需要同步；若命中 README 或当前使用中的模块文档，再仅修改这些 live 文档里的“前端默认地址”表述为 `http://localhost:8192`。

- [ ] **Step 2: 在无需改 live docs 的前提下做一次最终一致性检查**

Run: `rg -n "https://aim\.zccz14\.com|http://localhost:8192" modules/web/src modules/web/test`

Expected: `http://localhost:8192` 只出现在 `modules/web/src/lib/server-base-url.ts` 与直接相关测试断言中；`https://aim.zccz14.com` 不再作为当前 web 默认值残留在 `modules/web/src` 或 `modules/web/test`。

- [ ] **Step 3: 提交实现，提交信息遵循现有 Conventional Commit 风格**

Run:

```bash
git add modules/web/src/lib/server-base-url.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts
git commit -m "fix: default web SERVER_BASE_URL to localhost"
```

Expected: 生成一条聚焦默认值修正的提交；风格与当前分支上的 `docs: ...`、`chore: ...`、`feat: ...` 保持一致，不拆分额外噪音提交。

## 最小验证清单

- `pnpm exec playwright test --config playwright.config.ts modules/web/test/app.spec.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "keeps task dashboard data behind adapter and local config boundaries|falls back to the default localhost SERVER_BASE_URL when local storage is empty"`
- `pnpm exec playwright test --config playwright.config.ts modules/web/test/task-dashboard.spec.ts --project chromium --grep "renders the overview landing view|falls back to the default localhost SERVER_BASE_URL when local storage is empty|refetches the dashboard after saving a new SERVER_BASE_URL"`
- `rg -n "https://aim\.zccz14\.com" README.md modules docs --glob '!docs/superpowers/specs/**' --glob '!docs/superpowers/plans/**'`
- `rg -n "https://aim\.zccz14\.com|http://localhost:8192" modules/web/src modules/web/test`

## Self-Review

- Spec coverage：已覆盖运行时默认值替换、`task-dashboard.spec.ts` 默认值回退断言、`app.spec.ts` 源码边界断言，以及 live docs 搜索后“若无命中则不改额外文档”的范围约束。
- Placeholder scan：全文没有 `TODO`、`TBD`、"类似 Task N" 或未给命令/代码的空泛步骤。
- Consistency：统一使用 `DEFAULT_SERVER_BASE_URL`、`readServerBaseUrl()`、`http://localhost:8192`、`aim.serverBaseUrl` 这组现有命名；测试标题和命令 grep 文案相互对应。
