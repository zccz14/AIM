# Package-Local Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把根级 `tests/api`、`tests/cli`、`tests/contracts`、`tests/web`、`tests/repo` 迁移为 package-local `test/**` 与根级 `test/repo/**`，并把根包收敛为同名 `test:*` 能力编排入口。

**Architecture:** 本次实现只做测试文件归属迁移、根级 runner 发现路径更新，以及 package/root 脚本契约收敛。根级 `vitest.workspace.ts` 与 `playwright.config.ts` 继续保留在仓库根目录，但只扫描 `modules/*/test/**` 与 `test/repo/**`；各 package 通过统一的 `test`、`test:type`、`test:lint`，以及按需存在的 `test:smoke` / `test:web` 暴露自身测试能力，根 `package.json` 只按同名能力聚合，不再直接指向旧根级测试目录。

**Tech Stack:** pnpm workspace、TypeScript、Vitest、Playwright、Biome。

---

## 文件结构与职责映射

- Create: `modules/contract/test/contract-package.test.ts` - 承接原 `tests/contracts/contract-package.test.ts`，并把文件内相对路径改为以 `modules/contract/test` 为基准。
- Create: `modules/api/test/health-route.test.ts` - 承接原 `tests/api/health-route.test.ts`，并把文件内相对路径改为以 `modules/api/test` 为基准。
- Create: `modules/cli/test/health-command.test.ts` - 承接原 `tests/cli/health-command.test.ts`，并把文件内相对路径改为以 `modules/cli/test` 为基准。
- Create: `modules/web/test/app.spec.ts` - 承接原 `tests/web/app.spec.ts`。
- Create: `test/repo/changeset-check.test.ts` - 承接原 `tests/repo/changeset-check.test.ts`，作为根包唯一保留的 repo-level 测试目录。
- Delete: `tests/contracts/contract-package.test.ts`
- Delete: `tests/api/health-route.test.ts`
- Delete: `tests/cli/health-command.test.ts`
- Delete: `tests/web/app.spec.ts`
- Delete: `tests/repo/changeset-check.test.ts`
- Modify: `vitest.workspace.ts` - 把 `contract`、`api`、`cli`、`repo` 项目的 `include` 从 `tests/**` 改到 `modules/*/test/**` 与 `test/repo/**`。
- Modify: `playwright.config.ts` - 把 `testDir` 从 `./tests/web` 改到 `./modules/web/test`。
- Modify: `modules/contract/package.json` - 新增 `test:type`、`test:lint`，并把 `test` 规范为 `test:type + test:lint + vitest` 的完整入口。
- Modify: `modules/api/package.json` - 新增 `test:type`、`test:lint`，并把 `test` 规范为 `test:type + test:lint + vitest` 的完整入口。
- Modify: `modules/cli/package.json` - 新增 `test:type`、`test:lint`、`test:smoke`，并把 `test` 规范为 `test:type + test:lint + vitest + test:smoke` 的完整入口。
- Modify: `modules/web/package.json` - 新增 `test:type`、`test:lint`、`test:web`，并把 `test` 规范为 `test:type + test:lint + test:web` 的完整入口。
- Modify: `package.json` - 新增 `test:repo`、`test:type`、`test:lint`、`test:smoke`、`test:web`，删除旧的根级路径导向型 `test:unit` / `test:integration` / `test:e2e` / `smoke:cli`，并让根 `test` 聚合 `test:repo` 与各 package 的 `test`。

## 实施约束

- 只迁移测试文件路径、runner 发现路径和脚本契约；不要新增共享 testing toolkit、不要替换 Vitest/Playwright、不要把 runner 配置全面下放到 package。
- 不新增 `vitest.config.ts`、`playwright.config.ts` 的 package-local 副本；本次仍使用根级 `vitest.workspace.ts` 与 `playwright.config.ts`。
- 根包只能保留 `test/repo/**`；`modules/contract`、`modules/api`、`modules/cli`、`modules/web` 的测试文件都必须进入各自 `test/**`。
- 根级 `test:*` 必须聚合同名 package 脚本，不能继续直接写死 `tests/api`、`tests/cli`、`tests/contracts`、`tests/web`、`tests/repo` 这些旧路径。
- 只清理当前运行链路中的旧根级测试引用；不要回写历史 spec、历史 plan 或其他仅作为历史记录存在的文档。

### Task 1: 迁移 Vitest 测试到 package-local 与 `test/repo`

