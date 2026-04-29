---
"@aim-ai/api": patch
"@aim-ai/contract": patch
---

Remove the legacy `/tasks/{taskId}/resolve` and `/tasks/{taskId}/reject` API routes from the server and public contract so terminal completion flows through OpenCode session resolve/reject only.
