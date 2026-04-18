# Playwright CI 安装优化设计说明

## 背景/目标

当前 `Playwright` GitHub Actions job 通过仓库内复用的 `.github/actions/setup-node-pnpm` 复合 action 在每次执行时直接运行 `pnpm exec playwright install --with-deps chromium firefox`。这种方式虽然能稳定提供 `chromium + firefox` 覆盖，但每次 CI 都会重复下载浏览器二进制，导致安装阶段耗时偏高。

本次优化的目标是在不减少浏览器覆盖范围、不改动现有 `pnpm test:e2e` 执行入口、不重构 CI job 结构的前提下，把 Playwright 浏览器安装策略收敛到 workflow 层：使用 `PLAYWRIGHT_BROWSERS_PATH` 把浏览器安装到可缓存目录，通过 GitHub Actions cache 恢复该目录，并仅在 cache miss 时执行浏览器安装；同时继续保证 Linux runner 所需系统依赖可用。

## 范围

- 在 `.github/workflows/ci.yml` 的 `playwright` job 中增加 Playwright 浏览器缓存目录配置。
- 在 `playwright` job 中增加 GitHub Actions cache 恢复逻辑。
- 在 cache miss 时执行 Playwright 浏览器安装，并继续保持 `chromium + firefox` 安装范围。
- 保留现有 `.github/actions/setup-node-pnpm` 作为 Node.js + pnpm + workspace 依赖安装入口。
- 保留 E2E 命令 `pnpm test:e2e` 不变。

## 非目标

- 不调整 `quality` job 结构或其他 CI job。
- 不改动 Playwright 测试代码、测试命令或浏览器覆盖矩阵。
- 不引入第三方缓存服务或自定义下载脚本。
- 不把 Playwright 浏览器缓存逻辑扩散到复合 action 之外的其他公共 action。
- 不借本次任务重构整个 CI workflow 或 pnpm 安装策略。

## 方案设计

### 1. 浏览器缓存边界放在 workflow 层

Playwright 浏览器缓存策略应直接放在 `.github/workflows/ci.yml` 的 `playwright` job 中，而不是继续隐藏在 `.github/actions/setup-node-pnpm` 复合 action 内。原因如下：

- 浏览器缓存命中与否是 job 级运行策略，和具体 workflow 的执行环境强相关。
- cache key、cache path、命中后的条件分支本质上属于 workflow 编排职责，不适合耦合进通用的 Node.js / pnpm setup action。
- 把缓存逻辑显式放在 job 中后，后续若需要调整 key、路径或覆盖范围，只需修改 workflow，不会影响其他复用该 action 的场景。

因此，复合 action 仅保留 pnpm、Node.js 与 workspace 依赖安装职责；Playwright 浏览器相关逻辑迁移到 `playwright` job 自身维护。

### 2. 使用 `PLAYWRIGHT_BROWSERS_PATH` 指向可缓存目录

`playwright` job 应设置 `PLAYWRIGHT_BROWSERS_PATH`，把浏览器下载目录固定到仓库工作目录下的可缓存路径，例如 `${{ github.workspace }}/.cache/ms-playwright`。这样可以保证：

- Playwright CLI 在安装与运行时都使用同一目录。
- `actions/cache` 可以直接缓存该路径，不依赖 runner 用户目录的隐式行为。
- 路径语义清晰，便于在 workflow diff 中直接看出缓存边界。

缓存 key 以 runner OS 与 `pnpm-lock.yaml` 哈希为主，确保 Playwright 版本变化时浏览器缓存能够自动失效并重新安装。

### 3. 区分“系统依赖安装”和“浏览器下载”

如果单纯把当前的 `playwright install --with-deps chromium firefox` 改成“仅在 cache miss 时执行”，会带来一个风险：GitHub Actions 的 Ubuntu runner 每次都是全新环境，cache 只能恢复浏览器目录，不能恢复 apt 安装的系统依赖；若命中缓存却完全跳过安装步骤，浏览器运行所需的 Linux 系统包可能缺失。

因此，本次方案把两类动作拆开：

- 每次 job 都执行 `pnpm exec playwright install-deps chromium firefox`，确保系统依赖稳定存在。
- 仅在 cache miss 时执行 `pnpm exec playwright install chromium firefox`，避免重复下载浏览器二进制。

这样既保留现有运行前提，又达成主要性能优化目标。

### 4. 保持现有测试入口与覆盖范围

本次变更不调整 `pnpm test:e2e`，也不改变 `chromium + firefox` 浏览器覆盖范围。Playwright job 的后半段仍然保持：

1. 安装 workspace 依赖。
2. 准备 Playwright 系统依赖。
3. 视 cache 命中情况补装浏览器。
4. 执行 `pnpm test:e2e`。

这样可以把行为变化限定在安装耗时优化上，而不会引入测试入口或覆盖面语义漂移。

## 文件变更

预期只涉及以下最小集合：

- `.github/workflows/ci.yml`：为 `playwright` job 增加 `PLAYWRIGHT_BROWSERS_PATH`、cache、依赖安装与 cache-miss 浏览器安装逻辑。
- `.github/actions/setup-node-pnpm/action.yml`：移除 Playwright 专用输入与浏览器安装步骤，使其回归通用 setup action 职责。
- `docs/superpowers/specs/2026-04-16-playwright-ci-optimization-design.md`：记录本次设计。
- `docs/superpowers/plans/2026-04-16-playwright-ci-optimization.md`：记录实现计划。

除上述文件外，不应扩展到 Playwright 测试代码、包管理脚本、发布流程或其他 CI job。

## 风险与回退

主要风险如下：

- cache key 选择过窄，导致 Playwright 版本变化后仍错误复用旧浏览器目录。
- 仅缓存浏览器目录但忘记处理系统依赖，导致 cache hit 的 job 在 Ubuntu runner 上运行失败。
- 在复合 action 中保留半套 Playwright 逻辑，造成 workflow 与 action 的职责边界重新混乱。

对应控制策略：

- cache key 至少绑定 `runner.os` 与 `pnpm-lock.yaml` 哈希。
- 明确保留 `playwright install-deps chromium firefox` 的每次执行步骤。
- 让复合 action 完全退出 Playwright 浏览器安装职责，避免双入口。

若本次优化带来异常，可回退为当前直接在 setup action 中执行 `playwright install --with-deps chromium firefox` 的方式。

## 验证方案

本设计落地后，至少应完成以下最小验证：

1. 检查 `.github/workflows/ci.yml` diff，确认 `PLAYWRIGHT_BROWSERS_PATH`、cache restore、`install-deps` 与 cache-miss 浏览器安装的顺序正确。
2. 检查 `.github/actions/setup-node-pnpm/action.yml`，确认 Playwright 专用输入与安装步骤已移除，action 职责回到通用 setup。
3. 对修改后的 YAML 做轻量语法校验，确保文件结构合法。
4. 通过 `git diff --check` 或等价轻量检查，确认本次文档与 workflow 改动无格式性错误。

文档自检要求：最终 spec 不出现占位符，不把范围扩展到测试代码改造或浏览器矩阵变化，并明确“cache miss 才下载浏览器、每次仍安装系统依赖”这一核心约束。
