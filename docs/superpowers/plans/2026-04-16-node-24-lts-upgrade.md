# Node.js 24 LTS Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把仓库自维护的默认 Node.js 基线统一到 24 LTS，完成最小必要文档同步，并在 Node 24 环境下验证主路径命令，仅修复 Node 24 直接暴露的问题。

**Architecture:** 以“声明先统一、验证后修复”为主线：先收敛根 `package.json`、复用的 GitHub composite action 与开发文档中的 Node 基线口径，再在 Node 24 环境执行仓库既有验证命令。兼容性修复不预先展开，只允许围绕真实失败点做最小补丁，避免把本任务扩大成工具链重构。

**Tech Stack:** Node.js 24 LTS、pnpm 10、GitHub Actions、TypeScript、Vitest、Playwright、Biome。

---

## 文件结构与职责映射

- Modify: `package.json` - 把根级 `engines.node` 从 `>=22.0.0` 提升到 `>=24.0.0`，作为仓库默认 Node 基线声明。
- Modify: `.github/actions/setup-node-pnpm/action.yml` - 把复用 setup action 的 `node-version` 从 `22` 调整到 `24`，让主要 CI 路径默认在 Node 24 上运行。
- Modify: `README.md` - 在“快速开始”附近补充明确的 Node 24 LTS 开发前提，避免新读者按旧基线准备环境。
- Modify: `docs/architecture/validation.md` - 在验证说明顶部补充“以下命令默认在 Node 24 LTS 下执行”的前提，并保持命令入口不变。
- Do not create by default: `.nvmrc`, `.node-version` - 当前仓库内未发现此类文件；除非实施时发现明确仓库惯例或文档已要求本地版本文件，否则不新增本地版本声明文件。

## 实施约束

- 只统一仓库自维护的 Node 基线声明；不要手工编辑 lockfile 内第三方 `engines` 元数据。
- CI 变更只允许围绕 Node 版本对齐；不要重构 `.github/workflows/ci.yml` 的 job 结构。
- 文档变更只服务于 Node 24 默认基线说明；不要顺带重写 README 结构。
- 兼容性修复必须由 Node 24 下的真实失败触发；禁止预防性升级无关依赖。
- 当前检查结果显示仓库不存在 `.nvmrc` / `.node-version`；默认方案是保持缺省状态，不为“数字统一”额外新增版本文件。

### Task 1: 收敛仓库显式 Node 基线声明

**Files:**
- Modify: `package.json`
- Modify: `.github/actions/setup-node-pnpm/action.yml`

- [ ] Step 1: 先确认仓库内不存在额外写死的 Node 版本入口，避免漏改或误改 CI 结构。

Run: `rg -n "node-version:\s*22|>=22\.0\.0|\.nvmrc|\.node-version" .github package.json README.md docs`
Expected: 至少命中 `package.json` 与 `.github/actions/setup-node-pnpm/action.yml`；如果命中 `.nvmrc` / `.node-version`，把它们加入本任务同一批修改；如果只命中现有 spec/plan 文档，不把历史任务文档当作实现目标。

- [ ] Step 2: 更新根 `package.json` 的 `engines.node`，把仓库默认最低 Node 版本提升到 24。

```json
{
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=10.15.0"
  }
}
```

- [ ] Step 3: 更新复用的 setup action，使所有引用该 action 的 workflow 默认安装 Node 24。

```yaml
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: 24
        cache: pnpm
```

- [ ] Step 4: 做一次补丁级自检，确认只修改版本数字，没有引入无关 CI/脚本结构漂移。

Run: `git diff -- package.json .github/actions/setup-node-pnpm/action.yml`
Expected: diff 只包含 `>=24.0.0` 与 `node-version: 24` 两处基线调整；不存在额外脚本、依赖或 workflow 编排变化。

### Task 2: 同步 README 与验证文档中的默认开发基线

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/validation.md`

- [ ] Step 1: 在 `README.md` 的“快速开始”前补一条明确的环境前提，声明默认开发环境为 Node.js 24 LTS + pnpm 10.15.0+。

```md
## 开发环境要求

