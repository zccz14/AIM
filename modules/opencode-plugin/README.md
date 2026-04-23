# `@aim-ai/opencode-plugin`

`@aim-ai/opencode-plugin` is the v1 OpenCode-specific plugin skeleton for AIM.

## Scope

- Registers the packaged `skills/` directory into OpenCode config.
- Ships static `skills/` and `agents/` resources, including the `using-aim`, `aim-ask-strategy`, `aim-create-tasks`, `aim-developer-guide`, `aim-evaluate-readme`, `aim-setup-github-repo`, and `aim-verify-task-spec` packaged skill documents.
- Does not inject bootstrap prompts, session context, workflow automation, or runtime AIM reporting behavior.

## Usage

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@aim-ai/opencode-plugin"]
}
```
