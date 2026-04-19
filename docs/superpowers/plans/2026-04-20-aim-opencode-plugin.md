# AIM OpenCode Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `modules/opencode-plugin` 新增 `@aim-ai/opencode-plugin` 叶子包，构建并分发最小 OpenCode npm plugin 骨架，在插件加载时把随包分发的 `skills/` 目录追加到 `config.skills.paths`，同时保留静态 `agents/` 资源边界。

**Architecture:** 新包遵循仓库现有 leaf package 组织方式，但为了满足批准范围里的 `main -> dist/index.js`，本包单独增加 `modules/opencode-plugin/tsdown.config.ts`，只产出 ESM `dist/index.js` 和对应类型声明。运行时入口导出符合 `@opencode-ai/plugin` 的 npm plugin module，在 `config` hook 中通过 `new URL("../skills/", import.meta.url)` 定位已分发资源，对 `config.skills.paths` 执行 append-with-dedupe；第一版不注册 `agents/`、不注入 bootstrap prompt/context，也不添加其他 hooks。

**Tech Stack:** TypeScript、tsdown、Vitest、Node.js `url/fs` API、pnpm workspace、`@opencode-ai/plugin`

---

## 文件结构与职责映射

**新增文件**
- `modules/opencode-plugin/package.json`：声明 `@aim-ai/opencode-plugin` 包名、`main` 指向 `dist/index.js`、发布白名单、构建/验证脚本，以及 `@opencode-ai/plugin` 依赖。
- `modules/opencode-plugin/tsconfig.json`：为插件包提供独立 TypeScript 配置，继承根 `tsconfig.base.json` 并对齐 Node/ESM 构建目标。
- `modules/opencode-plugin/tsdown.config.ts`：把本包构建固定为单 ESM 输出，确保产物落到 `modules/opencode-plugin/dist/index.js`。
- `modules/opencode-plugin/src/index.ts`：导出 npm plugin module，在 `config` hook 中注册包内 `skills/` 路径并避免重复追加。
- `modules/opencode-plugin/README.md`：说明该包的安装方式、当前 v1 边界、只注册 `skills/` 不自动注入 prompt/context。
- `modules/opencode-plugin/skills/README.md`：说明 `skills/` 目录是随包分发的静态资源边界。
- `modules/opencode-plugin/skills/aim-placeholder/SKILL.md`：最小可发现 skill 占位文件，明确“仅骨架，不代表完整 AIM workflow”。
- `modules/opencode-plugin/agents/README.md`：说明 `agents/` 目录当前只做静态资源占位，不自动注册。
- `modules/opencode-plugin/agents/aim-placeholder.md`：最小 agent 资源占位文件，表达未来扩展边界。
- `modules/opencode-plugin/test/opencode-plugin.test.ts`：包级测试，覆盖 manifest、built entry、`config.skills.paths` 注册行为、非目标约束和静态资源存在性。

**修改文件**
- `vitest.workspace.ts`：新增 `opencode-plugin` project，使 `pnpm --filter @aim-ai/opencode-plugin test` 能复用现有 workspace Vitest 入口。

**只读参考文件**
- `docs/superpowers/specs/2026-04-20-aim-opencode-plugin-design.md`：唯一 scope 来源；不得扩展到 bootstrap 注入、自动注册 `agents/`、多宿主兼容层或 workflow 自动化。
- `tsconfig.base.json`：新包 TypeScript 配置继承来源。
- `tsdown.config.ts`：仓库现有 tsdown 默认值参考；仅复用必要项，不把新包强行并入双格式输出模式。
- `modules/cli/package.json`、`modules/contract/package.json`：叶子包脚本、`files`、测试入口写法参考。
- `modules/api/test/health-route.test.ts`、`modules/cli/test/health-command.test.ts`：包级 manifest + built artifact 测试风格参考。

## 实施约束

