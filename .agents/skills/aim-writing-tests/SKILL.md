---
name: aim-writing-tests
description: 当 AIM Agent 需要新增、修改、迁移或评审测试时使用，确保测试保护行为语义而不是当前实现形状。
---

# aim-writing-tests

## 概述

这个 skill 用于约束 AIM Agent 如何写测试、修测试、迁移旧测试。

核心原则：**测试应保护产品、API、CLI、UI、契约与持久化语义，而不是保护当前实现形状。**

测试的价值来自它能稳定描述外部可观察行为，并在行为被破坏时失败。不要把测试写成对源码、私有协作、提示词措辞或 mock 编排细节的快照。

## 何时使用

- 新增功能、修复缺陷或调整行为，需要先写或更新测试时。
- 执行 `aim-test-driven-development`，准备写 RED 测试前。
- 现有测试因为正常 scope 内改动而失败，需要判断是迁移、保留还是修正时。
- 评审测试是否过度绑定实现细节时。
- 测试依赖 `dist`、生成产物、包内容或发布产物，需要判断是否是合法 artifact guard 时。

## 核心规则

- 优先写面向接口和行为的测试，而不是面向实现的测试。
- 测试应验证产品 / API / CLI / UI / contract / persistence 语义，不验证当前实现形状。
- 禁止读取源码文件并断言 `toContain` 某段实现片段，除非这是明确的仓库策略、架构边界或生成产物 guard 测试。
- 禁止过细断言内部行为，例如私有 helper 调用顺序、内部 import 路径、精确 prompt 文案、过量 mock 调用细节。
- mock 外部边界，不 mock 内部协作。可接受边界包括网络、SDK、文件系统、时间、子进程、数据库边界层。
- 测试不得暗中执行 build、generate、install、format、lint 或其他重型准备流程。
- TDD RED 测试不得通过隐藏重型准备创建环境；前置状态必须由被调用的验证命令显式提供。

## 合格测试关注什么

优先保护这些语义：

- 对外 API 的输入输出、错误、边界条件和兼容承诺。
- CLI 参数、退出码、stdout / stderr 的稳定 contract。
- UI 中用户可观察的状态、交互结果和可访问语义。
- 持久化格式、迁移结果、数据保留与回放语义。
- 包内容、发布产物或生成产物是否满足明确约定。
- 仓库级政策和架构边界是否被违反。

不要优先保护这些形状：

- 私有函数是否被调用。
- 内部 helper 的调用顺序。
- 当前模块拆分、内部 import 路径或文件布局。
- prompt 的完整逐字文本，除非它本身是对外 contract。
- mock 的每一次中间调用细节，除非该调用就是外部 contract。

## 源码文本断言

默认禁止这类测试：

```ts
const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')

expect(source).toContain('someInternalHelper(')
```

它通常只证明当前实现还长得一样，不能证明用户行为仍正确。

仅在下面场景可以使用源码或文本内容断言：

- 明确的 repo policy guard，例如禁止引入某个 runtime hook、危险 API 或越界路径。
- 明确的 architecture guard，例如某层不得 import 另一层。
- 明确的 generated artifact guard，例如发布包、生成文件、schema 或静态 skill 文档必须包含某个 contract。

即使属于例外，也要让测试名说明 guard 目的，并把断言收敛到稳定规则，不要顺手检查实现碎片。

## Mock 边界

mock 应放在系统外部边界：

- 网络请求和远端服务。
- 第三方 SDK。
- 文件系统。
- 时间、随机数、时区。
- 子进程。
- 数据库或持久化边界层。

不要默认 mock 当前模块内部协作。若一个测试必须 mock 大量内部函数才能成立，先怀疑测试目标或代码边界不清，而不是继续堆 mock。

## 遗留测试退出机制

当正常 scope 内工作导致旧测试失败时，不要先机械修补脆弱断言。

按下面顺序处理：

1. 判断失败是否暴露真实行为回归。
2. 如果是行为回归，修实现或修目标行为，不要削弱测试。
3. 如果测试绑定了实现细节，标记为 old-style implementation-coupled test。
4. 如果迁移在当前 scope 内可行，把它改成行为 / contract / artifact guard 风格。
5. 如果它其实是合法 policy / architecture / generated artifact guard，保留或重命名，让 guard 目的明确。
6. 如果迁移超出当前 scope，最小化处理并在交付说明中显式记录遗留风险。

迁移旧测试时，优先保留它原本想保护的用户价值或 contract，而不是逐字搬运旧断言。

## 重型准备流程

测试内部禁止隐式执行这些准备：

- `ensure build dist`
- 隐式 generate
- 隐式 install
- 隐式 format / lint / build
- 其他隐藏、慢速、跨边界的环境搭建

测试不能偷偷构建产物来让自己通过。若测试依赖 `dist` 或生成产物，它必须是显式 artifact / package / release 风格测试，并满足至少一项：

- 验证命令本身先运行了清楚的 prerequisite command。
- 测试失败信息快速说明缺少什么前置命令。

TDD RED 测试也必须遵守这条规则。RED 的环境不能由测试内部隐藏重型准备制造；前置状态必须由被调用的验证命令提供。

## 合格 / 不合格示例

合格：验证 CLI contract。

```ts
test('prints a useful error and exits non-zero for unknown command', async () => {
  const result = await runCli(['unknown'])

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain('Unknown command')
})
```

不合格：验证内部实现形状。

```ts
test('unknown command uses parseCommand helper', async () => {
  expect(parseCommand).toHaveBeenCalledBefore(renderError)
})
```

合格：mock 外部 SDK 边界。

```ts
test('reports API timeout as retryable failure', async () => {
  fakeSdk.fetchUser.mockRejectedValueOnce(new TimeoutError())

  await expect(loadUser('u1')).rejects.toMatchObject({ retryable: true })
})
```

不合格：mock 内部协作并检查过量调用细节。

```ts
test('loadUser calls normalize then map then decorate', async () => {
  expect(normalize).toHaveBeenCalledWith(rawUser)
  expect(mapUser).toHaveBeenCalledWith(normalizedUser)
  expect(decorateUser).toHaveBeenCalledWith(mappedUser)
})
```

## 自检清单

- [ ] 测试名描述了可观察行为或明确 guard 目的。
- [ ] 断言保护语义，不保护当前实现形状。
- [ ] 没有无理由读取源码并断言实现片段。
- [ ] 没有过细检查私有 helper、内部 import、精确 prompt prose 或 mock 调用细节。
- [ ] mock 位于外部边界，而不是内部协作。
- [ ] 测试没有隐藏 build / generate / install / format / lint 流程。
- [ ] 依赖 `dist` 或生成产物的测试已明确是 artifact / package / release 风格。
- [ ] 旧测试失败时，已先分类再决定迁移、保留或记录风险。

有任一项无法勾选，就不要声称这是稳定、可维护的测试保护。
