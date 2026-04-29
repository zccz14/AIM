import type { Task } from "@aim-ai/contract";
import { describe, expect, it } from "vitest";

import { buildTaskSessionPrompt } from "../src/task-continue-prompt.js";

const unknownSourceBaselineFreshness: Task["source_baseline_freshness"] = {
  current_commit: null,
  source_commit: null,
  status: "unknown",
  summary: "not set",
};

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  dependencies: [],
  done: false,
  git_origin_url: "https://github.com/example/repo.git",
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  project_id: "00000000-0000-4000-8000-000000000001",
  pull_request_url: null,
  result: "",
  session_id: null,
  source_baseline_freshness: unknownSourceBaselineFreshness,
  source_metadata: {},
  status: "pending",
  task_id: "task-1",
  task_spec: "Implement the assigned task.",
  title: "Implement task",
  updated_at: "2026-04-20T00:00:00.000Z",
  worktree_path: null,
  ...overrides,
});

describe("buildTaskSessionPrompt", () => {
  it("includes current baseline facts, active pool, rejected feedback, and spec verification guardrails", () => {
    const prompt = buildTaskSessionPrompt(createTask(), {
      activeTasks: [
        createTask({
          session_id: "session-active",
          status: "pending",
          task_id: "task-active",
          title: "Active overlapping work",
        }),
      ],
      baselineFacts: {
        commitSha: "a9979ba9487edf2d822e10ae7b651c98be3d175d",
        fetchedAt: "2026-04-28T17:13:03.000Z",
        summary: "Refactor optimizer system startup lifecycle (#258)",
      },
      rejectedTasks: [
        createTask({
          done: true,
          result:
            "Rejected because the task used stale origin/main assumptions.",
          source_metadata: {
            task_spec_validation: {
              conclusion: "fail",
              failure_reason: "baseline changed before execution",
            },
          },
          status: "rejected",
          task_id: "task-rejected",
          title: "Stale task",
          updated_at: "2026-04-21T00:00:00.000Z",
        }),
      ],
    });

    expect(prompt).toContain("Current baseline facts:");
    expect(prompt).toContain(
      'origin/main commit "a9979ba9487edf2d822e10ae7b651c98be3d175d" fetched at 2026-04-28T17:13:03.000Z: Refactor optimizer system startup lifecycle (#258)',
    );
    expect(prompt).toContain("Current Active Task Pool:");
    expect(prompt).toContain(
      "- Active overlapping work (task-active) status pending source_freshness unknown source (not set) current (not set) summary not set; worktree (not set); PR (not set); session session-active",
    );
    expect(prompt).toContain("Rejected Task feedback for this project:");
    expect(prompt).toContain(
      "- Stale task (task-rejected) rejected at 2026-04-21T00:00:00.000Z: Rejected because the task used stale origin/main assumptions. conclusion: fail; failure_reason: baseline changed before execution",
    );
    expect(prompt).toContain(
      "Before creating or using a worktree, read GET /tasks/task-1/spec and verify its assumptions against the current baseline facts, Active Task Pool, and rejected feedback below.",
    );
    expect(prompt).toContain(
      "Reject the Task if the spec is stale, self-overlaps with unfinished work, conflicts with rejected feedback, or its verification assumptions fail.",
    );
  });

  it("summarizes active task freshness, source/current commits, worktree, PR, and session compactly", () => {
    const prompt = buildTaskSessionPrompt(createTask(), {
      activeTasks: [
        createTask({
          pull_request_url: "https://github.com/example/repo/pull/12",
          session_id: "session-current",
          source_baseline_freshness: {
            current_commit: "1111111111111111111111111111111111111111",
            source_commit: "1111111111111111111111111111111111111111",
            status: "current",
            summary:
              "Task source baseline matches current origin/main 1111111111111111111111111111111111111111",
          },
          task_id: "task-current",
          title: "Current active work",
          worktree_path: "/repo/.worktrees/task-current",
        }),
        createTask({
          source_baseline_freshness: {
            current_commit: "2222222222222222222222222222222222222222",
            source_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            status: "stale",
            summary:
              "Task source baseline aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa differs from current origin/main 2222222222222222222222222222222222222222",
          },
          task_id: "task-stale",
          title: "Stale active work",
        }),
      ],
      baselineFacts: {
        commitSha: "2222222222222222222222222222222222222222",
        fetchedAt: "2026-04-28T17:13:03.000Z",
        summary: "Current baseline summary",
      },
      rejectedTasks: [],
    });

    expect(prompt).toContain(
      "- Current active work (task-current) status pending source_freshness current source 1111111111111111111111111111111111111111 current 1111111111111111111111111111111111111111 summary Task source baseline matches current origin/main 1111111111111111111111111111111111111111; worktree /repo/.worktrees/task-current; PR https://github.com/example/repo/pull/12; session session-current",
    );
    expect(prompt).toContain(
      "- Stale active work (task-stale) status pending source_freshness stale source aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa current 2222222222222222222222222222222222222222 summary Task source baseline aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa differs from current origin/main 2222222222222222222222222222222222222222; worktree (not set); PR (not set); session (not set)",
    );
  });

  it("uses an explicit unknown fallback when active task freshness is missing", () => {
    const taskWithoutFreshness = createTask({
      task_id: "task-unknown",
      title: "Unknown active work",
    }) as Task & {
      source_baseline_freshness?: Task["source_baseline_freshness"];
    };
    delete taskWithoutFreshness.source_baseline_freshness;

    const prompt = buildTaskSessionPrompt(createTask(), {
      activeTasks: [taskWithoutFreshness as Task],
      baselineFacts: {
        commitSha: "2222222222222222222222222222222222222222",
        fetchedAt: "2026-04-28T17:13:03.000Z",
        summary: "Current baseline summary",
      },
      rejectedTasks: [],
    });

    expect(prompt).toContain(
      "- Unknown active work (task-unknown) status pending source_freshness unknown source (not set) current (not set) summary not set; worktree (not set); PR (not set); session (not set)",
    );
  });
});
