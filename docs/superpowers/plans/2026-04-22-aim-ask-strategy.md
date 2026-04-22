# aim-ask-strategy 实施计划

**Goal:** 在 `@aim-ai/opencode-plugin` 中新增 packaged skill `aim-ask-strategy`，把 AIM 语境下的“问策/定策”收敛成可复用的静态技能文档：先读 README，再给出带初始推荐的上中下三策，并通过有限追问递归细化，直到下一步动作已经清楚。

**Architecture:** 先用仓库内直接证据建立 RED 基线，证明当前插件尚未分发 `aim-ask-strategy`，且现有发现入口没有把执行者导向该 skill；再以最小文件集新增 skill 文档，并同步更新技能索引、包级 README、`using-aim` 发现入口与插件测试；最后用轻量文档/路径校验和已有测试入口做最小验证。

**Tech Stack:** Markdown、Vitest、pnpm、OpenCode packaged skills。

---

## 文件结构与职责映射

- Create: `modules/opencode-plugin/skills/aim-ask-strategy/SKILL.md` - 新 skill 正文，完整表达问策定位、README 前置、上中下三策、递归细化、提问纪律、终止条件与边界。
- Modify: `modules/opencode-plugin/test/opencode-plugin.test.ts` - 新增对 `aim-ask-strategy` 的资源、打包、README 索引、`using-aim` 发现入口与关键文案断言。
- Modify: `modules/opencode-plugin/skills/README.md` - 把 `aim-ask-strategy` 列入 packaged skill 索引。
- Modify: `modules/opencode-plugin/README.md` - 更新插件 README，列出新增 skill。
- Modify: `modules/opencode-plugin/skills/using-aim/SKILL.md` - 加入“需要先问策/定策而不是直接建 Task 或开做”时优先加载 `aim-ask-strategy` 的入口。

## 实施约束

- 只做 packaged skill 与其发现/打包链路的最小改动；不改插件运行时代码或打包配置。
- `aim-ask-strategy` 必须是中文正文，且明确定位为问策/定策，不得退化成泛化访谈模板。
- skill 必须显式要求先读 README，再输出初始上中下三策和初始推荐；中策通常优先，因为它最容易平衡 README、当前约束与历史决策。
- skill 必须支持递归细化：用户选中某一策后，继续把该策再拆成新的上中下三策，而不是直接落成机械步骤。
- skill 必须在“下一步动作已经清楚”时停止，而不是固定要求写满某个文档层级。
- 提问只能服务于改变策略排序；不得为了“再多收集一些信息”而无限追问。

## 验证口径

- RED：在实现前，确认仓库内不存在 `modules/opencode-plugin/skills/aim-ask-strategy/SKILL.md`，且 `skills/README.md`、包级 `README.md`、`using-aim`、插件测试中都未提到 `aim-ask-strategy`。
- GREEN：新增 skill 与最小索引/测试更新后，路径检查、文本检索、`git diff --check` 通过；若本地依赖已安装，则插件测试入口也应能覆盖新增断言。

## 自检结果

- 计划范围只覆盖 skill 文档、索引、发现入口和测试，不扩展到运行时自动化。
- 计划中的验证允许在依赖未安装时退化为轻量仓库内证据，不把外部环境缺失伪装成内容已验证。
