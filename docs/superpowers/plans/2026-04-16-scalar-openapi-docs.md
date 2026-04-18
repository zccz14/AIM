# Scalar OpenAPI Docs Implementation Plan

> 2026-04-16 实现收敛说明：本计划后续执行以“OpenAPI 原生 `servers` + `@scalar/cli` 直接输出最终 HTML”为准；`src/runtime/*`、自定义 server 状态管理、wrapper 注入与自定义 URL 输入不再继续实现。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个独立静态 `modules/docs` workspace 模块，使用 `@scalar/cli` 消费 `modules/contract/openapi/openapi.yaml` 生成可部署 API 文档，并在浏览器端支持 `dev / staging / prod / custom URL` 的运行时 `baseUrl` 切换。

**Architecture:** `modules/docs` 负责三件事：调用 `@scalar/cli` 生成 Scalar 静态文档骨架、在构建产物里注入最小 wrapper 资源、在浏览器端维护当前 server 选择并把它同步到 Scalar 渲染层。OpenAPI 事实源继续只保留在 `modules/contract/openapi/openapi.yaml`，docs 模块只读消费并在构建时复制到静态产物中，不引入 API 代理、Node 托管服务或 SDK 生成。

**Tech Stack:** pnpm workspace、TypeScript、`@scalar/cli`、原生浏览器 DOM API / `localStorage`、Vitest、Playwright、Node.js 文件脚本。

---

## 文件结构与职责映射

- Create: `modules/docs/package.json` — 独立 docs workspace 模块清单，声明 `@scalar/cli`、构建/预览/验证脚本。
- Create: `modules/docs/tsconfig.json` — docs 模块的浏览器端 TypeScript 编译配置。
- Create: `modules/docs/scalar.config.json` — `@scalar/cli` 构建配置，输入固定指向 `../../modules/contract/openapi/openapi.yaml`，输出固定落到 `./.scalar-dist`。
- Create: `modules/docs/src/config/servers.ts` — `dev / staging / prod` 预置环境定义、默认环境 id、展示文案。
- Create: `modules/docs/src/runtime/state.ts` — 当前 server 的解析、切换、持久化与回退逻辑。
- Create: `modules/docs/src/runtime/bootstrap.ts` — 页面初始化、控件挂载、当前 server 展示、向 Scalar 注入当前 base URL。
- Create: `modules/docs/src/runtime/styles.css` — server 切换控件最小样式，只服务当前 docs wrapper。
- Create: `modules/docs/scripts/build.mjs` — 顺序执行 Scalar CLI 构建、复制 `openapi.yaml`、编译 runtime、注入 wrapper 资源。
- Create: `modules/docs/scripts/preview.mjs` — 本地静态预览服务器，仅用于手动验证和 Playwright webServer。
- Create: `tests/docs/runtime.test.ts` — 纯状态逻辑单测，覆盖默认值、持久化恢复、自定义 URL 校验与失效回退。
- Create: `tests/docs/site.spec.ts` — 浏览器级验证，覆盖 server 预置切换、自定义 URL、生效文案展示和静态产物访问。
- Modify: `package.json` — 增加根级 `docs:*`、`test:unit:docs`、`test:e2e:docs`、`build`/`validate` 串联入口。
- Modify: `vitest.workspace.ts` — 新增 `docs` project，纳入 `tests/docs/runtime.test.ts`。
- Create: `playwright.docs.config.ts` — docs 模块独立 Playwright 配置，避免影响现有 `tests/web` 基线。

## 实施约束

- 只读消费 `modules/contract/openapi/openapi.yaml`；不得复制维护第二份手工契约。
- `modules/docs/dist/` 与 `modules/docs/.scalar-dist/` 都是构建产物；实现步骤里只允许脚本覆盖，不允许人工编辑。
- 运行时切换只改 docs wrapper 的浏览器状态；不得把 `baseUrl` 回写进 `modules/contract/openapi/openapi.yaml`、根环境配置或其他模块。
- 若 Scalar 原生静态输出已自带 server selector，则 wrapper 只补持久化、自定义 URL 与当前 server 文案；若原生能力不足，wrapper 才负责最小重挂载，但渲染引擎仍必须保持为 Scalar。

