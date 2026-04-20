# Skills Boundary

This directory is packaged with `@aim-ai/opencode-plugin`.

The package ships static skill documentation only:

- `aim-create-tasks`: AIM task creation guidance that turns approved user intent into candidate five-part Task Specs and only creates Tasks via HTTP POST after explicit approval.
- `aim-task-lifecycle`: AIM task lifecycle reporting guidance for updating an existing Task via HTTP PATCH.
- `aim-verify-task-spec`: AIM Task Spec validation guidance that separates structural sufficiency from latest-baseline assumption checks.

These files define packaging and discovery boundaries only. The plugin does not auto-run workflow automation or background AIM reporting.
