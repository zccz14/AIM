# Skills Boundary

This directory is packaged with `@aim-ai/opencode-plugin`.

The package ships static skill documentation only:

- `aim-ask-strategy`: Broad AIM pre-execution strategy entry for cases where the next action is not yet clear; read README first, then explore direction choices, open questions, creative/design work, or route-changing clarifications through an initial recommended upper-middle-lower strategy set.
- `aim-create-tasks`: AIM task creation guidance that turns approved user intent into candidate five-part Task Specs and only creates Tasks via HTTP POST after explicit approval.
- `aim-evaluate-readme`: README-to-baseline gap evaluation guidance for comparing README claims with the latest `origin/main` facts and emitting direction signals without deciding execution.
- `aim-setup-github-repo`: GitHub repository settings and PR auto-merge guidance for verifying or standardizing merge settings, rulesets, and auto-merge behavior with `gh`.
- `aim-developer-guide`: Required AIM Developer entry guidance for working an existing Task through AIM Server reading, baseline verification, required worktree/PR flow, AIM reporting, and final resolve or reject handling.
- `aim-verify-task-spec`: AIM Task Spec validation guidance that separates structural sufficiency from latest-baseline assumption checks.
- `using-aim`: AIM process guidance for deciding when a more specific AIM packaged skill must be loaded before acting.

These files define packaging and discovery boundaries only. The plugin does not auto-run workflow automation or background AIM reporting.
