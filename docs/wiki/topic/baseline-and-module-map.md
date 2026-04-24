# 主题：当前基线与模块地图

返回 [wiki 首页](../index.md)；相关页：[这个仓库是干啥的](./what-this-repo-is-for.md)、[关键边界与非目标](./boundaries-and-non-goals.md)

## 当前已实现基线（稳定可说）

- **协议中心**：`@aim-ai/contract` 维护 OpenAPI、Zod schema、共享类型与 client；`openapi.yaml` 是单一事实源。[来源摘要](../source-summary/architecture.md)
- **API 服务**：`@aim-ai/api` 暴露 HTTP API，当前至少覆盖 health、tasks、task spec、resolve/reject 与 `/openapi.json` 导出入口，并带有 task scheduler / repository / session coordinator 等服务端骨架。[来源摘要](../source-summary/scheduler.md) [来源摘要](../source-summary/architecture.md)
- **Web 界面**：`@aim-ai/web` 当前入口直接渲染 task dashboard 页面，说明仓库已有最小负责人视角界面落点。[来源摘要](../source-summary/architecture.md)
- **CLI**：`@aim-ai/cli` 当前存在 `aim health` 与 `task create/list/get/update/delete` 命令入口。[来源摘要](../source-summary/architecture.md)
- **OpenCode 插件**：`@aim-ai/opencode-plugin` 会把打包的 AIM skills 注册到 OpenCode 的 `skills.paths`，并分发静态 skills/agents 资源。[来源摘要](../source-summary/opencode-plugin.md)

## 模块地图

```text
README / docs
  ├─ 定义 AIM 目标形态、当前入口、调度语义与架构边界
  └─ 说明验证方式与非目标

modules/contract
  └─ 协议事实源（OpenAPI / Zod / types / client）

modules/api
  ├─ HTTP API
  ├─ tasks 持久化（SQLite）
  ├─ task scheduler
  └─ session coordinator / OpenCode 接入骨架

modules/web
  └─ task dashboard 入口

modules/cli
  └─ aim health + task 子命令入口

modules/opencode-plugin
  └─ 打包 AIM skills 给 OpenCode 使用
```

## 综合判断

- 当前仓库已经能支撑一个“围绕任务闭环推进基线”的最小系统骨架：协议、服务、界面、CLI、OpenCode 插件各有落点。
- 其中最核心的系统语义不是某个单独页面或接口，而是 **Task / Session / worktree / PR** 的统一推进模型；这也是理解仓库时最该优先抓住的主线。[来源摘要](../source-summary/scheduler.md)

## 边界提醒

- “有模块”不等于“所有能力都已完整做完”；这里记录的是**已存在的模块入口与角色分工**，不是全量功能成熟度评估。
- 验证文档给出的命令链说明这些模块已经进入统一验证范围，但文档变更本身仍需人工检查相对链接与描述是否贴合当前现实。[来源摘要](../source-summary/architecture.md)

## 延伸阅读

- [关键边界与非目标](./boundaries-and-non-goals.md)
- [待确认事项](../maintenance/open-questions.md)
