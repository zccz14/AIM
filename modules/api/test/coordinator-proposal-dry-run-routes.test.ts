import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";
import * as contractModule from "../../contract/src/index.js";
import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-coordinator-proposal-dry-run-routes",
);
const currentBaselineCommit = "fc284b9aa5ff780228c625011d4714f9e6771622";
const staleBaselineCommit = "45eeecbf2a0c2d33dd9dd4896fc8dd6d6b9ded13";

let previousProjectRoot: string | undefined;

const createRouteApp = () =>
  createApp({
    openCodeModelsAdapter: {
      listSupportedModels: vi.fn().mockResolvedValue({
        items: [
          {
            model_id: "claude-sonnet-4-5",
            model_name: "Claude Sonnet 4.5",
            provider_id: "anthropic",
            provider_name: "Anthropic",
          },
        ],
      }),
    },
  });

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;

  return projectRoot;
};

const createProject = async (app: ReturnType<typeof createRouteApp>) => {
  const response = await app.request(contractModule.projectsPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      git_origin_url: "https://github.com/example/coordinator-dry-run.git",
      global_model_id: "claude-sonnet-4-5",
      global_provider_id: "anthropic",
      name: "Coordinator dry run",
    }),
  });

  expect(response.status).toBe(201);

  return (await response.json()) as contractModule.Project;
};

const countTasks = (projectRoot: string) => {
  const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
  const row = database.prepare("SELECT COUNT(*) AS count FROM tasks").get() as {
    count: number;
  };

  database.close();

  return row.count;
};

afterEach(async () => {
  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  previousProjectRoot = undefined;

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("coordinator proposal dry-run route", () => {
  it("returns structured dry-run operations without mutating the tasks table", async () => {
    const projectRoot = await useProjectRoot("structured-dry-run-no-writes");
    const app = createRouteApp();
    const project = await createProject(app);
    const seededTaskResponse = await app.request(contractModule.tasksPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        task_spec: "Existing task proves dry-run does not write rows.",
        title: "Existing task",
      }),
    });

    expect(seededTaskResponse.status).toBe(201);
    expect(countTasks(projectRoot)).toBe(1);

    const response = await app.request(
      contractModule.coordinatorProposalDryRunPath,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          currentBaselineCommit,
          evaluations: [
            {
              source_dimension: {
                id: "dimension-stale",
                name: "Stale source",
              },
              source_evaluation: {
                commit_sha: staleBaselineCommit,
                evaluation: "Stale evaluation should not become a task draft.",
                id: "evaluation-stale",
              },
              source_gap: "Stale source evaluation blocked.",
            },
            {
              source_dimension: {
                id: "dimension-covered",
                name: "Covered source",
              },
              source_evaluation: {
                commit_sha: currentBaselineCommit,
                evaluation: "Already covered by an unfinished task.",
                id: "evaluation-covered",
              },
              source_gap: "Keep current unfinished coverage.",
            },
            {
              source_dimension: {
                id: "dimension-uncovered",
                name: "Uncovered source",
              },
              source_evaluation: {
                commit_sha: currentBaselineCommit,
                evaluation: "No task covers this source gap.",
                id: "evaluation-uncovered",
              },
              source_gap: "Create a draft for uncovered gap.",
            },
          ],
          staleTaskFeedback: [
            {
              reason: "Superseded by current planning evidence.",
              task: {
                source_metadata: {
                  dimension_evaluation_id: "evaluation-old",
                  dimension_id: "dimension-old",
                },
                status: "processing",
                task_id: "task-stale-feedback",
                title: "Stale feedback task",
              },
            },
          ],
          taskPool: [
            {
              source_metadata: {
                dimension_evaluation_id: "evaluation-covered",
                dimension_id: "dimension-covered",
                latest_origin_main_commit: currentBaselineCommit,
              },
              status: "processing",
              task_id: "task-covered",
              title: "Covered task",
            },
          ],
        }),
      },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(
      contractModule.coordinatorProposalDryRunResponseSchema.safeParse(payload)
        .success,
    ).toBe(true);
    expect(payload.dry_run).toBe(true);
    expect(payload.operations).toEqual([
      expect.objectContaining({
        decision: "create",
        dry_run_only: true,
        planning_feedback: expect.objectContaining({ blocked: true }),
        task_spec_draft: null,
      }),
      expect.objectContaining({
        coverage_judgment: expect.objectContaining({
          status: "covered_by_unfinished_task",
        }),
        decision: "keep",
        task_id: "task-covered",
      }),
      expect.objectContaining({
        coverage_judgment: expect.objectContaining({ status: "uncovered_gap" }),
        decision: "create",
        planning_feedback: null,
        task_spec_draft: expect.objectContaining({
          title:
            "Close Uncovered source gap from evaluation evaluation-uncovered",
        }),
      }),
      expect.objectContaining({
        coverage_judgment: expect.objectContaining({
          status: "stale_unfinished_task",
        }),
        decision: "delete",
        task_id: "task-stale-feedback",
      }),
    ]);
    expect(countTasks(projectRoot)).toBe(1);
  });

  it("returns actionable validation errors for invalid dry-run requests", async () => {
    await useProjectRoot("invalid-dry-run-payload");
    const app = createRouteApp();
    const response = await app.request(
      contractModule.coordinatorProposalDryRunPath,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluations: [] }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "TASK_VALIDATION_ERROR",
      message: expect.stringContaining("currentBaselineCommit"),
    });
  });

  it("documents the dry-run endpoint in the OpenAPI contract", () => {
    expect(
      contractModule.openApiDocument.paths[
        contractModule.coordinatorProposalDryRunPath
      ],
    ).toBeDefined();
  });
});
