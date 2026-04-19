# 前端默认 SERVER_BASE_URL 调整为 localhost:8192 设计说明

## 背景 / 问题

当前前端把 `SERVER_BASE_URL` 的默认值集中定义在 `modules/web/src/lib/server-base-url.ts`，其缺省值仍为 `https://aim.zccz14.com`。这会让本地打开前端时，在 Local Storage 为空的场景下默认指向远端地址，而不是当前期望的本地 API 基线 `http://localhost:8192`。

现有测试也直接断言了这个远端默认值；如果只改运行时常量而不同步测试和当前有效文档/默认值说明，会让默认行为、验证基线与使用说明继续脱节。

## 目标

1. 采用最小改动，把前端默认 `SERVER_BASE_URL` 从 `https://aim.zccz14.com` 调整为 `http://localhost:8192`。
2. 继续以 `modules/web/src/lib/server-base-url.ts` 作为默认值与空值回退逻辑的单一事实源。
3. 同步更新与该默认值直接绑定的测试，以及仓库中当前有效的文档或默认值说明，避免新旧默认值并存。
4. 保持 Local Storage 覆盖能力不变；用户显式保存其他地址时，仍以保存值为准。

## 非目标

1. 不引入基于环境变量的前端配置机制。
2. 不扩展为更通用的运行时配置系统、环境切换面板或多来源优先级设计。
3. 不调整 `SERVER_BASE_URL` 的 Local Storage key、表单交互或请求层结构。
4. 不修改历史归档性质的文档，例如 `docs/superpowers/specs/*.md`、`docs/superpowers/plans/*.md` 中仅用于记录既往设计/计划的内容。

## 影响范围

本次实现应优先覆盖以下直接受影响文件：

1. `modules/web/src/lib/server-base-url.ts`
2. `modules/web/test/task-dashboard.spec.ts`
3. `modules/web/test/app.spec.ts`

如实现时发现仓库内仍有当前有效的前端使用说明、README 或其他 live 文档明确把前端默认 `SERVER_BASE_URL` 写成 `https://aim.zccz14.com`，可在同一原则下同步修正；若只是历史设计记录、实现计划或非默认值示例，不纳入本次范围。

## 方案约束

1. 采用最小修改路径，直接替换 `DEFAULT_SERVER_BASE_URL` 常量值，不新增中间层、兼容分支或新的帮助函数。
2. 默认值只能定义在 `modules/web/src/lib/server-base-url.ts`；请求侧、表单侧和测试不能再散落单独的默认地址常量。
3. `readServerBaseUrl()` 与 `saveServerBaseUrl()` 的现有回退语义保持不变，仅更新回退目标地址。
4. 当前测试中为了复用 mock 而显式写入 `/api` 的场景保持不变；本次只调整“未配置时”的默认值断言。

## 预期行为

### 1. 运行时行为

1. 浏览器 Local Storage 中不存在 `aim.serverBaseUrl` 时，前端默认使用 `http://localhost:8192`。
2. Local Storage 中存在非空值时，前端继续使用该值，而不是覆盖回默认值。
3. 传入空字符串、空白字符串或无值时，归一化结果继续回退到默认值，只是默认值改为 `http://localhost:8192`。
4. 服务端渲染或无 `window` 的读取分支仍返回默认值，只是地址更新为 `http://localhost:8192`。

### 2. 测试与文档行为

1. `modules/web/test/task-dashboard.spec.ts` 中“Local Storage 为空时回退默认 SERVER_BASE_URL”的断言应更新为 `http://localhost:8192`。
2. `modules/web/test/app.spec.ts` 中针对配置模块源码默认值的断言应更新为 `http://localhost:8192`，并继续保证请求层不内联默认地址。
3. 若仓库内存在当前有效文档把前端默认地址写死为旧值，也必须同步更新到 `http://localhost:8192`。
4. 历史设计文档、历史计划文档中的旧值记录保留原状，不为了追求全文一致而改写历史上下文。

## 成功标准

1. 前端默认地址只在 `modules/web/src/lib/server-base-url.ts` 中定义一次，值为 `http://localhost:8192`。
2. 所有与“前端默认 SERVER_BASE_URL”直接相关的当前测试断言与 live 文档引用都与该值保持一致。
3. 不出现新的环境变量入口、配置抽象层或超出本次 scope 的配置能力扩展。
4. 改动集保持聚焦：运行时默认值、相关测试、必要的当前有效文档引用，仅此而已。

## 验证建议

1. 代码搜索：检查 `modules/web/src`、`modules/web/test` 与当前有效文档中是否仍残留 `https://aim.zccz14.com` 作为前端默认值引用。
2. 定向测试：执行 `modules/web/test/task-dashboard.spec.ts` 中覆盖默认值回退的用例，确认输入框默认显示 `http://localhost:8192`。
3. 源码边界检查：执行 `modules/web/test/app.spec.ts` 或同等粒度校验，确认请求层继续通过 `readServerBaseUrl()` 取值，默认常量未扩散到其他模块。
4. 手工验证：在浏览器清空 `aim.serverBaseUrl` 后打开页面，确认表单默认值与实际请求基地址回退到 `http://localhost:8192`；保存自定义地址后，再次刷新仍优先使用保存值。
