---
name: aim-verify-task-spec
description: Use when validating whether an AIM Task Spec is still actionable against the latest baseline and the agent must distinguish waiting assumptions from true spec failure.
---

# aim-verify-task-spec

## 概述

这个 skill 用于判断一份 AIM Task Spec 在最新基线上是否还能继续推进。

核心原则只有两步：先看 Task Spec 的五段结构是否完整且充分，再看最新基线是否满足 `Assumptions`。结论只能收敛为 `pass`、`waiting_assumptions`、`failed`。

## 何时使用

- 需要判断某个 Task 在最新基线上能否继续推进时。
- 需要区分“现在还不满足前提，先等待”与“Spec 已失效 / 有重大歧义，应失败上报”时。
- 需要复查一份旧 Task Spec 是否仍然适用，但不能依赖 `spec_commit` / `base_commit` 时。

## 不何时使用

- 不负责生成或改写 Task Spec。
- 不负责写 implementation plan。
- 不负责改代码、跑实现、跟进 PR。
- 不负责给 Task 排序或替代调度器决定优先级。

## 输入

- 一份待验证的 Task Spec 原文。
- 最新基线的只读事实：当前文档、代码、配置、测试、接口、PR 合并后基线状态等。
- 若可得，当前任务已知上下文：为什么触发本次复查、最近哪些基线增量可能相关。

## 校验流程

1. 先做结构校验，只看 Spec 自身是否足够执行。
2. 只有结构校验通过后，才做基线验证。
3. 基线验证只问一个问题：最新基线是否满足 `Assumptions`。
4. 输出时只能使用 `pass`、`waiting_assumptions`、`failed` 三类结论。

## 第一步：结构校验

必须逐段检查以下五段是否都存在，且内容足以支撑后续执行。

### 1. Title

- 必须是一个明确的基线增量目标。
- 应能自然映射为一个 PR 标题。
- 只是主题词、方向词、泛泛愿景都不够。

### 2. Assumptions

- 必须写成可验证的当前事实，不是背景故事。
- 尽量能被只读检查确认。
- 应聚焦外部可观测事实，而不是容易漂移的实现猜测。

### 3. Goal vs Non-Goal

- 目标和非目标都要具体。
- 非目标必须能真实约束 scope，而不是礼貌性补一句“不做太多额外工作”。
- 如果缺少非目标、或非目标无法限制蔓延，结构仍不充分。

### 4. Core Path

- 必须解释从当前概念格局到目标概念变化的主路径。
- 应说明为什么选这条路径，以及备选路径为什么不选。
- 只列文件改动、函数改动、机械步骤，不算合格的 Core Path。

### 5. Value Alignment

- 必须给出冲突场景下的价值排序。
- 只写抽象口号，不足以给执行层自由裁量依据。
- 如果真实分歧出现时无法据此裁决，结构仍不充分。

### 结构判定

- 五段有缺失，或任一段只有标题没有可执行内容：`failed`。
- 五段都在，但 Goal/Non-Goal、Core Path、Value Alignment 无法约束执行：`failed`。
- 只有在五段都完整且充分时，才能进入基线验证。

## 第二步：基线验证

只在结构通过后执行。

1. 提取 `Assumptions` 中每一条可验证事实。
2. 用最新基线做只读核对。
3. 对每条不成立的 assumption，继续判断它属于哪一类：

- 暂时不成立，但随着后续基线推进仍可能自然成立。
- 已暴露出 Spec 重大歧义、方向冲突，或 assumption 本身已经不再描述当前问题。

## 判定矩阵

