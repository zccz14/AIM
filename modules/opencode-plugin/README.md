# `@aim-ai/opencode-plugin`

`@aim-ai/opencode-plugin` is the v1 OpenCode-specific plugin skeleton for AIM.

## Scope

- Registers the packaged `skills/` directory into OpenCode config.
- Ships static `skills/` and `agents/` resources, including the `aim-create-tasks`, `aim-setup-github-repo`, and `aim-task-lifecycle` packaged skill documents.
- Does not inject bootstrap prompts, session context, workflow automation, or runtime AIM reporting behavior.

## Usage

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@aim-ai/opencode-plugin"]
}
```
