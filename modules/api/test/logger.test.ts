import { describe, expect, it } from "vitest";

import {
  buildTaskLogFields,
  buildTaskResultPreview,
} from "../src/task-log-fields.js";

describe("task log field helpers", () => {
  it("truncates result preview to 200 characters", () => {
    const result = "x".repeat(250);

    expect(buildTaskResultPreview(result)).toBe("x".repeat(200));
  });

  it("builds task log fields for success events with optional fields", () => {
    expect(
      buildTaskLogFields("task_session_bound", {
        project_path: "/tmp/project",
        session_id: "session-123",
        status: "running",
        task_id: "task-123",
      }),
    ).toEqual({
      event: "task_session_bound",
      project_path: "/tmp/project",
      session_id: "session-123",
      status: "running",
      task_id: "task-123",
    });
  });

  it("adds result preview only for terminal task events", () => {
    expect(
      buildTaskLogFields("task_resolved", {
        result: "done",
        task_id: "task-123",
      }),
    ).toEqual({
      event: "task_resolved",
      result_preview: "done",
      task_id: "task-123",
    });

    expect(
      buildTaskLogFields("task_created", {
        result: "ignored",
        task_id: "task-123",
      }),
    ).toEqual({
      event: "task_created",
      task_id: "task-123",
    });
  });
});
