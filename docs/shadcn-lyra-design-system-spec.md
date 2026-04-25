# Shadcn/UI + Lyra Preset 设计系统固定化 Spec

## 背景

当前 `modules/web` 已经移除 Mantine，并保留了 `@radix-ui/react-slot`、`class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-react` 等 Shadcn/UI 常见基础依赖；但仓库尚未固定 `components.json`，Lyra Preset 语义也没有形成可验证的 token 契约。页面中仍有大量页面级视觉 class，导致 Task Dashboard、Create Task、Task Details、overview、dependency graph、task table、server base URL form、theme toggle/status badge 等界面难以稳定演进。

## 目标

1. 在仓库根固定 `components.json`，明确 Shadcn/UI 组件生成与维护契约。
2. 保留 Radix UI primitive 路线，现阶段继续以 `@radix-ui/react-slot` 支撑 `Button asChild`，后续新增 primitive 必须进入 `modules/web/src/components/ui`。
3. 固定 Lyra Preset 语义：若没有可验证、可安装的 Lyra Preset npm 包，不臆造依赖；以仓库内 `modules/web/src/components/ui/lyra-preset.css` 和 `modules/web/src/styles.css` 的 CSS variables 作为 Lyra Preset 的可审计来源。
4. 将 `modules/web` 页面迁移到 Shadcn/UI 风格组件体系，减少散落页面级手写视觉 class，把可复用的 button、card、input、textarea、select、badge、surface 等 primitive 固定到 `components/ui`。
5. 保持既有产品语义：任务池观测、任务创建、详情阅读、主题切换、服务地址配置、依赖图选择、桌面与移动布局都必须继续可用。

## components.json 约束

1. `style` 固定为 `new-york`，`tsx` 与 `rsc` 分别固定为 `true`、`false`。
2. `tailwind.css` 必须指向 `modules/web/src/styles.css`，`tailwind.cssVariables` 必须为 `true`。
3. `aliases.components`、`aliases.ui`、`aliases.lib` 必须匹配当前 repo 结构：`modules/web/src/components`、`modules/web/src/components/ui`、`modules/web/src/lib`。
4. `iconLibrary` 固定为 `lucide`，与当前 `lucide-react` 依赖一致。
5. 不新增不可验证的 `lyra` npm 依赖；Lyra Preset 通过本仓库 token 文件固定。

## UI Primitive 清单

本次固定以下 primitive，并要求页面优先使用这些组件而不是继续扩散视觉 class：

1. `Button`：Shadcn/UI 风格，保留 Radix `Slot` 与 `asChild`。
2. `Card`：承载 dashboard、overview、details 与 form 的通用 surface。
3. `Input`、`Textarea`、`Select`、`Label`：承载筛选、SERVER_BASE_URL、创建任务表单。
4. `Badge`：承载通用 badge 与 task status badge。
5. `LyraSurface`：承载 AIM/Lyra branded surface、panel、stack、kicker 等组合语义。
6. `ThemeProvider`、`ThemeToggle`：继续承载明暗主题切换，并接入 Lyra tokens。

## 页面迁移边界

1. Task Dashboard shell、overview、dependency graph、task table、server base URL form 必须使用 UI primitive 表达视觉容器与表单控件。
2. Create Task 与 Task Details 必须使用同一组 Lyra surface/field/card primitives，保持现有 API contract 与导航语义。
3. ReactFlow、Recharts、TanStack Table 属于功能组件，不需要替换；只迁移它们外层容器与可交互视觉 primitive。
4. 允许保留必要布局语义 class，例如 grid、graph frame、table scroll、ReactFlow node class；不再为每个页面复制按钮、输入框、卡片、badge 的视觉规则。

## 验收口径

1. Policy/contract 测试能验证 `components.json`、Lyra token 文件、UI primitive 清单、页面导入边界与依赖契约。
2. Playwright 行为测试继续覆盖 dashboard、创建任务、详情、主题切换、server base URL、依赖图与移动/桌面可用性。
3. `modules/web` 的 typecheck、lint、web tests 通过；如可行，仓库 build 也应通过。
4. PR 创建后启用 auto-merge，并持续跟进 checks/review/mergeability 到终态。
