# Source Summary: OpenCode 插件模块

返回 [wiki 首页](../index.md)；相关综合页：[当前基线与模块地图](../topic/baseline-and-module-map.md)、[关键边界与非目标](../topic/boundaries-and-non-goals.md)

## Raw sources

- [`modules/opencode-plugin/package.json`](../../../modules/opencode-plugin/package.json)
- [`modules/opencode-plugin/README.md`](../../../modules/opencode-plugin/README.md)
- [`modules/opencode-plugin/skills/README.md`](../../../modules/opencode-plugin/skills/README.md)
- [`modules/opencode-plugin/agents/README.md`](../../../modules/opencode-plugin/agents/README.md)
- [`modules/opencode-plugin/src/index.ts`](../../../modules/opencode-plugin/src/index.ts)

## 来源事实

- 仓库内存在单独的 `@aim-ai/opencode-plugin` workspace 模块。[raw](../../../modules/opencode-plugin/package.json)
- 插件 README 将其定义为 v1 的 OpenCode-specific plugin skeleton，当前职责是把打包后的 `skills/` 目录注册到 OpenCode 配置中，并随包分发静态 `skills/` 与 `agents/` 资源。[raw](../../../modules/opencode-plugin/README.md)
- `skills/README.md` 说明它打包的是一组静态 AIM skill 文档，覆盖 ask-strategy、create-tasks、evaluate-readme、setup-github-repo、developer-guide、verify-task-spec、using-aim 等边界。[raw](../../../modules/opencode-plugin/skills/README.md)
- `agents/README.md` 明确写出：v1 插件不会自动注册或注入这些 agent 资源。[raw](../../../modules/opencode-plugin/agents/README.md)
- 源码 `src/index.ts` 的实际行为是把插件内置 `skills/` 路径追加到 OpenCode config 的 `skills.paths` 中。[raw](../../../modules/opencode-plugin/src/index.ts)

## 综合判断

- `@aim-ai/opencode-plugin` 证明当前仓库不只谈“与 OpenCode 集成”的愿景，而是已经落地了一个**偏静态资源分发与配置注入**的插件模块。
- 同时应避免高估：现有插件边界更接近“把 AIM skills 打包给 OpenCode 使用”，而不是完整自动化工作流代理。

## 待验证项

- 插件 README 只直接确认了 skills 路径注册；agents 资源当前是否会在未来版本接入自动注册，需要后续版本文档或代码再确认。
