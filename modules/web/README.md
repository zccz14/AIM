# Web GUI

AIM Web GUI 是为了 Director (人类) 设计的一个可视化界面，目的是让 Director 能够清晰地看到当前项目的基线与目标状态之间的差距、迭代的进展、成功率、阻塞点等关键指标。通过这个界面，Director 可以更好地理解 AIM 系统的运行状况，并且在必要时提供澄清或调整。

出于持续部署和单线发布的考虑，AIM Production 发布在 `https://aim.zccz14.com` 上，允许配置自定义服务器地址以连接到本地或其他环境的 AIM Server。

## UI 库选型与开发描述：

- React + TypeScript + Vite：现代化的前端技术栈，提供良好的开发体验和性能。
- Tailwind CSS：实用的 CSS 框架，能够快速构建响应式和美观的界面。
- TanStack Query：用于数据获取和状态管理，简化与后端 API 的交互。
- TanStack Table：用于构建复杂的表格组件，展示任务列表和相关指标。
- Shadcn/UI: 基于 Radix UI 和 Tailwind CSS 的组件库，提供丰富的可定制组件，提升开发效率和界面一致性。
  - 使用 Radix UI + Lyra Preset 的变体，Lyra Preset 使用等宽字体，适合软件工程风格。
- Rechart：用于构建数据可视化图表，帮助 Director 直观地理解项目进展和关键指标。
- React Flow：用于构建任务依赖关系图，帮助 Director 可视化任务之间的关系和状态。

### 关于 UI 样式的约束：

- 禁止自己编写 content style，必须照搬 UI 库的组件样式，禁止在组件上添加额外的 className 来修改样式。
- 强烈建议使用 UI 库的 Layout 组件来实现布局，而不是自己写 CSS。
- 只在极少数必要的情况下使用 Tailwind CSS 的工具类来调整布局或样式，但必须确保不破坏组件的原有设计和一致性。

注：大部分的 UI 设计惨剧都是因为 AI 自以为是地修改了组件的样式或布局导致的，所以这个约束是为了最大程度地避免这种情况发生。AI 实际上看不见界面，目前也没有特别好的端到端的开发流程方案来构建一个能让 AI 原生理解 UI。因此，我们通过严格限制 AI 对 UI 样式的修改权限，来确保界面的一致性和可用性，同时也能让 AI 更专注于功能实现而不是设计细节。

## 常见问题

### SPA 深链接如何支持？

使用 HashRouter 方案，URL 中的 `#` 之后部分作为前端路由使用，这样可以避免与后端 API 路径冲突，同时也能支持 SPA 的深链接功能。

不依赖后端路由和服务器配置，也不依赖于具体的静态网站托管方案，兼容 GitHub Pages, Vercel 等常见托管平台。