| 条件 | 结论 | 含义 | 下一步 |
| --- | --- | --- | --- |
| 五段结构完整且充分，`Assumptions` 当前成立 | `pass` | Spec 可继续推进 | 进入后续执行流程 |
| 结构完整且充分，但部分 `Assumptions` 当前不成立，且仍可能被后续基线推进自然满足 | `waiting_assumptions` | 先等待，不是失败 | 记录当前卡住的 assumption，并允许后续重验 |
| 五段结构不完整或不充分 | `failed` | Spec 自身不可执行 | 失败上报给上层重新规划或重写 Spec |
| `Assumptions` 不成立，且已表明 Spec 与当前基线方向冲突、前提失效、或存在重大歧义 | `failed` | 不是等一等就会恢复 | 失败上报给上层重新规划 |

## waiting_assumptions 与 failed 的分界

判成 `waiting_assumptions`，通常意味着：

- Spec 的推理链路仍然成立，只是依赖的基线事实尚未出现。
- 可以清楚说出“还差哪个事实成立”。
- 一旦该事实由其他 Task 推进出来，这个 Spec 仍然有意义。

判成 `failed`，通常意味着：

- 当前 Spec 缺少关键约束，执行层无法稳定判断怎么做。
- Assumption 描述的现状已经不是当前问题，继续等待也不会自然恢复。
- 最新基线已经沿着别的方向收敛，原 Spec 的目标或路径失去意义。
- 出现重大歧义，且无法从 Value Alignment 中得到稳定裁决。

## 明确禁止

- 不得用 `spec_commit` 判定 Spec 是否过期。
- 不得用 `base_commit` 判定 Spec 是否过期。
- 不得因为“assumption 现在不成立”就直接判 `failed`。
- 不得因为五段标题齐全，就跳过“是否充分”的判断。
- 不得把本 skill 扩展成写 Spec、写 implementation plan、改代码、PR 跟进或调度排序。

## 常见误判与红旗

| 误判 | 正确处理 |
| --- | --- |
| `Assumptions` 还没成立，所以 Spec 失败了 | 先问“后续基线推进后是否可能自然成立”；若可能，应为 `waiting_assumptions` |
| Spec 有五个标题，所以结构没问题 | 还要检查每段是否足以约束执行；空洞内容仍是 `failed` |
| 旧 Spec 对应的 commit 已落后，所以 Spec 过期 | commit 不是判据；只看最新基线下 assumptions 是否成立、Spec 是否仍清晰有效 |
| Core Path 写了几个文件和步骤，已经够了 | Core Path 必须交代概念变化、主路径和备选路径取舍 |
| Value Alignment 写“尽量简单”就够了 | 需要冲突场景下的价值排序，否则无法支撑无人值守裁决 |

出现以下红旗时，应优先考虑 `failed` 而不是硬做：

- 无法把缺失点定位到具体哪条 assumption。
- 需要人工澄清才能知道 Goal 与 Non-Goal 的边界。
- Core Path 只有文件清单，没有概念推理链路。
- Value Alignment 无法解决真实冲突。

## 快速参考

- 先结构，后基线；顺序不要反。
- 结构不够：直接 `failed`。
- 结构够了但 assumptions 暂未满足：优先判断 `waiting_assumptions`。
- 只有在“等下去也不会自然恢复”时，才把 assumption 问题判成 `failed`。
- 过期判断只看最新基线与 assumptions，不看 commit。

## 简短示例

### 示例 1：等待，不是失败

- Spec 假设“`tasks` 已有 `dependencies` 字段，执行层可重写它”。
- 最新基线里该字段还不存在，但上游 Task 正在推进该数据模型改动。
- 五段结构本身完整，Core Path 与 Value Alignment 都清楚。

结论：`waiting_assumptions`。

### 示例 2：真正失败

- Spec 说“基于 `spec_commit` 判断是否过期，再决定是否继续执行”。
- 这与当前 Task 模型文档明确冲突，且核心判断机制本身错误。

结论：`failed`。

### 示例 3：形式完整但内容空洞

- 五段标题都在。
- 但 Core Path 只有“修改 A 文件、补 B 测试”，Value Alignment 只有“优先保持简单”。

结论：`failed`。
