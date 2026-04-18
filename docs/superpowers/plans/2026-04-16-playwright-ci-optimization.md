# Playwright CI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Playwright 浏览器缓存策略移动到 GitHub Actions workflow 层，通过 `PLAYWRIGHT_BROWSERS_PATH` + `actions/cache` 减少重复下载，同时保留 `chromium + firefox` 覆盖与 `pnpm test:e2e` 入口不变。

**Architecture:** 保留 `.github/actions/setup-node-pnpm` 作为通用 Node.js/pnpm/workspace 安装入口，把 Playwright 相关 cache 与条件安装逻辑收敛到 `.github/workflows/ci.yml` 的 `playwright` job。每次 job 仍执行 `playwright install-deps chromium firefox` 以满足 Ubuntu runner 系统依赖，浏览器二进制只在 cache miss 时通过 `playwright install chromium firefox` 下载。

**Tech Stack:** GitHub Actions、actions/cache、pnpm、Playwright。

---

## 文件结构与职责映射

- Modify: `.github/workflows/ci.yml` - 为 `playwright` job 增加浏览器缓存路径、cache restore、系统依赖安装与 cache-miss 浏览器安装步骤。
- Modify: `.github/actions/setup-node-pnpm/action.yml` - 移除 Playwright 专用输入与安装逻辑，保留通用 setup 职责。
- Create: `docs/superpowers/specs/2026-04-16-playwright-ci-optimization-design.md` - 记录本次设计约束与方案。
- Create: `docs/superpowers/plans/2026-04-16-playwright-ci-optimization.md` - 记录实现计划与验证命令。

## 实施约束

- 不修改 `pnpm test:e2e`。
- 不减少 `chromium + firefox` 覆盖。
- 不新增新的复合 action 或脚本文件。
- 浏览器下载只能在 cache miss 时执行；系统依赖安装可以每次执行。
- cache key 需至少绑定 `runner.os` 与 `pnpm-lock.yaml` 哈希。

### Task 1: 收敛 setup action 职责并在 workflow 中增加 Playwright 缓存

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/actions/setup-node-pnpm/action.yml`

- [ ] Step 1: 更新 `.github/actions/setup-node-pnpm/action.yml`，删除 `install-playwright` 输入与 Playwright 安装步骤，只保留 pnpm、Node.js 与 workspace 依赖安装。

```yaml
name: Setup Node.js and pnpm workspace
description: Install pnpm, Node.js, and workspace dependencies.

runs:
  using: composite
  steps:
    - name: Setup pnpm
      uses: pnpm/action-setup@v4
      with:
        version: 10.15.0

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: pnpm

    - name: Install workspace dependencies
      shell: bash
      run: pnpm install --frozen-lockfile
```

- [ ] Step 2: 更新 `.github/workflows/ci.yml` 的 `playwright` job，在 job 级设置 `PLAYWRIGHT_BROWSERS_PATH`，并去掉 setup action 的 `install-playwright` 传参。

```yaml
  playwright:
    name: Playwright
    runs-on: ubuntu-latest
    env:
      PLAYWRIGHT_BROWSERS_PATH: ${{ github.workspace }}/.cache/ms-playwright
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup workspace
        uses: ./.github/actions/setup-node-pnpm
```

- [ ] Step 3: 在 `playwright` job 中增加浏览器 cache restore、系统依赖安装与 cache-miss 浏览器安装步骤，保持浏览器范围为 `chromium firefox`。

```yaml
      - name: Restore Playwright browser cache
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ${{ env.PLAYWRIGHT_BROWSERS_PATH }}
          key: ${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Install Playwright system dependencies
        run: pnpm exec playwright install-deps chromium firefox

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: pnpm exec playwright install chromium firefox

      - name: Run Playwright suite
        run: pnpm test:e2e
```

- [ ] Step 4: 自检 workflow 顺序，确认 cache 在浏览器安装前恢复，`install-deps` 在每次 job 运行，`pnpm test:e2e` 保持末尾执行。

Run: `git diff -- .github/workflows/ci.yml .github/actions/setup-node-pnpm/action.yml`
Expected: diff 只显示 workflow 层新增缓存/依赖步骤，以及 setup action 移除 Playwright 专用逻辑；不存在额外 job 结构漂移。

### Task 2: 写入设计/计划文档并做轻量验证

**Files:**
- Create: `docs/superpowers/specs/2026-04-16-playwright-ci-optimization-design.md`
- Create: `docs/superpowers/plans/2026-04-16-playwright-ci-optimization.md`

- [ ] Step 1: 写入中文 spec，明确 workflow 层缓存、`PLAYWRIGHT_BROWSERS_PATH`、cache-miss 浏览器安装与每次执行 `install-deps` 的约束。

```md
## 方案设计

### 3. 区分“系统依赖安装”和“浏览器下载”

- 每次 job 都执行 `pnpm exec playwright install-deps chromium firefox`。
- 仅在 cache miss 时执行 `pnpm exec playwright install chromium firefox`。
```

- [ ] Step 2: 写入 implementation plan，列出精确文件、变更片段与验证命令，不留占位符。

```md
## 实施约束

- 不修改 `pnpm test:e2e`。
- 不减少 `chromium + firefox` 覆盖。
- 浏览器下载只能在 cache miss 时执行；系统依赖安装可以每次执行。
```

- [ ] Step 3: 对变更后的 YAML 做轻量语法校验。

Run: `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml'); YAML.load_file('.github/actions/setup-node-pnpm/action.yml')"`
Expected: 命令成功退出，无 YAML 语法错误。

- [ ] Step 4: 运行格式/补丁级检查，确认本次改动没有明显格式问题。

Run: `git diff --check`
Expected: 成功退出，无 trailing whitespace、冲突标记或补丁格式错误。

## 全量验证命令与预期结果

- `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml'); YAML.load_file('.github/actions/setup-node-pnpm/action.yml')"` -> 两个 YAML 文件都能被成功解析。
- `git diff -- .github/workflows/ci.yml .github/actions/setup-node-pnpm/action.yml` -> 只包含预期的 workflow/cache/setup action 精简改动。
- `git diff --check` -> 无补丁级格式错误。

## 推荐提交

1. `chore: cache Playwright browsers in CI`

## 自检结果

- [x] 已覆盖 spec 要求的 workflow 层 cache、`PLAYWRIGHT_BROWSERS_PATH` 与 cache-miss 浏览器安装策略。
- [x] 已覆盖“每次安装系统依赖、仅在 miss 时下载浏览器”的关键约束。
- [x] 已保持 `chromium + firefox` 覆盖与 `pnpm test:e2e` 入口不变。
- [x] 已避免占位符、额外脚本与超出 scope 的 CI 重构。
