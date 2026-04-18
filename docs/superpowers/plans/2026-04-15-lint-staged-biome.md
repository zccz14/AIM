# Lint-Staged + Husky + Biome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库根目录接入 Husky `pre-commit` + `lint-staged` + Biome，只处理暂存文件，并补充 `pnpm install --ignore-scripts` 路径下的最小说明。

**Architecture:** 继续复用根 `biome.json` 作为唯一格式化与检查配置，把 Git 钩子职责限制在触发根脚本，实际文件筛选与命令分发收敛到根 `package.json`。实现只触碰根工具链入口与一处简短文档，保持现有 `pnpm lint`、`pnpm validate`、`pnpm bootstrap` 语义不变。

**Tech Stack:** pnpm workspace、Husky、lint-staged、Biome、Git hooks。

---

## 文件结构与职责映射

- Modify: `package.json` - 增加 `husky`、`lint-staged` 开发依赖，补充 `prepare` / `precommit` 脚本，并把暂存文件的 Biome 执行规则收敛到根配置。
- Modify: `pnpm-lock.yaml` - 记录新增根级开发依赖解析结果。
- Create: `.husky/pre-commit` - 作为唯一提交前钩子入口，只调用根脚本 `pnpm precommit`。
- Modify: `README.md` - 补充 `pnpm install --ignore-scripts` 路径下需要手动启用 Husky 的最小说明。

## 实施约束

- 不修改 `biome.json`，继续复用现有仓库级 Biome 配置。
- 不调整 `pnpm lint`、`pnpm validate`、`pnpm release:check`、`pnpm bootstrap` 的职责边界。
- `lint-staged` 规则只覆盖 spec 指定的 `*.{js,cjs,mjs,ts,tsx,json,jsonc,md}`，避免扩大到其他文件类型。
- `.husky/pre-commit` 中不加入额外逻辑、条件分支或重型校验命令。

### Task 1: 配置根级 Husky、lint-staged 与 Biome 提交前入口

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `.husky/pre-commit`

- [ ] Step 1: 修改根 `package.json` 的 `devDependencies`、`scripts` 与 `lint-staged` 配置，只新增本次接入所需字段，并保持现有脚本不变。

```json
{
  "scripts": {
    "bootstrap": "pnpm install --ignore-scripts",
    "prepare": "husky",
    "precommit": "lint-staged",
    "lint": "pnpm exec biome check package.json pnpm-workspace.yaml tsconfig.base.json biome.json tsdown.config.ts .npmrc .gitignore"
  },
  "lint-staged": {
    "*.{js,cjs,mjs,ts,tsx,json,jsonc,md}": "pnpm exec biome check --write --no-errors-on-unmatched"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.12",
    "husky": "^9.1.7",
    "lint-staged": "^16.2.6"
  }
}
```

- [ ] Step 2: 新建 `.husky/pre-commit`，只保留 Husky shebang 与根脚本调用，不在 hook 中直接写 Biome 命令。

```sh
#!/usr/bin/env sh
pnpm precommit
```

- [ ] Step 3: 安装新依赖并生成锁文件变更。

Run: `pnpm install`
Expected: `package.json` 与 `pnpm-lock.yaml` 更新，`prepare` 脚本执行后生成可用的 `.husky/` 目录，安装过程不报 Husky / lint-staged 缺失错误。

- [ ] Step 4: 校验根 `lint` 命令语义未漂移，确认本次接入没有替换现有全量检查入口。

Run: `pnpm lint`
Expected: 仍只检查根配置文件并成功退出；不会因为 `lint-staged` 接入而转为扫描整个仓库。

- [ ] Step 5: 直接调用暂存文件入口，确认 `lint-staged` 配置能被解析且命令链保持单一。

Run: `pnpm precommit`
Expected: 在没有暂存文件时快速退出并输出 `lint-staged` 的无暂存文件提示；在存在暂存文件时只把匹配文件传给 `pnpm exec biome check --write --no-errors-on-unmatched`。

### Task 2: 补充 `--ignore-scripts` 路径下的最小说明

**Files:**
- Modify: `README.md`

- [ ] Step 1: 在 `README.md` 的“快速开始”或相邻安装说明位置补充一条简短说明，明确 `pnpm install --ignore-scripts` / `pnpm bootstrap` 不会自动启用 Husky，需要手动执行一次 `pnpm exec husky`。

```md
如果使用 `pnpm install --ignore-scripts`（或 `pnpm bootstrap`），安装后需在仓库根目录额外执行一次 `pnpm exec husky`，以启用 `.husky/pre-commit`。
```

- [ ] Step 2: 复查 README 中的命令示例，确保没有把本次接入扩展为类型检查、测试或其他重型提交前校验。

Run: `pnpm exec biome check README.md package.json .husky/pre-commit --write`
Expected: 文档与根配置格式化完成，README 只新增 Husky 启用说明，不引入额外工具或流程描述。

- [ ] Step 3: 按 spec 的验证边界做一次手工提交流程检查，确认说明与实现一致。

Run: `git add README.md package.json .husky/pre-commit pnpm-lock.yaml && pnpm precommit`
Expected: `lint-staged` 只处理已暂存的匹配文件；未暂存修改不会被纳入；若 Biome 可自动修复则变更被回写到暂存内容，若存在不可修复问题则命令返回非零并阻止继续提交。

## 全量验证命令与预期结果

- `pnpm install` -> 成功安装 `husky` 与 `lint-staged`，并允许 `prepare` 启用 `.husky/`。
- `pnpm lint` -> 继续通过现有根配置校验，不替代现有仓库级 lint 职责。
- `pnpm precommit` -> 无暂存文件时快速退出；有暂存文件时仅处理 `*.{js,cjs,mjs,ts,tsx,json,jsonc,md}`。
- `pnpm exec biome check README.md package.json .husky/pre-commit --write` -> 文档、JSON 与 hook 文件格式保持一致。

## 推荐提交切分

1. `chore: add husky and lint-staged pre-commit hook`
2. `docs: document husky setup for ignore-scripts installs`

## 自检结果

- [x] 已覆盖 spec 要求的根 `package.json` 最小配置、Husky `pre-commit` 钩子与 Biome-only 暂存文件处理链路。
- [x] 已覆盖 `pnpm install --ignore-scripts` / `pnpm bootstrap` 场景下的最小说明，且未扩展额外自动化。
- [x] 已保持 `pnpm lint`、`pnpm validate`、`pnpm release:check`、`pnpm bootstrap` 的职责不变。
- [x] 已避免占位符、模糊描述与超出 spec 的 CI / 测试 / 其他工具链改造范围。