- Node.js 24 LTS（默认仓库基线）
- pnpm 10.15.0+

建议先确认 `node --version` 输出为 `v24.x`，再执行下方安装与验证命令。
```

- [ ] Step 2: 保持 README 的现有命令顺序不变，仅把 Node 基线前提与“快速开始”串起来，避免读者继续把安装步骤理解为 Node 22 环境。

```md
## 快速开始

1. 确认本地 Node.js 版本为 24 LTS：`node --version`
2. 安装依赖：`pnpm install`
   - 如果使用 `pnpm install --ignore-scripts`（或 `pnpm bootstrap`），安装后需在仓库根目录额外执行一次 `pnpm exec husky`，以启用 `.husky/pre-commit`。
3. 运行仓库 lint：`pnpm lint`
4. 运行类型检查：`pnpm typecheck`
5. 运行全部测试：`pnpm test`
6. 运行构建与 smoke：`pnpm build && pnpm smoke`
```

- [ ] Step 3: 在 `docs/architecture/validation.md` 顶部新增 Node 24 前提说明，明确本文命令默认在 Node 24 LTS 下执行，不新增新的验证入口。

```md
## 环境前提

- Node.js 24 LTS
- pnpm 10.15.0+

下文所有验证命令默认在仓库根目录、Node.js 24 LTS 环境下执行。
```

- [ ] Step 4: 搜索并复核 README 与 `docs/`，确认没有遗漏把 Node 22 写成默认基线的文案；若搜到额外显式基线描述，仅修改该文件中的对应句子，不扩展到无关文档改写。

Run: `rg -n "Node(?:\.js)?\s*22|22 LTS|>=22\.0\.0|node-version:\s*22|Node(?:\.js)?\s*24|24 LTS" README.md docs`
Expected: 不再出现面向当前仓库现实的 Node 22 默认基线表述；Node 24 命中仅出现在新补充的前提说明、已批准 spec/plan 文档或其他明确历史记录中。

### Task 3: 在 Node 24 环境执行主验证入口并仅处理真实兼容性问题

**Files:**
- Modify only if failures prove necessary: `package.json`, workspace source/config files named by the first failing stack trace or command output
- Do not modify by default: unrelated dependencies, lockfile-only engine metadata, CI structure files outside the first failing path

- [ ] Step 1: 先确认当前 shell 确实运行在 Node 24，再开始仓库验证，避免把环境偏差误判成升级问题。

Run: `node --version && pnpm --version`
Expected: `node --version` 输出 `v24.x`；`pnpm --version` 输出与仓库声明兼容的 `10.15.0` 或更高版本。

- [ ] Step 2: 按仓库既有主路径顺序运行验证命令，不要自行替换为新的聚合脚本。

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm smoke`
Expected: 五个命令全部返回 0；若全部通过，本任务不再做任何兼容性代码修改。

- [ ] Step 3: 如果上一步失败，先记录“第一个失败命令 + 第一条关键报错 + 首个业务相关堆栈文件”，然后只重跑五条主验证命令里最先失败的那一条做根因确认；可选命令仅限 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke` 之一。

Run: `pnpm lint` 或 `pnpm typecheck` 或 `pnpm test` 或 `pnpm build` 或 `pnpm smoke`（只执行上一步最先失败的那一条）
Expected: 失败可稳定复现，且能够把问题定位到 Node 24 直接触发的具体文件或配置，而不是笼统归因到“工具链升级”。

- [ ] Step 4: 仅当失败可直接归因于 Node 24 行为差异时，修改首个失败点对应文件并保持补丁最小化；不要预防性批量升级依赖或跨模块重构。

Allowed patch shapes:

```ts
// 仅示意补丁尺度：围绕首个失败点做局部兼容修复
if (runtimeNeedsNode24SafePath) {
  return newBehavior
}