- `modules/opencode-plugin/src/index.ts` 的唯一运行时副作用是把 `modules/opencode-plugin/skills` 的已分发路径追加到 `config.skills.paths`；不得注册 `agents/`，不得写任何 bootstrap/context hooks。
- `config.skills.paths` 若原本不存在，必须创建数组；若原本已有路径，必须追加而非覆盖；若目标路径已存在，必须保持幂等。
- 路径解析必须基于已构建包位置，而不是仓库源码工作目录；实现应从 `import.meta.url` 解析相邻 `../skills/`。
- `modules/opencode-plugin/package.json` 的发布白名单至少包含 `dist`、`skills`、`agents`、`README.md`。
- `modules/opencode-plugin/skills/aim-placeholder/SKILL.md` 必须满足 OpenCode skill 文件最小约束：目录名与 `name` 一致、包含 frontmatter、正文明确说明当前只是骨架。
- 测试重点是包结构、构建入口、配置注册和发布产物；不要为 v1 添加自定义 tools、event hooks、workspace adaptor 或 prompt transform 测试。

### Task 1: 先用包级测试锁定插件包边界与静态资源结构

**Files:**
- Create: `modules/opencode-plugin/test/opencode-plugin.test.ts`
- Modify: `vitest.workspace.ts`
- Create: `modules/opencode-plugin/package.json`
- Create: `modules/opencode-plugin/tsconfig.json`
- Create: `modules/opencode-plugin/tsdown.config.ts`
- Create: `modules/opencode-plugin/README.md`
- Create: `modules/opencode-plugin/skills/README.md`
- Create: `modules/opencode-plugin/skills/aim-placeholder/SKILL.md`
- Create: `modules/opencode-plugin/agents/README.md`
- Create: `modules/opencode-plugin/agents/aim-placeholder.md`
- Create: `modules/opencode-plugin/src/index.ts`

- [ ] **Step 1: 先新增失败测试，锁定新包 manifest、静态资源与 built entry 的最小边界**

在 `modules/opencode-plugin/test/opencode-plugin.test.ts` 先写包级基线测试，并在 `vitest.workspace.ts` 增加一个名为 `opencode-plugin` 的 project。测试先断言：
1. `package.json` 包名是 `@aim-ai/opencode-plugin`，`main` 指向 `./dist/index.js`。
2. `files` 白名单至少包含 `dist`、`skills`、`agents`、`README.md`。
3. `skills/aim-placeholder/SKILL.md` 与 `agents/aim-placeholder.md` 实际存在。
4. built entry 导出默认 plugin module，且 `server` 为函数。

建议测试骨架如下：

```ts
import { access, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const pluginPackageUrl = new URL("../package.json", import.meta.url);
const pluginEntryUrl = new URL("../dist/index.js", import.meta.url);
const pluginSkillPlaceholderUrl = new URL(
  "../skills/aim-placeholder/SKILL.md",
  import.meta.url,
);
const pluginAgentPlaceholderUrl = new URL(
  "../agents/aim-placeholder.md",
  import.meta.url,
);

type PluginPackageManifest = {
  name: string;
  main: string;
  files: string[];
};

let pluginPackage: PluginPackageManifest;
let pluginModule: { default: { id?: string; server: unknown } };

beforeAll(async () => {
  pluginPackage = JSON.parse(
    await readFile(pluginPackageUrl, "utf8"),
  ) as PluginPackageManifest;
  pluginModule = (await import(
    pathToFileURL(fileURLToPath(pluginEntryUrl)).href
  )) as { default: { id?: string; server: unknown } };
});

describe("opencode plugin package baseline", () => {
  it("publishes the expected package manifest", () => {
    expect(pluginPackage.name).toBe("@aim-ai/opencode-plugin");
    expect(pluginPackage.main).toBe("./dist/index.js");
    expect(pluginPackage.files).toEqual([
      "dist",
      "skills",
      "agents",
      "README.md",
    ]);
  });

  it("ships placeholder skills and agents resources", async () => {
    await expect(access(pluginSkillPlaceholderUrl)).resolves.toBeUndefined();
    await expect(access(pluginAgentPlaceholderUrl)).resolves.toBeUndefined();
  });

  it("exports a default plugin module from the built entry", () => {
    expect(pluginModule.default.id).toBe("@aim-ai/opencode-plugin");
    expect(typeof pluginModule.default.server).toBe("function");
  });
});
```

