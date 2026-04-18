# AIM Scope Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将仓库内一方 workspace package 从 `@cz-stack/*` 统一迁移到 `@aim-ai/*`，并把 CLI 基线命令从 `cz-stack` 切换为 `aim`，同时保持测试、文档与 changeset 元数据一致。

**Architecture:** 本次实现只做 package identity 与 CLI identity 迁移，不做整仓品牌文案翻新。先用现有测试中的包名 / 命令断言建立失败信号，再最小化修改 package manifest、workspace 依赖、TypeScript 路径映射、源码 import、CLI 配置与直接依赖旧身份的文档；最后用全文搜索和现有验证命令证明仓库基线已经切换完成。

**Tech Stack:** pnpm workspace、TypeScript、oclif、Vitest、Playwright、Changesets、Biome。

---

## 文件结构与职责映射

- Create: `docs/superpowers/plans/2026-04-19-aim-scope-rename.md` - 记录本实施计划。
- Modify: `modules/api/package.json` - 把 package 名、内部依赖与 contract build filter 切到 `@aim-ai/*`。
- Modify: `modules/cli/package.json` - 把 package 名、`bin` 键名、oclif `bin`、内部依赖与 smoke 前置 filter 切到新身份。
- Modify: `modules/contract/package.json` - 把 package 名切到 `@aim-ai/contract`。
- Modify: `modules/web/package.json` - 把 package 名、内部依赖与 Playwright 前置 filter 切到 `@aim-ai/*`。
- Modify: `modules/api/tsconfig.json` - 把 contract path alias 切到 `@aim-ai/contract`。
- Modify: `modules/cli/tsconfig.json` - 把 contract path alias 切到 `@aim-ai/contract`。
- Modify: `modules/web/tsconfig.json` - 把 contract path alias 切到 `@aim-ai/contract`。
- Modify: `modules/api/src/app.ts` - 把 contract import 切到 `@aim-ai/contract`。
- Modify: `modules/api/src/routes/health.ts` - 把 contract import 切到 `@aim-ai/contract`。
- Modify: `modules/cli/src/commands/health.ts` - 把 contract import 切到 `@aim-ai/contract`。
- Modify: `modules/web/src/lib/api-client.ts` - 把 contract import 切到 `@aim-ai/contract`。
- Modify: `modules/web/src/features/health/queries.ts` - 把 contract import 切到 `@aim-ai/contract`。
- Modify: `modules/api/test/health-route.test.ts` - 把 package 名 / import 断言切到 `@aim-ai/api` 与 `@aim-ai/contract`。
- Modify: `modules/cli/test/health-command.test.ts` - 把 package 名、`bin`、oclif 与 import 断言切到 `@aim-ai/cli`、`aim`、`@aim-ai/contract`。
- Modify: `modules/contract/test/contract-package.test.ts` - 把 package 名与 CI filter 断言切到 `@aim-ai/contract` / `@aim-ai/web`。
- Modify: `modules/web/test/app.spec.ts` - 把 contract import 断言切到 `@aim-ai/contract`。
- Modify: `package.json` - 只在脚本确实直接依赖 package identity / CLI identity 时同步更新；根 `name: "cz-stack"` 保持不动，除非实现阶段证明它会阻断 rename。
- Modify: `.github/workflows/ci.yml` - 把 `--filter=!@cz-stack/web` 切到 `--filter=!@aim-ai/web`。
- Modify: `.changeset/fair-coats-itch.md` - 把 frontmatter package 名与正文中的直接 package 引用切到 `@aim-ai/*`。
- Modify: `.changeset/fresh-seas-smile.md` - 把 frontmatter package 名切到 `@aim-ai/*`。
- Modify: `.changeset/green-crabs-move.md` - 把 frontmatter package 名切到 `@aim-ai/*`，并把正文中的当前 package / CLI 直接引用切到新身份。
- Modify: `README.md` - 只更新模块入口、安装 / 使用说明、命令示例中直接依赖 package 名或 CLI 命令名的内容。
- Modify: `docs/api/README.md` - 把当前基线说明中的 `@cz-stack/*` 直接引用切到 `@aim-ai/*`。
- Modify: `docs/architecture/module-roles.md` - 把当前基线说明中的 `@cz-stack/*` 直接引用切到 `@aim-ai/*`。
- Modify: `docs/architecture/validation.md` - 把 CLI 命令与 package identity 相关描述同步到 `aim` / `@aim-ai/*`。
- Modify: `pnpm-lock.yaml` - 如 workspace package rename 触发 lockfile 中的 workspace 条目更新，则一并提交。

