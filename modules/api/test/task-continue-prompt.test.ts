import type { Task } from "@aim-ai/contract";
import { describe, expect, it } from "vitest";

import { buildTaskSessionPrompt } from "../src/task-continue-prompt.js";

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  dependencies: [],
  done: false,
  git_origin_url: "https://github.com/example/repo.git",
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  project_id: "00000000-0000-4000-8000-000000000001",
  pull_request_url: null,
  session_id: null,
  source_metadata: {},
  status: "processing",
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
          status: "processing",
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
      "- Active overlapping work (task-active) status processing session session-active",
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
});
