---
"@aim-ai/api": patch
---

在 Coordinator proposal dry-run 中提前拦截 stale 或未知 baseline 的 create 候选，并避免把已知 stale 的 unfinished Task 当作当前覆盖证据。