return existingBehavior
```

```json
{
  "scripts": {
    "some-existing-script": "node --experimental-flag-that-node24-now-requires ..."
  }
}
```

Expected: 改动范围被限制在触发失败的直接文件；如果需要跨多个无关模块联动、批量升级依赖或重构脚本，立即停止并升级决策，而不是继续扩 scope。

- [ ] Step 5: 每完成一次最小兼容修复，只重跑刚才失败的那一条主验证命令；全部子项恢复后，再回到全量主路径验证一次。

Run: `pnpm lint` 或 `pnpm typecheck` 或 `pnpm test` 或 `pnpm build` 或 `pnpm smoke`（只执行刚才失败并已修复的那一条）
Expected: 该命令恢复通过，且没有引入新的同类错误。

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm smoke`
Expected: 全链路通过；如果仍有超出当前 spec 的阻塞，把失败命令、日志摘要、受影响文件与“为什么超 scope”写入交付说明，不继续扩展修复。

### Task 4: 完成文档与补丁自检后提交本次升级

**Files:**
- Modify: all files changed by Task 1-3

- [ ] Step 1: 做一次文档与补丁级自检，确认命令名、Node 版本数字、相对路径与 YAML/JSON 语法全部一致。

Run: `git diff --check`
Expected: 无 trailing whitespace、冲突标记或补丁格式错误。

- [ ] Step 2: 若本次只涉及声明和文档变更，确认变更集合应限于 `package.json`、`.github/actions/setup-node-pnpm/action.yml`、`README.md`、`docs/architecture/validation.md`，以及因 Node 24 真实失败而新增的最小兼容补丁文件。

Run: `git status --short`
Expected: 只看到本计划允许的文件；若出现 scope 外文件，先回退或升级决策。

- [ ] Step 3: 提交前再次检查历史提交风格，并使用简洁的 conventional-style message。

Run: `git log --oneline -5`
Expected: 最近提交继续体现 `docs: ...`、`chore: ...`、`feat: ...` 等前缀风格。

- [ ] Step 4: 提交本次 Node 24 升级实现。先暂存四个固定入口文件；如果 `git status --short` 还显示 Node 24 兼容性修复文件，再按输出中的真实路径逐个 `git add`，最后提交，禁止使用 `git add .` 扩大暂存范围。

Run: `git add package.json .github/actions/setup-node-pnpm/action.yml README.md docs/architecture/validation.md && git commit -m "chore: upgrade repo baseline to Node.js 24 LTS"`
Expected: 若没有兼容性修复文件，上述命令直接生成单个提交；若存在兼容性修复文件，需先按真实路径补充 `git add` 后再执行同一条 `git commit -m "chore: upgrade repo baseline to Node.js 24 LTS"`，并保持提交消息与仓库既有 conventional 风格一致。

## 全量验证命令与预期结果

- `rg -n "node-version:\s*22|>=22\.0\.0|\.nvmrc|\.node-version" .github package.json README.md docs` -> 找出仓库自维护的 Node 基线入口，并确认本地版本文件当前缺失。
- `git diff -- package.json .github/actions/setup-node-pnpm/action.yml` -> 只显示 Node 基线数字更新，不包含无关 CI 结构改动。
- `rg -n "Node(?:\.js)?\s*22|22 LTS|>=22\.0\.0|node-version:\s*22|Node(?:\.js)?\s*24|24 LTS" README.md docs` -> README 与开发文档中的默认基线文案已对齐到 Node 24。
- `node --version && pnpm --version` -> 当前执行环境与仓库基线一致。
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm smoke` -> Node 24 环境下主验证链路通过，或暴露出已记录的超 scope 阻塞。
- `git diff --check` -> 无补丁级格式错误。

## 推荐提交

1. `chore: upgrade repo baseline to Node.js 24 LTS`

## 自检结果

- [x] 已覆盖 spec 中的根 `package.json`、复用 setup action、README/开发文档与 Node 24 全量验证要求。
- [x] 已明确当前仓库不存在 `.nvmrc` / `.node-version`，并把“默认不新增本地版本文件”写成受控决策。
- [x] 已把兼容性修复限制为 Node 24 真实失败触发，不包含预防性依赖升级或 CI 重构。
- [x] 已检查计划内无 `TODO`、`TBD`、`implement later` 等占位语。
- [x] 已统一使用 `Node.js 24 LTS`、`>=24.0.0`、`node-version: 24` 这些名称与数字口径。
