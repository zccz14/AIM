# `@aim-ai/opencode-plugin`

`@aim-ai/opencode-plugin` is the v1 OpenCode-specific plugin skeleton for AIM.

## Scope

- Registers the packaged `skills/` directory into OpenCode config.
- Ships static `skills/` and `agents/` resources.
- Does not inject bootstrap prompts, session context, or workflow automation.

## Usage

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@aim-ai/opencode-plugin"]
}
```