同时把 `vitest.workspace.ts` 追加为：

```ts
{
  test: {
    name: "opencode-plugin",
    include: ["modules/opencode-plugin/test/**/*.test.ts"],
  },
}
```

- [ ] **Step 2: 运行定向测试，确认当前基线先失败**

Run: `pnpm --filter @aim-ai/opencode-plugin exec vitest run --config ../../vitest.workspace.ts --project opencode-plugin`

Expected: FAIL，报错应集中在 `modules/opencode-plugin/` 相关文件尚不存在、`vitest.workspace.ts` 尚未注册 project，或 built entry `dist/index.js` 尚未生成。

- [ ] **Step 3: 创建包清单、构建配置、文档和静态占位资源，先让包边界可构建**

按下列最小内容创建文件：

`modules/opencode-plugin/package.json`

```json
{
  "name": "@aim-ai/opencode-plugin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "skills", "agents", "README.md"],
  "scripts": {
    "build": "pnpm exec tsdown --config tsdown.config.ts",
    "typecheck": "pnpm exec tsc --project tsconfig.json --noEmit",
    "test:type": "pnpm run typecheck",
    "test:lint": "pnpm --dir ../.. exec biome check modules/opencode-plugin/package.json modules/opencode-plugin/src modules/opencode-plugin/test modules/opencode-plugin/tsconfig.json modules/opencode-plugin/tsdown.config.ts modules/opencode-plugin/README.md modules/opencode-plugin/skills modules/opencode-plugin/agents",
    "test": "pnpm run test:type && pnpm run test:lint && pnpm run build && pnpm --dir ../.. exec vitest run --config vitest.workspace.ts --project opencode-plugin"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.14.18"
  }
}
```

`modules/opencode-plugin/tsconfig.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist",
    "lib": ["ES2022"],
    "types": ["node"],
    "exactOptionalPropertyTypes": false
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`modules/opencode-plugin/tsdown.config.ts`

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["./src/index.ts"],
  format: ["esm"],
  outDir: "./dist",
  platform: "node",
  sourcemap: true,
  target: "node24",
  treeshake: true,
});
```

`modules/opencode-plugin/src/index.ts`

```ts
import type { Plugin, PluginModule } from "@opencode-ai/plugin";

export const AIMOpenCodePlugin: Plugin = async () => ({});

const pluginModule = {
  id: "@aim-ai/opencode-plugin",
  server: AIMOpenCodePlugin,
} satisfies PluginModule;

export default pluginModule;
```

`modules/opencode-plugin/README.md`

~~~md
# `@aim-ai/opencode-plugin`

`@aim-ai/opencode-plugin` is the v1 OpenCode-specific plugin skeleton for AIM.

## Scope

- Registers the packaged `skills/` directory into OpenCode config.
- Ships static `skills/` and `agents/` resources.
- Does not inject bootstrap prompts, session context, or workflow automation.

## Usage

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@aim-ai/opencode-plugin"]
}
```
~~~

`modules/opencode-plugin/skills/README.md`

```md
# Skills Boundary

This directory is packaged with `@aim-ai/opencode-plugin`.

The v1 contents are static placeholders only. They define packaging and discovery boundaries, not a full AIM workflow.
```

`modules/opencode-plugin/skills/aim-placeholder/SKILL.md`

```md
---
name: aim-placeholder
description: Placeholder AIM skill shipped only to prove packaged skill discovery.
---

## Status

This is a packaging placeholder for v1 of `@aim-ai/opencode-plugin`.

It is intentionally not a complete AIM workflow skill.
```

`modules/opencode-plugin/agents/README.md`

```md
# Agents Boundary

This directory is shipped as static package content only.

The v1 plugin does not auto-register or inject these agent resources.
```

`modules/opencode-plugin/agents/aim-placeholder.md`

```md
# AIM Agent Placeholder

This file marks the future package boundary for agent resources.