## 实施约束

- 只处理直接依赖 package identity 或 CLI identity 的引用；`README.md` 顶部的品牌标题、历史 spec、历史 plan、OpenAPI server 域名等非直接 package / CLI 身份文本不在本次 scope。
- 不修改已批准 spec `docs/superpowers/specs/2026-04-19-aim-scope-rename-design.md`；该文件保留为本次 rename 的设计记录。
- 不新增 `@cz-stack/*` 兼容包，也不保留 `cz-stack` CLI 别名入口；迁移后的唯一基线命令是 `aim`。
- 根 `package.json` 的 `name` 默认保持 `cz-stack`；只有在执行 rename 时证明它会直接影响 workspace package identity、changeset 解析或 CLI 分发，才单独升级决策。
- 对全文搜索命中的 `cz-stack` 文本必须逐条判断：直接 package / CLI 身份引用必须清理，历史背景或纯品牌叙述可以保留，但不能继续伪装成当前基线说明。

### Task 1: 先把 rename 失败信号固定到现有测试

**Files:**
- Modify: `modules/api/test/health-route.test.ts`
- Modify: `modules/cli/test/health-command.test.ts`
- Modify: `modules/contract/test/contract-package.test.ts`
- Modify: `modules/web/test/app.spec.ts`

- [ ] Step 1: 先把四个现有测试文件中的旧 package / CLI 断言改成目标状态，确保后续 rename 是被测试驱动而不是盲改字符串。

```ts
// modules/api/test/health-route.test.ts
expect(apiPackage.name).toBe("@aim-ai/api");
expect(apiSource).toContain(
  'import { openApiDocument } from "@aim-ai/contract";',
);

// modules/cli/test/health-command.test.ts
expect(cliPackage.name).toBe("@aim-ai/cli");
expect(cliPackage.bin).toEqual({
  aim: "bin/dev.js",
});
expect(cliPackage.oclif).toEqual({
  bin: "aim",
  commands: {
    identifier: "commands",
    strategy: "explicit",
    target: "./dist/index.mjs",
  },
});
expect(importSpecifiers).toContain("@aim-ai/contract");

// modules/contract/test/contract-package.test.ts
expect(contractPackage.name).toBe("@aim-ai/contract");
expect(ciWorkflowSource).toContain(
  "pnpm --filter=!@aim-ai/web -r --workspace-concurrency=1 --if-present run test",
);

// modules/web/test/app.spec.ts
expect(importSpecifiers).toContain("@aim-ai/contract");
```

- [ ] Step 2: 运行受影响的 Vitest / Playwright 断言，确认它们在实现前以旧名不匹配的方式失败。

Run: `pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project contract --project api --project cli && pnpm exec playwright test --config playwright.config.ts`
Expected: FAIL；至少出现 `@cz-stack/*` 或 `cz-stack` 与目标值 `@aim-ai/*` / `aim` 不一致的断言失败。

- [ ] Step 3: 记录失败点只应来自 rename 相关断言，不应因为额外重构引入新的无关失败；若出现无关失败，先收窄本次修改面再继续。

Run: `pnpm exec vitest run --config vitest.workspace.ts --project contract --project api --project cli`
Expected: FAIL；失败点集中在 manifest / import / filter 的旧身份断言。

### Task 2: 迁移 workspace package identity 与 CLI bin identity

**Files:**
- Modify: `modules/api/package.json`
- Modify: `modules/cli/package.json`
- Modify: `modules/contract/package.json`
- Modify: `modules/web/package.json`
- Modify: `modules/api/tsconfig.json`
- Modify: `modules/cli/tsconfig.json`
- Modify: `modules/web/tsconfig.json`
- Modify: `modules/api/src/app.ts`
- Modify: `modules/api/src/routes/health.ts`
- Modify: `modules/cli/src/commands/health.ts`
- Modify: `modules/web/src/lib/api-client.ts`
- Modify: `modules/web/src/features/health/queries.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `pnpm-lock.yaml`

- [ ] Step 1: 先修改四个 workspace package manifest，把 `name` 与内部 workspace 依赖统一切到新作用域；同时把 CLI `bin` / oclif `bin` 改成 `aim`。

```json
// modules/contract/package.json
"name": "@aim-ai/contract"

