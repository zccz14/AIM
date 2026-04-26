# `@aim-ai/opencode-plugin`

`@aim-ai/opencode-plugin` is the v1 OpenCode-specific plugin skeleton for AIM.

## Scope

- Registers the packaged `skills/` directory into OpenCode config.
- Ships static `skills/` and `agents/` resources, including the `using-aim`, `aim-ask-strategy`, `aim-coordinator-guide`, `aim-create-tasks`, `aim-developer-guide`, `aim-evaluate-readme`, `aim-manager-guide`, `aim-setup-github-repo`, `aim-verify-task-spec`, and `aim-writing-tests` packaged skill documents.
- Uses `aim-ask-strategy` as the broad pre-execution discovery entry when the next action is not yet clear, while the other packaged skills stay as direct workflow guides for Manager evaluation signals, Coordinator Task Pool decisions, task creation, README evaluation, spec verification, test writing, developer execution, and repo setup.
- Does not inject bootstrap prompts, session context, workflow automation, or runtime AIM reporting behavior.

## Usage

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@aim-ai/opencode-plugin"]
}
```
