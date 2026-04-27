import { describe, expect, it, vi } from "vitest";

import { buildCoordinatorProposalDryRun } from "../src/coordinator-proposal-dry-run.js";

const sourceDimension = {
  evaluation_method: "Check README claims against implemented API behavior.",
  goal: "README-documented task pool behavior is implemented and verifiable.",
  id: "dimension-api",
  name: "API completeness",
};

const sourceEvaluation = {
  commit_sha: "abc1234",
  evaluation:
    "README promises a dry-run Coordinator proposal step, but the current API only documents direct POST /tasks/batch writes.",
  id: "evaluation-1",
  score: 42,
};

describe("coordinator proposal dry-run", () => {
  it("turns an uncovered Manager gap into a dry-run create proposal with a concrete Task Spec draft", () => {
    const dryRun = buildCoordinatorProposalDryRun({
      evaluations: [
        {
          source_dimension: sourceDimension,
          source_evaluation: sourceEvaluation,
          source_gap:
            "Add a dry-run Coordinator proposal path before task batch writes.",
        },
      ],
      taskPool: [],
    });

    expect(dryRun).toEqual({
      dry_run: true,
      operations: [
        expect.objectContaining({
          decision: "create",
          dry_run_only: true,
          must_not_write_directly: true,
          requires_task_spec_validation: true,
          source_dimension: sourceDimension,
          source_evaluation: sourceEvaluation,
          source_gap:
            "Add a dry-run Coordinator proposal path before task batch writes.",
        }),
      ],
    });
    expect(dryRun.operations[0]).toMatchObject({
      coverage_judgment: {
        status: "uncovered_gap",
        summary:
          "No unfinished Task Pool item covers dimension dimension-api evaluation evaluation-1.",
      },
      dependency_conflict_plan: {
        conflict_draft:
          "No unfinished same-source coverage found; verify no dependency conflict before approval.",
        dependency_draft: [],
      },
      task_spec_draft: {
        title: "Close API completeness gap from evaluation evaluation-1",
        spec: expect.stringContaining(
          "Implement verifiable coverage for Manager gap: Add a dry-run Coordinator proposal path before task batch writes.",
        ),
      },
    });
    expect(dryRun.operations[0]?.task_spec_draft?.spec).not.toContain(
      "optimizer-loop",
    );
  });

  it("keeps an existing unfinished coverage task as noop", () => {
    const dryRun = buildCoordinatorProposalDryRun({
      evaluations: [
        {
          source_dimension: sourceDimension,
          source_evaluation: sourceEvaluation,
          source_gap: "Close the documented dry-run gap.",
        },
      ],
      taskPool: [
        {
          done: false,
          source_metadata: {
            dimension_evaluation_id: "evaluation-1",
            dimension_id: "dimension-api",
          },
          status: "processing",
          task_id: "task-existing",
          title: "Existing dry-run task",
        },
      ],
    });

    expect(dryRun.operations).toEqual([
      expect.objectContaining({
        decision: "keep",
        dry_run_only: true,
        must_not_write_directly: true,
        requires_task_spec_validation: false,
        task_id: "task-existing",
        task_spec_draft: null,
      }),
    ]);
    expect(dryRun.operations[0]?.coverage_judgment).toEqual({
      covered_by_task_id: "task-existing",
      status: "covered_by_unfinished_task",
      summary:
        "Unfinished Task task-existing already covers dimension dimension-api evaluation evaluation-1.",
    });
  });

  it("uses rejected stale or self-overlap feedback as replacement planning feedback instead of a generic create placeholder", () => {
    const dryRun = buildCoordinatorProposalDryRun({
      evaluations: [
        {
          source_dimension: sourceDimension,
          source_evaluation: sourceEvaluation,
          source_gap: "Replace the stale dry-run proposal plan.",
        },
      ],
      rejectedTasks: [
        {
          result:
            "Rejected: stale baseline and self-overlap with another Task Pool item.",
          source_metadata: {
            dimension_evaluation_id: "evaluation-1",
            dimension_id: "dimension-api",
          },
          task_id: "task-rejected",
          title: "Rejected stale task",
        },
      ],
      taskPool: [],
    });

    expect(dryRun.operations).toEqual([
      expect.objectContaining({
        decision: "create",
        planning_feedback: {
          blocked: true,
          reason:
            "Rejected prior coverage task-rejected reported stale/self-overlap feedback; re-plan replacement against latest baseline and current Task Pool before validation.",
          rejected_task_id: "task-rejected",
        },
        requires_task_spec_validation: true,
        task_spec_draft: null,
      }),
    ]);
  });

  it("can propose deleting stale unfinished coverage without writing a task batch", () => {
    const postBatch = vi.fn();
    const dryRun = buildCoordinatorProposalDryRun({
      evaluations: [],
      staleTaskFeedback: [
        {
          reason: "Superseded by accepted dependency plan.",
          task: {
            done: false,
            source_metadata: {
              dimension_evaluation_id: "evaluation-old",
              dimension_id: "dimension-api",
            },
            status: "processing",
            task_id: "task-stale",
            title: "Stale task",
          },
        },
      ],
      taskPool: [],
    });

    expect(dryRun.operations).toEqual([
      expect.objectContaining({
        decision: "delete",
        dry_run_only: true,
        must_not_write_directly: true,
        requires_task_spec_validation: false,
        task_id: "task-stale",
      }),
    ]);
    expect(postBatch).not.toHaveBeenCalled();
  });
});