// modules/api/package.json
"name": "@aim-ai/api",
"dependencies": {
  "@aim-ai/contract": "workspace:*"
},
"scripts": {
  "test": "pnpm run test:type && pnpm run test:lint && pnpm --filter @aim-ai/contract run build && pnpm run build && pnpm --dir ../.. exec vitest run --config vitest.workspace.ts --project api"
}

// modules/cli/package.json
"name": "@aim-ai/cli",
"bin": {
  "aim": "bin/dev.js"
},
"oclif": {
  "bin": "aim"
},
"dependencies": {
  "@aim-ai/contract": "workspace:*"
},
"scripts": {
  "test:smoke": "pnpm --dir ../.. --filter @aim-ai/contract run build && pnpm run build && node --input-type=module --eval \"import {createServer} from 'node:http'; import {once} from 'node:events'; import {spawn} from 'node:child_process'; const server = createServer((request, response) => { response.writeHead(request.url === '/health' ? 200 : 404, {'content-type': 'application/json'}); response.end(JSON.stringify(request.url === '/health' ? {status: 'ok'} : {code: 'UNAVAILABLE', message: 'not found'})); }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); if (!address || typeof address === 'string') throw new Error('expected tcp server address'); const child = spawn(process.execPath, ['./bin/dev.js', 'health', '--base-url', 'http://127.0.0.1:' + address.port], {cwd: process.cwd(), stdio: 'inherit'}); const [code] = await once(child, 'close'); server.close(); await once(server, 'close'); process.exit(code ?? 1);\""
}

// modules/web/package.json
"name": "@aim-ai/web",
"dependencies": {
  "@aim-ai/contract": "workspace:*"
},
"scripts": {
  "test:web": "pnpm --dir ../.. --filter @aim-ai/contract run build && pnpm --dir ../.. exec playwright test --config playwright.config.ts"
}
```

- [ ] Step 2: 把所有 TypeScript path alias 与源码 import 同步切到 `@aim-ai/contract`，避免 package.json rename 后编译期仍引用旧 specifier。

```ts
// modules/api/tsconfig.json / modules/cli/tsconfig.json / modules/web/tsconfig.json
"paths": {
  "@aim-ai/contract": ["../contract/src/index.ts"]
}

// modules/api/src/app.ts
import { openApiDocument } from "@aim-ai/contract";

// modules/api/src/routes/health.ts
} from "@aim-ai/contract";

// modules/cli/src/commands/health.ts
} from "@aim-ai/contract";

// modules/web/src/lib/api-client.ts
import { createContractClient } from "@aim-ai/contract";

