---
"@aim-ai/api": patch
"@aim-ai/contract": patch
"@aim-ai/opencode-plugin": patch
---

收敛包级 `test` 与 `build` 的职责边界，让默认测试不再隐式执行本包产物构建，并将依赖已构建产物的校验前置到对应测试准备阶段。
