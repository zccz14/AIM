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
  it("bootstraps the developer with only mandatory identifiers and fetch instructions", () => {
    const prompt = buildTaskSessionPrompt(
      createTask({ session_id: "session-1" }),
    );

    expect(prompt).toContain("You are the AIM developer");
    expect(prompt).toContain("aim-developer-guide");
    expect(prompt).toContain("http://localhost:8192");
    expect(prompt).toContain("task_id: task-1");
    expect(prompt).toContain(
      "project_id: 00000000-0000-4000-8000-000000000001",
    );
    expect(prompt).toContain("session_id: session-1");
    expect(prompt).toContain("GET /tasks/task-1");
    expect(prompt).toContain("GET /tasks/task-1/spec");
    expect(prompt).toMatch(/before acting/i);
    expect(prompt).toContain("worktree_path: not recorded");
    expect(prompt).toContain("pull_request_url: not recorded");
    expect(prompt).not.toContain("Current baseline facts");
    expect(prompt).not.toContain("Current Active Task Pool");
    expect(prompt).not.toContain("Rejected Task feedback");
    expect(prompt).not.toContain("git_origin_url");
    expect(prompt).not.toContain("status: pending");
  });

  it("keeps recorded worktree and PR lifecycle facts visible with a no-recreate warning", () => {
    const prompt = buildTaskSessionPrompt(
      createTask({
        pull_request_url: "https://github.com/example/repo/pull/12",
        worktree_path: "/repo/.worktrees/task-1",
      }),
    );

    expect(prompt).toContain("worktree_path: /repo/.worktrees/task-1");
    expect(prompt).toContain(
      "pull_request_url: https://github.com/example/repo/pull/12",
    );
    expect(prompt).toMatch(/do not recreate[^\n]*worktree/i);
    expect(prompt).toMatch(/do not recreate[^\n]*PR/i);
    expect(prompt).toMatch(/continue the existing lifecycle/i);
  });

  it("does not serialize provided baseline, active pool, or rejected feedback into the developer prompt", () => {
    const prompt = buildTaskSessionPrompt(createTask(), {
      activeTasks: [
        createTask({ task_id: "task-active", title: "Active work" }),
      ],
      baselineFacts: {
        commitSha: "a9979ba9487edf2d822e10ae7b651c98be3d175d",
        fetchedAt: "2026-04-28T17:13:03.000Z",
        summary: "Refactor optimizer system startup lifecycle (#258)",
      },
      rejectedTasks: [
        createTask({ task_id: "task-rejected", title: "Rejected work" }),
      ],
    });

    expect(prompt).not.toContain("a9979ba9487edf2d822e10ae7b651c98be3d175d");
    expect(prompt).not.toContain("Refactor optimizer system startup lifecycle");
    expect(prompt).not.toContain("task-active");
    expect(prompt).not.toContain("Active work");
    expect(prompt).not.toContain("task-rejected");
    expect(prompt).not.toContain("Rejected work");
  });
});