// modules/web/src/features/health/queries.ts
import { ContractClientError, type HealthError } from "@aim-ai/contract";
```

- [ ] Step 3: 更新根脚本、CI filter 与任何直接依赖旧 package identity 的运行入口；根包名不动，但所有 `@cz-stack/*` filter 必须切完。

```yaml
# .github/workflows/ci.yml
run: pnpm run test:repo && pnpm --filter=!@aim-ai/web -r --workspace-concurrency=1 --if-present run test
```

```json
// package.json
"scripts": {
  "openapi:generate": "pnpm --filter ./modules/contract generate",
  "openapi:check": "pnpm --filter ./modules/contract generate:check && pnpm --filter ./modules/contract build && node --input-type=module --eval \"import { pathToFileURL } from 'node:url'; const contractModule = await import(pathToFileURL(process.cwd() + '/modules/contract/dist/index.mjs').href); if (contractModule.openApiDocument.openapi !== '3.1.0') throw new Error('expected OpenAPI 3.1.0 document'); if (!contractModule.openApiDocument.paths[contractModule.healthPath]) throw new Error('expected health path in OpenAPI document');\""
}
```

- [ ] Step 4: 运行最小实现链路，确认 rename 后 manifest、TypeScript import 与 CLI 配置已经自洽。

Run: `pnpm install --lockfile-only && pnpm test:build-fixtures && pnpm exec vitest run --config vitest.workspace.ts --project contract --project api --project cli`
Expected: PASS；`pnpm-lock.yaml` 若更新，则只反映 workspace package rename，不引入无关依赖变更。

- [ ] Step 5: 单独运行 CLI smoke 与 Playwright，确认 `aim` 已成为唯一基线命令名，且浏览器链路继续通过共享 contract。

Run: `pnpm smoke && pnpm test:web`
Expected: PASS；CLI smoke 成功，且仓库内直接 package / CLI 身份已切到 `@aim-ai/*` / `aim`。

### Task 3: 同步 changesets 与当前基线文档

**Files:**
- Modify: `.changeset/fair-coats-itch.md`
- Modify: `.changeset/fresh-seas-smile.md`
- Modify: `.changeset/green-crabs-move.md`
- Modify: `README.md`
- Modify: `docs/api/README.md`
- Modify: `docs/architecture/module-roles.md`
- Modify: `docs/architecture/validation.md`

- [ ] Step 1: 先修改 changeset frontmatter，把所有受影响 package 条目统一切到 `@aim-ai/*`；正文里凡是把旧 package 名当作当前条目说明的地方也一起改掉。

```md
---
"@aim-ai/contract": minor
"@aim-ai/api": patch
"@aim-ai/web": patch
"@aim-ai/cli": patch
---
```

- [ ] Step 2: 更新 README 中直接承担当前基线说明职责的 package / CLI 引用，但不要机械替换品牌叙述。

```md
- [`modules/contract`](modules/contract) — `@aim-ai/contract`，导出 Zod schema、OpenAPI 文档与 typed client。
- [`modules/api`](modules/api) — `@aim-ai/api`，提供 `/health` 与 `/openapi.json` 等 API 入口。
- [`modules/web`](modules/web) — `@aim-ai/web`，提供消费共享 contract 的 Vite + React Web app。
- [`modules/cli`](modules/cli) — `@aim-ai/cli`，提供复用共享 client 的 oclif CLI。
```

- [ ] Step 3: 更新 `docs/api/README.md` 与 `docs/architecture/*.md` 中描述当前实现边界的 package / CLI 直接引用，让文档与代码同名；保留历史背景或纯品牌段落不动。

```md
当前仓库已经落地 `@aim-ai/contract` 与 `@aim-ai/api`：

- `@aim-ai/contract` 维护 OpenAPI 文档、Zod schema 与共享 client。
- `@aim-ai/api` 提供 `/openapi.json` 作为 JSON 导出入口，不再内置 `/docs` 展示页面。
```

- [ ] Step 4: 对文档做一次人工自检，确认命令名、package 名、相对链接都与实现一致，且没有把 `cz-stack` 历史文本误改成与上下文不符的新词。

Run: `pnpm lint && pnpm changeset:check`
Expected: PASS；Changesets frontmatter 能被识别，Markdown 改动未引入格式问题或失效条目。

### Task 4: 全仓残留扫描与最终回归

**Files:**
- Verify only: `package.json`
- Verify only: `modules/*/**`
- Verify only: `.changeset/*.md`
- Verify only: `README.md`
- Verify only: `docs/**`
- Verify only: `.github/workflows/ci.yml`

- [ ] Step 1: 对 `@cz-stack/` 与 `cz-stack` 做全文搜索，先把命中分类为“必须清理的直接身份引用”与“允许保留的历史/品牌文本”。

Run: `rg -n '@cz-stack/|\bcz-stack\b' package.json modules .changeset README.md docs .github`
Expected: 结果只剩已批准 spec、历史 spec / 历史 plan、品牌叙述或 OpenAPI 域名等非范围内容；不再出现任何当前有效 package、import、workspace filter、changeset 条目或 CLI 命令调用的旧名。

- [ ] Step 2: 对新身份做正向搜索，确认四个 workspace package、源码 import、测试断言、changeset 条目与 CLI bin 都已经切到目标状态。

Run: `rg -n '@aim-ai/(api|cli|contract|web)|\baim\b' modules package.json .changeset README.md docs .github`
Expected: 能看到 `@aim-ai/api`、`@aim-ai/cli`、`@aim-ai/contract`、`@aim-ai/web` 以及 CLI `aim` 的直接引用覆盖 manifest、源码、测试、文档与 CI。

- [ ] Step 3: 运行最终最小必要验证，覆盖类型检查、lint、测试、构建、smoke、OpenAPI 与 release 元数据路径。

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke && pnpm openapi:check && pnpm changeset:check`
Expected: PASS；rename 不再导致 workspace 依赖、CLI bin、文档、changeset 或 CI 相关断裂。

- [ ] Step 4: 提交实现时只包含 scope rename 直接相关文件，不顺手修 unrelated 文案、品牌标题或历史记录。

Run: `git status --short`
Expected: 只出现本计划列出的 package / CLI rename 相关文件与必要的 `pnpm-lock.yaml` 更新。