**Files:**
- Create: `modules/contract/test/contract-package.test.ts`
- Create: `modules/api/test/health-route.test.ts`
- Create: `modules/cli/test/health-command.test.ts`
- Create: `test/repo/changeset-check.test.ts`
- Delete: `tests/contracts/contract-package.test.ts`
- Delete: `tests/api/health-route.test.ts`
- Delete: `tests/cli/health-command.test.ts`
- Delete: `tests/repo/changeset-check.test.ts`

- [ ] Step 1: 创建目标目录并用 `git mv` 迁移四个 Vitest 测试文件，先让仓库物理结构符合 spec，再修正新位置的相对路径。

```bash
mkdir -p modules/contract/test modules/api/test modules/cli/test test/repo
git mv tests/contracts/contract-package.test.ts modules/contract/test/contract-package.test.ts
git mv tests/api/health-route.test.ts modules/api/test/health-route.test.ts
git mv tests/cli/health-command.test.ts modules/cli/test/health-command.test.ts
git mv tests/repo/changeset-check.test.ts test/repo/changeset-check.test.ts
```

- [ ] Step 2: 修正三个 package-local Vitest 文件顶部的 URL / import 常量，使它们全部以新目录为基准解析到自身 package、根配置和跨 package 依赖。

```ts
// modules/contract/test/contract-package.test.ts
const contractPackageUrl = new URL("../package.json", import.meta.url);
const contractEntryUrl = new URL("../dist/index.mjs", import.meta.url);
const contractOpenApiSourceUrl = new URL("../src/openapi.ts", import.meta.url);
const contractIndexSourceUrl = new URL("../src/index.ts", import.meta.url);
const generatedClientUrl = new URL("../generated/client.ts", import.meta.url);
const generatedTypesUrl = new URL("../generated/types.ts", import.meta.url);
const generatedZodUrl = new URL("../generated/zod.ts", import.meta.url);
const rootPackageUrl = new URL("../../../package.json", import.meta.url);
const vitestWorkspaceUrl = new URL("../../../vitest.workspace.ts", import.meta.url);
const playwrightConfigUrl = new URL("../../../playwright.config.ts", import.meta.url);

// modules/api/test/health-route.test.ts
const apiPackageUrl = new URL("../package.json", import.meta.url);
const apiEntryUrl = new URL("../dist/app.mjs", import.meta.url);
const contractEntryUrl = new URL("../../contract/dist/index.mjs", import.meta.url);
const apiSourceUrl = new URL("../src/app.ts", import.meta.url);

// modules/cli/test/health-command.test.ts
const repoRoot = new URL("../../../", import.meta.url);
const cliPackageUrl = new URL("../package.json", import.meta.url);
const cliBinUrl = new URL("../bin/dev.js", import.meta.url);
const cliRootUrl = new URL("../", import.meta.url);
const cliCommandSourceUrl = new URL("../src/commands/health.ts", import.meta.url);
```

- [ ] Step 3: 立即运行 Vitest 工作区命令，确认在 `vitest.workspace.ts` 仍指向旧根级路径时出现预期失败，证明下一步确实需要改 runner 发现路径。

Run: `pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project contract --project api --project cli --project repo`
Expected: FAIL；至少一个 project 报 `No test files found` 或仍指向 `tests/contracts`、`tests/api`、`tests/cli`、`tests/repo` 这些旧路径。

