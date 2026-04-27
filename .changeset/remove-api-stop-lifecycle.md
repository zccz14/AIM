---
"@aim-ai/api": patch
---

Remove public `stop()` lifecycle methods from API runtime resources in favor of async disposal, while preserving optimizer stop endpoint behavior through a control-plane disable API.