### Task 1: 建立 docs workspace 骨架与验证入口

**Files:**
- Create: `modules/docs/package.json`
- Create: `modules/docs/tsconfig.json`
- Create: `modules/docs/scalar.config.json`
- Create: `modules/docs/scripts/build.mjs`
- Create: `modules/docs/scripts/preview.mjs`
- Modify: `package.json`
- Modify: `vitest.workspace.ts`
- Create: `playwright.docs.config.ts`

- [ ] Step 1: 新建 `modules/docs/package.json`，只声明静态文档所需最小依赖与脚本。起始内容直接写成：

```json
{
  "name": "@cz-stack/docs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node ./scripts/build.mjs",
    "typecheck": "pnpm exec tsc --project tsconfig.json --noEmit",
    "preview": "node ./scripts/preview.mjs ./dist 43240",
    "test:runtime": "pnpm --dir ../.. exec vitest run tests/docs/runtime.test.ts"
  },
  "devDependencies": {
    "@scalar/cli": "^0.7.0"
  }
}
```

- [ ] Step 2: 新建 `modules/docs/tsconfig.json`，把编译范围锁定到 wrapper runtime，避免把构建产物目录纳入 TypeScript。配置骨架直接写成：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./.runtime-dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", ".scalar-dist", ".runtime-dist"]
}
```

- [ ] Step 3: 新建 `modules/docs/scalar.config.json`，明确唯一输入源与中间输出目录。配置至少包含以下字段，路径不要写成别名：

```json
{
  "input": "../../modules/contract/openapi/openapi.yaml",
  "output": "./.scalar-dist",
  "theme": "default",
  "title": "CZ-Stack API Reference"
}
```

- [ ] Step 4: 新建 `modules/docs/scripts/build.mjs`，先清理 `dist/.scalar-dist/.runtime-dist`，再执行 Scalar 构建、TypeScript 编译、复制原始 `openapi.yaml`、注入 wrapper 资源。脚本主体按下面组织，后续任务只补辅助函数，不改流程顺序：

```js
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

await rm(new URL("../dist", import.meta.url), { force: true, recursive: true });
await rm(new URL("../.scalar-dist", import.meta.url), { force: true, recursive: true });
await rm(new URL("../.runtime-dist", import.meta.url), { force: true, recursive: true });

await run("pnpm", ["exec", "scalar", "build", "--config", "./scalar.config.json"], {
  cwd: new URL("..", import.meta.url),
});
await run("pnpm", ["exec", "tsc", "--project", "./tsconfig.json"], {
  cwd: new URL("..", import.meta.url),
});
await mkdir(new URL("../dist/runtime", import.meta.url), { recursive: true });
await cp(new URL("../.scalar-dist", import.meta.url), new URL("../dist", import.meta.url), { recursive: true });
await cp(new URL("../.runtime-dist/runtime", import.meta.url), new URL("../dist/runtime", import.meta.url), { recursive: true });
await cp(new URL("../../contract/openapi/openapi.yaml", import.meta.url), new URL("../dist/openapi.yaml", import.meta.url));

const htmlPath = new URL("../dist/index.html", import.meta.url);
const html = await readFile(htmlPath, "utf8");
const patchedHtml = html.replace(
  "</head>",
  '  <link rel="stylesheet" href="./runtime/styles.css" />\n</head>',
).replace("</body>", '  <script type="module" src="./runtime/bootstrap.js"></script>\n</body>');
await writeFile(htmlPath, patchedHtml, "utf8");
```

- [ ] Step 5: 新建 `modules/docs/scripts/preview.mjs`，提供无依赖静态预览服务，保证 Playwright 和手动验收都能访问 `modules/docs/dist`。最小实现直接写成：

```js
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const [, , rootArg = "./dist", portArg = "43240"] = process.argv;
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".yaml", "application/yaml; charset=utf-8"],
]);

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const filePath = normalize(join(process.cwd(), rootArg, url.pathname === "/" ? "index.html" : url.pathname));
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(Number(portArg), "127.0.0.1");
```

- [ ] Step 6: 修改根 `package.json` 与 `vitest.workspace.ts`，把 docs 模块纳入统一验证入口。根脚本至少补以下条目：

```json
{
  "scripts": {
    "docs:build": "pnpm --filter ./modules/docs build",
    "docs:typecheck": "pnpm --filter ./modules/docs typecheck",
    "test:unit:docs": "pnpm exec vitest run --config vitest.workspace.ts --project docs",
    "test:e2e:docs": "pnpm exec playwright test --config playwright.docs.config.ts"
  }
}
```

`vitest.workspace.ts` 新增 project：

```ts
{
  test: {
    name: "docs",
    include: ["tests/docs/**/*.test.ts"],
  },
}
```

- [ ] Step 7: 新建 `playwright.docs.config.ts`，只服务 docs 模块，不复用现有 `tests/web` 基线。配置至少包含：

```ts
import { defineConfig, devices } from "@playwright/test";