- [ ] Step 4: 更新 `vitest.workspace.ts`，只把根工作区的测试发现路径切换到新的 package-local / repo-local 布局，不做其他 runner 行为修改。

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "contract",
          include: ["modules/contract/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "api",
          include: ["modules/api/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "cli",
          include: ["modules/cli/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "repo",
          include: ["test/repo/**/*.test.ts"],
        },
      },
    ],
  },
});
```

- [ ] Step 5: 重新运行同一条 Vitest 工作区命令，确认新的发现路径已经能从 `modules/*/test` 与 `test/repo` 找到全部非浏览器测试。

Run: `pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project contract --project api --project cli --project repo`
Expected: PASS；四个 project 都从新路径发现并执行测试，不再出现任何 `tests/contracts`、`tests/api`、`tests/cli`、`tests/repo` 的运行时依赖。

### Task 2: 迁移 Web Playwright 测试并更新根级浏览器发现路径

**Files:**
- Create: `modules/web/test/app.spec.ts`
- Delete: `tests/web/app.spec.ts`
- Modify: `playwright.config.ts`

- [ ] Step 1: 创建 `modules/web/test` 并把浏览器测试移动到 package-local 目录，保持测试内容不做行为性重写。

```bash
mkdir -p modules/web/test
git mv tests/web/app.spec.ts modules/web/test/app.spec.ts
```

- [ ] Step 2: 在未更新 `playwright.config.ts` 前先运行一次浏览器测试，确认旧 `testDir` 仍指向 `./tests/web` 时无法发现新位置的测试文件。

Run: `pnpm exec playwright test --config playwright.config.ts`
Expected: FAIL；输出仍指向 `./tests/web`，并报告未找到测试或未执行任何 `modules/web/test` 下的用例。

- [ ] Step 3: 只修改根级 `playwright.config.ts` 的 `testDir`，把浏览器测试发现入口切换到 `modules/web/test`，保留现有 browser matrix 与 `webServer` 配置不变。

```ts
import { defineConfig, devices } from "@playwright/test";

const apiPort = 43100;
const webPort = 43173;

export default defineConfig({
  testDir: "./modules/web/test",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter ./modules/api exec tsx src/server.ts",
      port: apiPort,
      reuseExistingServer: false,
      env: {
        ...process.env,
        PORT: `${apiPort}`,
      },
    },
    {
      command: `pnpm --filter ./modules/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      port: webPort,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
    },
  ],
});
```

- [ ] Step 4: 重新运行 Playwright，确认根级浏览器 runner 已从 `modules/web/test/app.spec.ts` 发现并执行 Web 测试。

Run: `pnpm exec playwright test --config playwright.config.ts`
Expected: PASS；Chromium / Firefox 两个 project 都执行 `modules/web/test/app.spec.ts`，页面仍从 `/api/health` 获取状态并通过现有断言。

### Task 3: 规范各 package 的 `test:*` 脚本契约

**Files:**
- Modify: `modules/contract/package.json`
- Modify: `modules/api/package.json`
- Modify: `modules/cli/package.json`
- Modify: `modules/web/package.json`

- [ ] Step 1: 先修改 `modules/contract/package.json` 与 `modules/api/package.json`，给两个 Vitest package 补齐 `test:type` 与 `test:lint`，并让 `test` 成为完整入口而不是单独的 vitest 快捷命令。

```json
{
  "scripts": {
    "typecheck": "pnpm exec tsc --project tsconfig.json --noEmit",
    "test:type": "pnpm run typecheck",
    "test:lint": "pnpm --dir ../.. exec biome check modules/contract/package.json modules/contract/src modules/contract/test",
    "test": "pnpm run test:type && pnpm run test:lint && pnpm run build && pnpm --dir ../.. exec vitest run --config vitest.workspace.ts --project contract"
  }
}
```

```json
{
  "scripts": {
    "typecheck": "pnpm exec tsc --project tsconfig.json --noEmit",
    "test:type": "pnpm run typecheck",
    "test:lint": "pnpm --dir ../.. exec biome check modules/api/package.json modules/api/src modules/api/test",
    "test": "pnpm run test:type && pnpm run test:lint && pnpm run build && pnpm --dir ../.. exec vitest run --config vitest.workspace.ts --project api"
  }
}
```

- [ ] Step 2: 修改 `modules/cli/package.json`，把现有 smoke 逻辑重命名为 `test:smoke`，补齐 `test:type`、`test:lint`，并让 `test` 依次覆盖类型、lint、Vitest 和 smoke。

```json
{
  "scripts": {
    "typecheck": "pnpm exec tsc --project tsconfig.json --noEmit",
    "test:type": "pnpm run typecheck",
    "test:lint": "pnpm --dir ../.. exec biome check modules/cli/package.json modules/cli/bin modules/cli/src modules/cli/test",
    "test": "pnpm run test:type && pnpm run test:lint && pnpm run build && pnpm --dir ../.. exec vitest run --config vitest.workspace.ts --project cli && pnpm run test:smoke",
    "test:smoke": "node --input-type=module --eval \"import {createServer} from 'node:http'; import {once} from 'node:events'; import {spawn} from 'node:child_process'; const server = createServer((request, response) => { response.writeHead(request.url === '/health' ? 200 : 404, {'content-type': 'application/json'}); response.end(JSON.stringify(request.url === '/health' ? {status: 'ok'} : {code: 'UNAVAILABLE', message: 'not found'})); }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); if (!address || typeof address === 'string') throw new Error('expected tcp server address'); const child = spawn(process.execPath, ['./bin/dev.js', 'health', '--base-url', 'http://127.0.0.1:' + address.port], {cwd: process.cwd(), stdio: 'inherit'}); const [code] = await once(child, 'close'); server.close(); await once(server, 'close'); process.exit(code ?? 1);\""
  }
}
```

- [ ] Step 3: 修改 `modules/web/package.json`，为浏览器 package 补齐 `test:type`、`test:lint`、`test:web`，并让 `test` 只聚合自身完整测试范围，不引入 smoke 或额外 root orchestration 逻辑。

```json
{
  "scripts": {
    "typecheck": "pnpm exec tsc --project tsconfig.json --noEmit",
    "test:type": "pnpm run typecheck",
    "test:lint": "pnpm --dir ../.. exec biome check modules/web/package.json modules/web/src modules/web/test",
    "test:web": "pnpm --dir ../.. exec playwright test --config playwright.config.ts",
    "test": "pnpm run test:type && pnpm run test:lint && pnpm run test:web"
  }
}
```

- [ ] Step 4: 分别执行 package-local 能力入口，确认每个 package 只覆盖自身定义的测试范围。

Run: `pnpm --filter ./modules/contract run test && pnpm --filter ./modules/api run test && pnpm --filter ./modules/cli run test && pnpm --filter ./modules/web run test`
Expected: PASS；`contract` / `api` 只运行各自类型、lint、Vitest，`cli` 额外运行 `test:smoke`，`web` 额外运行 `test:web`，没有任何包再依赖旧的根级 `tests/*` 路径。

### Task 4: 把根包收敛为同名能力编排入口

**Files:**
- Modify: `package.json`

- [ ] Step 1: 先把根 `package.json` 的脚本职责重排为“根自检 + 同名 package 聚合”，新增 `test:repo`，并删除旧的路径导向型 `test:unit`、`test:integration`、`test:e2e`、`smoke:cli`。

```json
{
  "scripts": {
    "lint": "pnpm exec biome check package.json pnpm-workspace.yaml tsconfig.base.json biome.json tsdown.config.ts .npmrc .gitignore",
    "typecheck": "pnpm exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck --types node tsdown.config.ts",
    "test:repo": "pnpm exec vitest run --config vitest.workspace.ts --project repo",
    "test:type": "pnpm run typecheck && pnpm --filter ./modules/contract run test:type && pnpm --filter ./modules/api run test:type && pnpm --filter ./modules/cli run test:type && pnpm --filter ./modules/web run test:type",
    "test:lint": "pnpm run lint && pnpm --filter ./modules/contract run test:lint && pnpm --filter ./modules/api run test:lint && pnpm --filter ./modules/cli run test:lint && pnpm --filter ./modules/web run test:lint",
    "test:smoke": "pnpm --filter ./modules/cli run test:smoke",
    "test:web": "pnpm --filter ./modules/web run test:web",
    "test": "pnpm run test:repo && pnpm --filter ./modules/contract run test && pnpm --filter ./modules/api run test && pnpm --filter ./modules/cli run test && pnpm --filter ./modules/web run test",
    "smoke": "pnpm run test:smoke",
    "validate": "pnpm run test:type && pnpm run test:lint && pnpm run test && pnpm build && pnpm openapi:check",
    "release:check": "pnpm run test:type && pnpm run test:lint && pnpm run test && pnpm build && pnpm openapi:check"
  }
}
```

- [ ] Step 2: 逐个运行根级能力入口，确认根包只做 orchestration，不再直接绑定旧测试路径。

Run: `pnpm run test:repo && pnpm run test:type && pnpm run test:lint && pnpm run test:smoke && pnpm run test:web`
Expected: PASS；根 `test:repo` 只执行 `test/repo/**/*.test.ts`，其余 `test:*` 都通过同名 package 脚本完成，不再出现 `test:unit` / `test:integration` / `test:e2e` / `smoke:cli` 的调用链。

- [ ] Step 3: 运行完整根 `test`，确认根 `test` 先跑 `test:repo`，再按 package 进入各自的完整 `test` 入口，满足“root orchestration + per-package ownership”的验收目标。

Run: `pnpm run test`
Expected: PASS；输出顺序能看出先执行根 `test:repo`，再依次执行 `modules/contract`、`modules/api`、`modules/cli`、`modules/web` 的 `test`，且 CLI smoke 与 Web Playwright 只通过各自 package 的脚本进入。

### Task 5: 清理旧根级测试引用并做收尾验证

**Files:**
- Modify: `package.json`
- Modify: `vitest.workspace.ts`
- Modify: `playwright.config.ts`
- Delete: `tests/contracts/contract-package.test.ts`
- Delete: `tests/api/health-route.test.ts`
- Delete: `tests/cli/health-command.test.ts`
- Delete: `tests/web/app.spec.ts`
- Delete: `tests/repo/changeset-check.test.ts`

- [ ] Step 1: 搜索运行链路中的旧根级测试路径，确认 `package.json`、`vitest.workspace.ts`、`playwright.config.ts`、`modules/*/package.json`、`test/**`、`modules/*/test/**` 中已经不再引用 `tests/api`、`tests/cli`、`tests/contracts`、`tests/web`、`tests/repo`。

Run: `rg 'tests/(api|cli|contracts|web|repo)' package.json vitest.workspace.ts playwright.config.ts modules test`
Expected: 退出码 1；这些当前运行文件里不再残留旧目录引用。历史 spec / 历史 plan 文档仍可保留旧路径描述，但不在本次清理范围内。

- [ ] Step 2: 对最终文件树做一次定向检查，确认测试归属已经完全符合 spec 中的目标布局。

Run: `rg --files modules/contract/test modules/api/test modules/cli/test modules/web/test test/repo`
Expected: 输出至少包含 `modules/contract/test/contract-package.test.ts`、`modules/api/test/health-route.test.ts`、`modules/cli/test/health-command.test.ts`、`modules/web/test/app.spec.ts`、`test/repo/changeset-check.test.ts`，且仓库中不再存在 `tests/api`、`tests/cli`、`tests/contracts`、`tests/web`、`tests/repo` 的 tracked 测试文件。

- [ ] Step 3: 运行补丁级完整自检，确保没有残余路径错误、格式问题或冲突标记。

Run: `git diff --check && git diff --stat`
Expected: `git diff --check` 无 trailing whitespace / conflict marker / malformed patch；`git diff --stat` 只显示测试迁移、runner 配置和脚本契约收敛这几类改动。

## 全量验证命令与预期结果

- `pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project contract --project api --project cli --project repo` -> 非浏览器测试全部从 `modules/contract/test`、`modules/api/test`、`modules/cli/test`、`test/repo` 发现并通过。
- `pnpm exec playwright test --config playwright.config.ts` -> 浏览器测试从 `modules/web/test/app.spec.ts` 发现并在 Chromium / Firefox 下通过。
- `pnpm --filter ./modules/contract run test && pnpm --filter ./modules/api run test && pnpm --filter ./modules/cli run test && pnpm --filter ./modules/web run test` -> 证明 package-local `test` / `test:*` 能力入口可独立工作。
- `pnpm run test:repo && pnpm run test:type && pnpm run test:lint && pnpm run test:smoke && pnpm run test:web && pnpm run test` -> 证明根级 orchestration 入口按同名能力聚合 package，不再直连旧根级测试路径。
- `rg 'tests/(api|cli|contracts|web|repo)' package.json vitest.workspace.ts playwright.config.ts modules test` -> 无匹配，证明当前运行链路已清除旧路径引用。
- `git diff --check` -> 无补丁格式错误。

## 自检结果

- [x] 已覆盖 spec 中的六类实现内容：测试迁移到 `modules/contract/test`、`modules/api/test`、`modules/cli/test`、`modules/web/test`、`test/repo`；更新 `vitest.workspace.ts` 与 `playwright.config.ts`；规范 package `test:*`；重构根 `package.json` 聚合；删除旧根级测试引用；补齐 root/package 两层验证命令。
- [x] 计划严格限制在路径迁移、脚本契约与 runner 发现路径调整，没有引入共享 testing toolkit、框架替换、任务系统重写或 runner 配置全面去中心化。
- [x] 所有步骤都给出了精确文件路径、命令和预期结果，没有未展开的占位描述或“后续再补”的模糊步骤。
- [x] 名称保持一致：package-local 统一使用 `test`、`test:type`、`test:lint`，按需使用 `test:smoke` / `test:web`；根包内部唯一新增的私有脚本名为 `test:repo`。
