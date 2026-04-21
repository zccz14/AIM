---
"@aim-ai/opencode-plugin": patch
---

更新 `aim-task-lifecycle` skill，要求通过 `GET /tasks/{task_id}/spec` 读取 Task Spec，并明确禁止回退到本地 `.aim/task-specs` 文件。