It is intentionally descriptive only in v1.
```

- [ ] **Step 4: 运行新包测试，确认骨架和 built entry 已成立**

Run: `pnpm --filter @aim-ai/opencode-plugin test`

Expected: PASS；`modules/opencode-plugin/dist/index.js` 被生成，测试确认 manifest、默认导出和静态资源已存在，但此时还没有验证 `config.skills.paths` 注册逻辑。

- [ ] **Step 5: 提交插件包骨架**

```bash
git add vitest.workspace.ts modules/opencode-plugin/package.json modules/opencode-plugin/tsconfig.json modules/opencode-plugin/tsdown.config.ts modules/opencode-plugin/src/index.ts modules/opencode-plugin/README.md modules/opencode-plugin/skills/README.md modules/opencode-plugin/skills/aim-placeholder/SKILL.md modules/opencode-plugin/agents/README.md modules/opencode-plugin/agents/aim-placeholder.md modules/opencode-plugin/test/opencode-plugin.test.ts
git commit -m "feat: scaffold opencode plugin package"
```

### Task 2: 补运行时注册逻辑，并锁定只追加 `config.skills.paths` 的 v1 行为

**Files:**
- Modify: `modules/opencode-plugin/src/index.ts`
- Modify: `modules/opencode-plugin/test/opencode-plugin.test.ts`

- [ ] **Step 1: 先补失败测试，锁定 `config.skills.paths` 的追加、去重和非目标约束**

在 `modules/opencode-plugin/test/opencode-plugin.test.ts` 追加运行时测试：
1. 调用 built plugin module 的 `server()`，拿到 hooks。
2. 对 `config.skills.paths` 已有值的场景执行 hook，断言现有值保留、包内 `skills/` 路径被追加一次。
3. 再次执行 hook，断言不会重复添加同一路径。
4. 读取源码，断言没有 `experimental.chat.system.transform`、`chat.message`、`experimental.session.compacting` 等 prompt/context hook。

建议测试片段如下：

```ts
import type { Config, PluginModule } from "@opencode-ai/plugin";

const pluginSourceUrl = new URL("../src/index.ts", import.meta.url);

it("registers the packaged skills path without overwriting existing config", async () => {
  const { default: pluginModule } = (await import(
    pathToFileURL(fileURLToPath(pluginEntryUrl)).href
  )) as { default: PluginModule };

  const hooks = await pluginModule.server({
    client: {} as never,
    project: {} as never,
    directory: process.cwd(),
    worktree: process.cwd(),
    experimental_workspace: { register() {} },
    serverUrl: new URL("https://opencode.test"),
    $: {} as never,
  });

  const config: Config = {
    skills: {
      paths: ["/existing-skill-path"],
    },
  };
  const packagedSkillsPath = fileURLToPath(
    new URL("../skills/", pluginEntryUrl),
  );

  await hooks.config?.(config);

  expect(config.skills?.paths).toEqual([
    "/existing-skill-path",
    packagedSkillsPath,
  ]);

  await hooks.config?.(config);

  expect(config.skills?.paths).toEqual([
    "/existing-skill-path",
    packagedSkillsPath,
  ]);
});

it("does not add bootstrap or context injection hooks in v1", async () => {
  const source = await readFile(pluginSourceUrl, "utf8");

  expect(source).not.toContain("experimental.chat.system.transform");
  expect(source).not.toContain("experimental.session.compacting");
  expect(source).not.toContain("chat.message");
});
```

- [ ] **Step 2: 运行定向测试，确认当前实现先失败在路径注册行为**

Run: `pnpm --filter @aim-ai/opencode-plugin exec vitest run --config ../../vitest.workspace.ts --project opencode-plugin --testNamePattern "registers the packaged skills path|does not add bootstrap"`

Expected: FAIL；当前 `AIMOpenCodePlugin` 仍返回空 hooks，`config.skills.paths` 不会追加 `modules/opencode-plugin/skills` 的 packaged path。

- [ ] **Step 3: 在插件入口实现 `config` hook，只做 skills 路径追加和去重**

把 `modules/opencode-plugin/src/index.ts` 更新为最小实现：

```ts
import { fileURLToPath } from "node:url";

