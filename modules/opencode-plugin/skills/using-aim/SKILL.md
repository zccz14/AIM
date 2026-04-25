---
name: using-aim
description: Use when starting AIM-related work to decide whether ask-strategy, Manager reporting, Coordinator Task Pool maintenance, task creation, README evaluation, spec verification, developer execution, or repo setup guidance applies before any response or action.
---

# using-aim

## Overview

This is a process skill for deciding when AIM-specific packaged skills apply inside this repository.

Use it at the start of AIM-related work. Its job is to stop the agent from improvising when a more specific AIM skill should be loaded first.

If there is even a plausible chance that an AIM skill applies, load that skill before any response or action, including clarifying questions, exploratory reads, or tool calls.

This skill does not replace user instructions, `AGENTS.md`, or the repo's default execution rules. It makes skill loading more disciplined inside those boundaries.

## Required Rule

If a relevant AIM skill exists for the task, you must load it before proceeding.

This is not optional. Do not rationalize your way out of it because the task looks small, familiar, or easy to inspect.

If you load a skill and it turns out not to apply after all, that is acceptable. Skipping a relevant skill is the larger mistake.

## Instruction Priority

Within this repo, follow instructions in this order:

1. Direct user instructions.
2. Repository rules such as `AGENTS.md`.
3. Relevant AIM packaged skills loaded through the `skill` tool.
4. Default platform behavior.

If a skill conflicts with user instructions or `AGENTS.md`, follow the higher-priority instruction. Skills refine execution inside those boundaries; they do not override them.

## When To Use

Use this skill when a request may involve AIM-specific workflow guidance and you need to decide whether another AIM packaged skill must be loaded first.

Typical triggers:

- The user needs a front-door routing step because the next AIM action is still unclear.
- The user first needs 问策 / 定策: compare viable directions, see an initial 上中下三策 recommendation set, and recursively narrow one strategy until the next action is clear.
- The user is converging on direction or priority and a clarification would change which path to take next.
- The user wants creative or design exploration before execution is chosen.
- The user wants AIM Coordinator guidance for maintaining Task Pool writes from Manager output, latest baseline facts, current Tasks, or rejected Task feedback.
- The user wants AIM Manager guidance for evaluating README goals against the latest baseline and producing a Manager Report for Coordinator handoff.
- The user wants to create a new AIM Task from stabilized intent.
- The user wants to judge the gap between README claims and the latest `origin/main` baseline, then emit direction signals without creating tasks or deciding execution.
- The user wants to validate whether a Task Spec is still actionable on the latest baseline.
- The user wants to report lifecycle facts back to an existing AIM Task while work progresses.
- The user wants to verify or standardize GitHub repo merge settings, rulesets, or PR auto-merge behavior for AIM workflows.
- You are about to respond or act and there is any plausible chance that one of the AIM packaged skills is the correct workflow guide.
- You are about to write, modify, migrate, or review tests, including before writing RED tests for TDD.

## The Rule In Practice

Check for AIM skill usage before you:

- answer the user
- ask a clarifying question
- inspect files or diffs
- run commands
- start drafting a plan
- perform AIM HTTP operations or GitHub workflow actions

The skill check comes first. Do not postpone it until after gathering a little more context.

## AIM Skills To Check First

Load the matching skill before acting when the request falls into one of these buckets:

- `aim-ask-strategy`: use as the broader front-door router when the next action is still unclear, when direction or priority must converge, when creative/design exploration is needed before execution, or when a clarification would change the route. Do not route every missing detail here. If the missing detail would not change direction, priority, or next action, continue with the more direct workflow instead.
- `aim-manager-guide`: direct entry when the user wants AIM Manager guidance to evaluate README goals against the latest baseline, define evaluation coordinates and iteration direction, and prepare stable Markdown Manager Report content for the server-side Manager Report resource without creating Tasks or executing work.
- `aim-coordinator-guide`: direct entry when the user wants AIM Coordinator guidance to maintain the Task Pool by producing an approvable `Task Write Bulk` list from Manager output, latest baseline facts, current Tasks, and rejected Task feedback.
- `aim-create-tasks`: direct entry when the user wants to turn stabilized, approved intent into candidate five-part AIM Task Specs and create Tasks only after explicit approval.
- `aim-evaluate-readme`: direct entry when the user wants to evaluate README 与最新 `origin/main` 的差距，输出 `claim_checks`、`conclusion_category` 和方向信号 `iteration_signal`，但不跨进任务创建或执行决定。
- `aim-verify-task-spec`: direct entry when the user wants to validate whether a candidate or existing AIM Task Spec still holds against the latest baseline.
- `aim-writing-tests`: direct entry when tests must be written, modified, migrated, or reviewed; load it before writing RED tests so behavior and contract semantics are protected instead of implementation shape.
- `aim-developer-guide`: direct entry when the user needs execution guidance for an existing AIM Task through worktree, PR, follow-up, and closing stages while reporting lifecycle facts back to AIM.
- `aim-setup-github-repo`: direct entry when the user wants to verify or standardize GitHub merge settings, default-branch rulesets, required checks, or PR auto-merge behavior with `gh`.

If none of these apply, continue with the repo's normal instructions.

## Decision Workflow

Before you respond or take action, run this checklist:

1. Identify the real job to be done, not just the surface wording.
2. Ask whether that job needs front-door strategy routing first, or whether it is already a direct match for Manager reporting, Coordinator Task Pool maintenance, task creation, README gap evaluation, spec verification, AIM developer execution guidance, or GitHub repo setup.
3. If the answer is yes, or even plausibly yes, load the corresponding AIM skill first.
4. Re-read the user request and `AGENTS.md` in light of that skill's scope and boundaries.
5. Only then respond or act.

When the match is uncertain, prefer loading the potentially relevant AIM skill first. A short detour through the right skill is cheaper than executing the wrong workflow. But do not treat every clarification as strategy work; route to `aim-ask-strategy` only when the answer could change the direction, priority, or immediate next action.

## Red Flags

These are signs you are rationalizing away required skill usage:

- "I already remember what that AIM skill says."
- "This is probably too small to need the skill."
- "I will inspect files first and decide later."
- "I only need to ask one clarifying question."
- "This sounds close enough that I can improvise."
- "I can quickly do one step before loading the skill."
- "The user did not explicitly ask me to load a skill."

If you notice one of these thoughts and a relevant AIM skill exists, load the skill first.

## Boundaries

- This skill is about deciding whether to load a more specific AIM skill.
- It does not create Tasks, validate Specs, patch AIM lifecycle state, or change GitHub settings by itself.
- It does not claim any runtime automation. The plugin ships static skill documents only.
- It does not weaken `AGENTS.md`, worktree rules, PR rules, or any other repo constraint.
