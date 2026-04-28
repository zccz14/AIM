import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createOptimizerLaneEventRecorder } from "../src/optimizer-lane-events.js";

const tempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-optimizer-lane-events",
);

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

afterEach(async () => {
  vi.useRealTimers();
  await rm(tempRoot, { force: true, recursive: true });
});

describe("optimizer lane events", () => {
  it("keeps bounded recent events per project lane", async () => {
    vi.useFakeTimers();
    await using recorder = createOptimizerLaneEventRecorder({
      projectRoot: await createProjectRoot("bounded-recent-events"),
    });

    for (let index = 0; index < 7; index += 1) {
      vi.setSystemTime(new Date(`2026-04-29T10:00:0${index}.000Z`));
      recorder.record({
        event: "success",
        lane_name: "manager",
        project_id: "project-1",
        summary: `Manager event ${index}`,
      });
    }

    expect(recorder.list("project-1")).toEqual([
      expect.objectContaining({ summary: "Manager event 6" }),
      expect.objectContaining({ summary: "Manager event 5" }),
      expect.objectContaining({ summary: "Manager event 4" }),
      expect.objectContaining({ summary: "Manager event 3" }),
      expect.objectContaining({ summary: "Manager event 2" }),
    ]);
  });

  it("isolates lane and project histories", async () => {
    vi.useFakeTimers();
    await using recorder = createOptimizerLaneEventRecorder({
      projectRoot: await createProjectRoot("isolated-histories"),
    });

    vi.setSystemTime(new Date("2026-04-29T10:00:00.000Z"));
    recorder.record({
      event: "idle",
      lane_name: "manager",
      project_id: "project-1",
      summary: "Manager idle",
    });
    vi.setSystemTime(new Date("2026-04-29T10:00:01.000Z"));
    recorder.record({
      event: "failure",
      lane_name: "developer",
      project_id: "project-1",
      summary: "Developer failed. Fix the blocker and retry.",
      task_id: "task-1",
    });
    vi.setSystemTime(new Date("2026-04-29T10:00:02.000Z"));
    recorder.record({
      event: "success",
      lane_name: "coordinator",
      project_id: "project-2",
      summary: "Coordinator success",
    });

    expect(recorder.list("project-1")).toEqual([
      expect.objectContaining({
        lane_name: "developer",
        project_id: "project-1",
        summary: expect.stringContaining("Fix the blocker"),
      }),
      expect.objectContaining({
        lane_name: "manager",
        project_id: "project-1",
      }),
    ]);
    expect(recorder.list("project-2")).toEqual([
      expect.objectContaining({ lane_name: "coordinator" }),
    ]);
  });

  it("persists recent events across recreated recorders", async () => {
    vi.useFakeTimers();
    const projectRoot = await createProjectRoot("persists-across-recorders");

    {
      await using recorder = createOptimizerLaneEventRecorder({ projectRoot });

      vi.setSystemTime(new Date("2026-04-29T10:00:00.000Z"));
      recorder.record({
        event: "start",
        lane_name: "coordinator",
        project_id: "project-1",
        session_id: "session-1",
        summary: "Coordinator started",
        task_id: "task-1",
      });
    }

    await using recreatedRecorder = createOptimizerLaneEventRecorder({
      projectRoot,
    });

    expect(recreatedRecorder.list("project-1")).toEqual([
      {
        event: "start",
        lane_name: "coordinator",
        project_id: "project-1",
        session_id: "session-1",
        summary: "Coordinator started",
        task_id: "task-1",
        timestamp: "2026-04-29T10:00:00.000Z",
      },
    ]);
  });
});