import type { Config, Plugin, PluginModule } from "@opencode-ai/plugin";

const getPackagedSkillsPath = () =>
  fileURLToPath(new URL("../skills/", import.meta.url));

const appendSkillsPath = (config: Config, skillsPath: string) => {
  const currentPaths = config.skills?.paths ?? [];

  if (currentPaths.includes(skillsPath)) {
    return;
  }

  config.skills = {
    ...(config.skills ?? {}),
    paths: [...currentPaths, skillsPath],
  };
};

export const AIMOpenCodePlugin: Plugin = async () => ({
  async config(config) {
    appendSkillsPath(config, getPackagedSkillsPath());
  },
});

const pluginModule = {
  id: "@aim-ai/opencode-plugin",
  server: AIMOpenCodePlugin,
} satisfies PluginModule;

export default pluginModule;
```

实现时保持两个约束：
1. 不要注册 `agents/`。
2. 不要新增任何其他 hook，即使 `@opencode-ai/plugin` 还提供 `event`、`tool`、`experimental.*` 等能力。

- [ ] **Step 4: 重新运行包测试，确认注册行为与 v1 非目标约束同时成立**

Run: `pnpm --filter @aim-ai/opencode-plugin test`

Expected: PASS；测试确认 `config.skills.paths` 被追加且不重复，源码中不存在 bootstrap/context 注入 hook，包仍然只导出最小 server plugin module。

- [ ] **Step 5: 提交运行时注册逻辑**

```bash
git add modules/opencode-plugin/src/index.ts modules/opencode-plugin/test/opencode-plugin.test.ts
git commit -m "feat: register packaged opencode skills path"
```

### Task 3: 验证打包产物与发布白名单，确保安装后资源完整可用

**Files:**
- Verify only: `modules/opencode-plugin/package.json`
- Verify only: `modules/opencode-plugin/dist/`
- Verify only: `modules/opencode-plugin/skills/`
- Verify only: `modules/opencode-plugin/agents/`
- Verify only: `modules/opencode-plugin/README.md`

- [ ] **Step 1: 运行 typecheck 与 build，确认包本身独立可验证**

Run: `pnpm --filter @aim-ai/opencode-plugin typecheck && pnpm --filter @aim-ai/opencode-plugin build`

Expected: PASS；`modules/opencode-plugin/dist/index.js` 和 `modules/opencode-plugin/dist/index.d.ts` 存在，且不依赖仓库源码相对路径运行。

- [ ] **Step 2: 打包 tarball 并检查发布内容是否完整**

Run: `rm -rf modules/opencode-plugin/.artifacts && pnpm --filter @aim-ai/opencode-plugin pack --pack-destination modules/opencode-plugin/.artifacts && tar -tf modules/opencode-plugin/.artifacts/aim-ai-opencode-plugin-0.0.0.tgz`

Expected: 输出列表至少包含：

```text
package/dist/index.js
package/dist/index.d.ts
package/skills/README.md
package/skills/aim-placeholder/SKILL.md
package/agents/README.md
package/agents/aim-placeholder.md
package/README.md
package/package.json
```

如果 tarball 文件名与本地 `pnpm pack` 的实际命名略有差异，只允许按 scoped package 的真实输出文件名做最小修正；不要顺手改发布白名单或扩大验证范围。

- [ ] **Step 3: 运行完整包测试，确认最终验证入口稳定**

Run: `pnpm --filter @aim-ai/opencode-plugin test`

Expected: PASS；包级测试、typecheck、lint、build 一次性通过，满足 spec 中“typecheck、build、packaged artifacts、运行时注册”的最小验证标准。

- [ ] **Step 4: 提交打包验证结果对应变更**

```bash
git add modules/opencode-plugin/package.json modules/opencode-plugin/README.md modules/opencode-plugin/skills modules/opencode-plugin/agents modules/opencode-plugin/test/opencode-plugin.test.ts vitest.workspace.ts
git commit -m "test: verify opencode plugin package artifacts"
```
