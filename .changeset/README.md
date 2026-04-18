# Changesets baseline

此目录承载 monorepo 的版本编排配置与待发布变更说明。

- `config.json` 固定 `baseBranch` 为 `main`，与 release-aware workflow 对齐。
- 只有需要进入版本 PR / release 准备的模块变更才新增 changeset Markdown。
- 根级工程、CI 或纯文档调整如果不影响可发布包，可保持无 changeset。
