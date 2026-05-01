---
"@aim-ai/api": patch
---

让 Coordinator dry-run 只为仍未完成的 stale feedback Task 输出 delete 候选，同时保留终态 rejected feedback 对重复 create 的阻断作用。
