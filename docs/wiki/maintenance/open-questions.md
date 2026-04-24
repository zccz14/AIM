# 维护页：待确认事项

返回 [wiki 首页](../index.md)；相关页：[这个仓库是干啥的](../topic/what-this-repo-is-for.md)

## 待确认事实

1. **PR follow-up 到 auto-merge 的完整自动化程度**
   - 当前依据：README 与调度文档强烈强调完整闭环，但本次只抽查了 scheduler、repository、task routes、session coordinator 等核心文件。
   - 当前处理：已把“存在闭环语义与部分实现骨架”写成稳定事实；未把“完整无人值守合并流程已经全部落地”写成稳定事实。

2. **Web dashboard 的覆盖深度**
   - 当前依据：`modules/web/src/app.tsx` 指向 task dashboard 页面，说明界面入口存在。
   - 当前处理：稳定说法仅限于“已有 task dashboard 入口/最小管理界面落点”。

3. **CLI task 命令的成熟度与覆盖范围**
   - 当前依据：`modules/cli/src/index.ts` 暴露了 health 与 task CRUD 入口。
   - 当前处理：稳定说法仅限于“存在 CLI 命令入口”，未写成“CLI 已覆盖全部 AIM 操作面”。

4. **AIM Manager 输出的最终落点**
   - 当前依据：README 明确写“目前尚不明确”是 repo 文件还是 SQLite。
   - 当前处理：继续保留为待确认，不沉淀为稳定结论。

## 维护建议

- 若后续新增 source summary，优先补：`docs/task-model.md`、更具体的 task dashboard 文档、更多 OpenCode 集成实现说明。
- 若用户后续高频追问“现在到底能跑到哪一步”，应新增一页专门记录“当前能力矩阵 / 已验证路径”。