const docsPort = 43240;

export default defineConfig({
  testDir: "./tests/docs",
  use: { baseURL: `http://127.0.0.1:${docsPort}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter ./modules/docs preview",
    port: docsPort,
    reuseExistingServer: false,
  },
});
```

- [ ] Step 8: 先跑一次脚手架级校验，确认命令入口与空模块结构成立，再进入运行时逻辑。

**Commands:**
- `pnpm install --ignore-scripts`
- `pnpm docs:typecheck`

**Expected:**
- `modules/docs` 被 pnpm workspace 识别。
- 根脚本能调用 docs 模块命令；此时 `docs:typecheck` 可以因缺少 runtime 文件失败，但不能再报“workspace 不存在”或“脚本不存在”。

### Task 2: 实现 server 预置、自定义 URL、持久化与回退逻辑

**Files:**
- Create: `modules/docs/src/config/servers.ts`
- Create: `modules/docs/src/runtime/state.ts`
- Create: `tests/docs/runtime.test.ts`

- [ ] Step 1: 新建 `modules/docs/src/config/servers.ts`，显式定义三个预置环境、默认环境 id 与本地存储 key。内容直接从下面开始：

```ts
export const DOCS_SERVER_STORAGE_KEY = "cz-stack.scalar.server";
export const DEFAULT_SERVER_ID = "dev" as const;

export const presetServers = [
  { id: "dev", label: "Development", baseUrl: "https://dev.api.cz-stack.local" },
  { id: "staging", label: "Staging", baseUrl: "https://staging.api.cz-stack.local" },
  { id: "prod", label: "Production", baseUrl: "https://api.cz-stack.local" },
] as const;

export type PresetServerId = (typeof presetServers)[number]["id"];
```

- [ ] Step 2: 在 `modules/docs/src/runtime/state.ts` 定义统一状态模型，禁止让“预置环境”和“自定义 URL”同时生效。推荐直接使用下面这组类型与函数名，后续任务不要改名：

```ts
export type ServerSelection =
  | { kind: "preset"; presetId: PresetServerId }
  | { kind: "custom"; baseUrl: string };

export const isValidCustomBaseUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.pathname === "/";
  } catch {
    return false;
  }
};
```

- [ ] Step 3: 在同一文件实现默认恢复、预置切换、自定义 URL 确认与存储回退。核心逻辑按下面组织：

```ts
export const resolveSelection = (raw: string | null): ServerSelection => {
  if (!raw) return { kind: "preset", presetId: DEFAULT_SERVER_ID };
  const parsed = JSON.parse(raw) as Partial<ServerSelection>;
  if (parsed.kind === "preset" && presetServers.some((item) => item.id === parsed.presetId)) {
    return { kind: "preset", presetId: parsed.presetId };
  }
  if (parsed.kind === "custom" && typeof parsed.baseUrl === "string" && isValidCustomBaseUrl(parsed.baseUrl)) {
    return { kind: "custom", baseUrl: parsed.baseUrl };
  }
  return { kind: "preset", presetId: DEFAULT_SERVER_ID };
};

export const toActiveBaseUrl = (selection: ServerSelection): string =>
  selection.kind === "preset"
    ? presetServers.find((item) => item.id === selection.presetId)?.baseUrl ?? presetServers[0].baseUrl
    : selection.baseUrl;
```

- [ ] Step 4: 新建 `tests/docs/runtime.test.ts`，先写失败单测锁定 4 条核心路径：默认环境、预置恢复、非法自定义 URL 不覆盖当前值、历史失效 preset id 自动回退。测试片段直接写成：

```ts
it("falls back to the default preset when storage is empty", () => {
  expect(resolveSelection(null)).toEqual({ kind: "preset", presetId: "dev" });
});

it("accepts a persisted custom https url", () => {
  expect(resolveSelection(JSON.stringify({ kind: "custom", baseUrl: "https://review.api.cz-stack.local/" }))).toEqual({
    kind: "custom",
    baseUrl: "https://review.api.cz-stack.local/",
  });
});

it("rejects custom urls without protocol", () => {
  expect(isValidCustomBaseUrl("review.api.cz-stack.local")).toBe(false);
});

it("drops unknown preset ids", () => {
  expect(resolveSelection(JSON.stringify({ kind: "preset", presetId: "qa" }))).toEqual({ kind: "preset", presetId: "dev" });
});
```

- [ ] Step 5: 跑 docs 单测，确认新增状态逻辑变绿，并且命名与后续 bootstrap 引用保持一致。

**Commands:**
- `pnpm exec vitest run --config vitest.workspace.ts --project docs`

**Expected:**
- `tests/docs/runtime.test.ts` 全绿。
- `ServerSelection`、`resolveSelection`、`toActiveBaseUrl`、`isValidCustomBaseUrl` 这 4 个名称在后续任务中继续复用，无需再次改名。

### Task 3: 把 Scalar 静态产物与最小 wrapper 组装到独立 docs 站点

**Files:**
- Modify: `modules/docs/scripts/build.mjs`
- Create: `modules/docs/src/runtime/bootstrap.ts`
- Create: `modules/docs/src/runtime/styles.css`

- [ ] Step 1: 在 `modules/docs/src/runtime/bootstrap.ts` 先实现页面初始化和当前 server 展示，不急着做交互。入口至少导出并调用 `bootstrapDocs()`，骨架代码直接写成：

```ts
import { DOCS_SERVER_STORAGE_KEY, presetServers } from "../config/servers.js";
import { resolveSelection, toActiveBaseUrl } from "./state.js";

const createBanner = (baseUrl: string) => {
  const banner = document.createElement("div");
  banner.dataset.serverBanner = "true";
  banner.textContent = `Current server: ${baseUrl}`;
  return banner;
};

export const bootstrapDocs = () => {
  const selection = resolveSelection(localStorage.getItem(DOCS_SERVER_STORAGE_KEY));
  const activeBaseUrl = toActiveBaseUrl(selection);
  document.body.prepend(createBanner(activeBaseUrl));
};

bootstrapDocs();
```

- [ ] Step 2: 把预置切换 `<select>`、自定义 `<input>`、确认按钮加到 `bootstrap.ts`，并在同一处维护单一生效状态。控件结构直接用原生 DOM，关键片段按下面补：

```ts
const select = document.createElement("select");
for (const preset of presetServers) {
  const option = document.createElement("option");
  option.value = preset.id;
  option.textContent = preset.label;
  select.append(option);
}

const customInput = document.createElement("input");
customInput.type = "url";
customInput.placeholder = "https://review.api.cz-stack.local/";

const confirmButton = document.createElement("button");
confirmButton.textContent = "Apply custom URL";
```

- [ ] Step 3: 在 `bootstrap.ts` 中把“应用当前 baseUrl 到 Scalar”收敛成单函数，避免按钮回调和初始化逻辑各自写一份。函数名固定为 `applyServerSelection`，实现时至少完成三件事：更新 banner 文案、写回 `localStorage`、把当前 `baseUrl` 注入 Scalar。注入逻辑按下面组织：

```ts
const applyServerSelection = async (selection: ServerSelection) => {
  const activeBaseUrl = toActiveBaseUrl(selection);
  localStorage.setItem(DOCS_SERVER_STORAGE_KEY, JSON.stringify(selection));
  document.querySelector<HTMLElement>("[data-server-banner]")!.textContent = `Current server: ${activeBaseUrl}`;
  await syncScalarServer(activeBaseUrl);
};
```

- [ ] Step 4: 在 `bootstrap.ts` 实现 `syncScalarServer(activeBaseUrl)`：浏览器启动时读取 `./openapi.yaml`，把 `servers` 重写为“当前生效 URL 在前，三个预置环境紧随其后”的顺序，再把结果传回 Scalar。关键数据变换代码直接按下面写，Scalar 接口接线再补到同函数尾部：

```ts
const buildServers = (activeBaseUrl: string) => {
  const unique = new Map<string, { url: string; description: string }>();
  unique.set(activeBaseUrl, { url: activeBaseUrl, description: "Current selection" });
  for (const preset of presetServers) {
    unique.set(preset.baseUrl, { url: preset.baseUrl, description: preset.label });
  }
  return [...unique.values()];
};
```

执行接线时遵守两个细节：
1. 如果 Scalar 原生产物暴露“更新配置/重新挂载 reference”入口，就直接用原生入口传 `servers`。
2. 如果原生入口不可复用，就销毁旧容器并用同一份 Scalar 渲染器重新挂载，禁止替换为其他文档框架。

- [ ] Step 5: 新建 `modules/docs/src/runtime/styles.css`，只给 wrapper 控件补最小布局，不接管 Scalar 主样式。最小样式可以直接写成：

```css
body {
  margin: 0;
}

[data-server-shell] {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #d7dce5;
  background: #f8fafc;
}

[data-server-banner] {
  font: 600 14px/20px ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] Step 6: 完善 `modules/docs/scripts/build.mjs`，在产物注入后读取 `modules/docs/dist/index.html`、`modules/docs/dist/openapi.yaml` 与 `modules/docs/dist/runtime/bootstrap.js` 三个关键文件，缺任何一个就直接 `throw` 终止构建。

- [ ] Step 7: 首次执行 docs 构建，确认静态站点可落盘且不依赖运行中的 Node 应用。

**Commands:**
- `pnpm --filter ./modules/docs build`
- `pnpm --filter ./modules/docs preview`

**Expected:**
- `modules/docs/dist/index.html`、`modules/docs/dist/openapi.yaml`、`modules/docs/dist/runtime/bootstrap.js` 存在。
- 访问预览页时，页面顶部能看到 `Current server:` 文案；此时即使交互尚未完全覆盖，静态资源也应全部来自 docs 模块自身产物。

### Task 4: 用浏览器级测试锁定环境切换与静态部署行为

**Files:**
- Create: `tests/docs/site.spec.ts`
- Modify: `package.json`

- [ ] Step 1: 新建 `tests/docs/site.spec.ts`，先写一个静态产物可访问测试，锁定 docs 模块确实是纯静态站点。第一条用例直接写成：

```ts
import { expect, test } from "@playwright/test";

test("serves the scalar docs shell from static files", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Current server:")).toBeVisible();
  await expect(page.locator("script[src='./runtime/bootstrap.js']")).toHaveCount(1);
});
```

- [ ] Step 2: 在同一文件增加预置环境切换用例，验证 `dev -> staging -> prod` 切换时 banner 文案同步变化，且刷新后保留最近一次有效选择。断言骨架直接写成：

```ts
test("switches between preset environments and restores the last valid choice", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").selectOption("staging");
  await expect(page.getByText("Current server: https://staging.api.cz-stack.local")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Current server: https://staging.api.cz-stack.local")).toBeVisible();
});
```

- [ ] Step 3: 再补一条自定义 URL 用例，验证完整协议头必填、非法输入不覆盖当前有效值、合法输入生效后替代预置选择。测试片段直接写成：

```ts
test("accepts a valid custom url and ignores invalid input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").selectOption("prod");
  await page.getByPlaceholder("https://review.api.cz-stack.local/").fill("review.api.cz-stack.local");
  await page.getByRole("button", { name: "Apply custom URL" }).click();
  await expect(page.getByText("Current server: https://api.cz-stack.local")).toBeVisible();
  await page.getByPlaceholder("https://review.api.cz-stack.local/").fill("https://review.api.cz-stack.local/");
  await page.getByRole("button", { name: "Apply custom URL" }).click();
  await expect(page.getByText("Current server: https://review.api.cz-stack.local/")).toBeVisible();
});
```

- [ ] Step 4: 修改根 `package.json`，把 `test:e2e:docs` 与 `docs:build` 放进可单独调用的验证链路，但不要并入现有 `test:e2e`，避免当前 Web 基线被 docs 模块拖慢。可以补一个聚合脚本：

```json
{
  "scripts": {
    "docs:validate": "pnpm docs:typecheck && pnpm test:unit:docs && pnpm docs:build && pnpm test:e2e:docs"
  }
}
```

- [ ] Step 5: 执行 docs 独立验证，确认浏览器层与静态构建层同时成立。

**Commands:**
- `pnpm test:unit:docs`
- `pnpm docs:build`
- `pnpm test:e2e:docs`

**Expected:**
- unit 测试覆盖默认回退、预置恢复、非法 URL、防止历史失效状态卡死。
- e2e 测试覆盖预置切换、自定义 URL、生效文案恢复与静态 shell 存在性。

### Task 5: 做收口验证与实现自审

**Files:**
- Modify: `modules/docs/package.json`
- Modify: `modules/docs/scripts/build.mjs`
- Modify: `tests/docs/runtime.test.ts`
- Modify: `tests/docs/site.spec.ts`

- [ ] Step 1: 检查 `modules/docs/package.json` 与根 `package.json`，确认没有出现 SDK 生成、代理服务、API 托管相关脚本；docs 模块脚本只保留 `build`、`preview`、`typecheck`、`test:runtime` 这类静态站点职责。

- [ ] Step 2: 检查 `modules/docs/scripts/build.mjs`，确认输入路径仍然只读指向 `../../modules/contract/openapi/openapi.yaml`，且构建结束后不向 `modules/contract` 目录回写任何文件。

- [ ] Step 3: 运行轻量格式/差异校验，确认新增计划内文件没有明显格式错误。

- [ ] Step 4: 按下面三条自审顺序手动过一遍：
  1. **Spec coverage：** 逐条对照设计说明里的模块独立性、Scalar CLI 构建、运行时 baseUrl 切换、预置+自定义 URL、持久化与错误回退，确保分别落在 Task 1~4 中。
  2. **Placeholder scan：** 搜索本次实现文件与测试，确认没有 `TODO`、`TBD`、`implement later`、`fill in details` 一类占位词。
  3. **Type consistency：** 确认 `ServerSelection`、`resolveSelection`、`toActiveBaseUrl`、`applyServerSelection`、`syncScalarServer` 这些函数/类型名在测试、runtime、构建脚本引用处完全一致。

- [ ] Step 5: 运行 docs 最终验证，并记录构建输出中的关键文件存在性。

**Commands:**
- `pnpm docs:validate`
- `git diff --check`

**Expected:**
- `pnpm docs:validate` 全绿。
- `git diff --check` 无空白或冲突标记问题。
- `modules/docs/dist/` 最终包含 `index.html`、`openapi.yaml`、`runtime/bootstrap.js`、`runtime/styles.css`，满足纯静态部署。

## 自审结论

- **Spec coverage：** 独立 workspace 模块与脚本入口在 Task 1；预置/自定义 URL、持久化与回退在 Task 2；Scalar CLI 构建与最小 wrapper 在 Task 3；页面级切换验证与静态部署验证在 Task 4；禁止越界能力与最终校验在 Task 5。
- **Placeholder scan：** 本计划不使用 `TODO`、`TBD`、`implement later`、`fill in details` 等占位词；所有任务都给出具体文件、命令、预期结果和关键代码骨架。
- **Type consistency：** 全文统一使用 `ServerSelection`、`resolveSelection`、`toActiveBaseUrl`、`applyServerSelection`、`syncScalarServer`、`DOCS_SERVER_STORAGE_KEY` 这组命名，没有二义性别名。

Plan complete and saved to `docs/superpowers/plans/2026-04-16-scalar-openapi-docs.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
