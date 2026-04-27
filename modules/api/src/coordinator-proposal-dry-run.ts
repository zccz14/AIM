type SourceDimension = {
  evaluation_method?: string;
  goal?: string;
  id: string;
  name: string;
};

type SourceEvaluation = {
  commit_sha?: string;
  evaluation: string;
  id: string;
  score?: number;
};

type TaskPoolItem = {
  done?: boolean;
  result?: string;
  source_metadata?: Record<string, unknown>;
  status?: string;
  task_id: string;
  title: string;
};

type EvaluationGap = {
  source_dimension: SourceDimension;
  source_evaluation: SourceEvaluation;
  source_gap: string;
};

type StaleTaskFeedback = {
  reason: string;
  task: TaskPoolItem;
};

type CoverageJudgment =
  | {
      status: "covered_by_unfinished_task";
      covered_by_task_id: string;
      summary: string;
    }
  | {
      status: "stale_unfinished_task";
      summary: string;
    }
  | {
      status: "uncovered_gap";
      summary: string;
    };

type DependencyConflictPlan = {
  conflict_draft: string;
  dependency_draft: string[];
};

type TaskSpecDraft = {
  spec: string;
  title: string;
};

type PlanningFeedback = {
  blocked: boolean;
  reason: string;
  rejected_task_id?: string;
};

type BaseProposalOperation = {
  coverage_judgment: CoverageJudgment;
  dependency_conflict_plan: DependencyConflictPlan;
  dry_run_only: true;
  must_not_write_directly: true;
  requires_task_spec_validation: boolean;
  source_dimension: null | SourceDimension;
  source_evaluation: null | SourceEvaluation;
  source_gap: string;
};

export type CoordinatorProposalOperation =
  | (BaseProposalOperation & {
      decision: "create";
      planning_feedback: null | PlanningFeedback;
      task_spec_draft: null | TaskSpecDraft;
    })
  | (BaseProposalOperation & {
      decision: "delete";
      planning_feedback: PlanningFeedback;
      task_id: string;
      task_spec_draft: null;
    })
  | (BaseProposalOperation & {
      decision: "keep";
      planning_feedback: null;
      task_id: string;
      task_spec_draft: null;
    });

export type CoordinatorProposalDryRunInput = {
  evaluations: EvaluationGap[];
  rejectedTasks?: TaskPoolItem[];
  staleTaskFeedback?: StaleTaskFeedback[];
  taskPool: TaskPoolItem[];
};

export type CoordinatorProposalDryRun = {
  dry_run: true;
  operations: CoordinatorProposalOperation[];
};

const getStringMetadata = (
  metadata: Record<string, unknown> | undefined,
  field: string,
) => {
  const value = metadata?.[field];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const matchesSource = (task: TaskPoolItem, evaluation: EvaluationGap) =>
  getStringMetadata(task.source_metadata, "dimension_id") ===
    evaluation.source_dimension.id &&
  getStringMetadata(task.source_metadata, "dimension_evaluation_id") ===
    evaluation.source_evaluation.id;

const isUnfinished = (task: TaskPoolItem) =>
  task.done !== true &&
  task.status !== "resolved" &&
  task.status !== "rejected";

const hasStaleOrSelfOverlapFeedback = (task: TaskPoolItem) => {
  const feedback = `${task.result ?? ""} ${
    getStringMetadata(task.source_metadata, "rejection_feedback") ?? ""
  }`.toLowerCase();

  return feedback.includes("stale") || feedback.includes("self-overlap");
};

const buildDependencyConflictPlan = (
  coveredTask: null | TaskPoolItem,
): DependencyConflictPlan => {
  if (coveredTask) {
    return {
      conflict_draft:
        "Existing unfinished same-source coverage should remain the active plan; do not create overlapping coverage.",
      dependency_draft: [coveredTask.task_id],
    };
  }

  return {
    conflict_draft:
      "No unfinished same-source coverage found; verify no dependency conflict before approval.",
    dependency_draft: [],
  };
};

const buildTaskSpecDraft = (evaluation: EvaluationGap): TaskSpecDraft => ({
  title: `Close ${evaluation.source_dimension.name} gap from evaluation ${evaluation.source_evaluation.id}`,
  spec: [
    `Implement verifiable coverage for Manager gap: ${evaluation.source_gap}`,
    `Source dimension: ${evaluation.source_dimension.name} (${evaluation.source_dimension.id}).`,
    `Source evaluation: ${evaluation.source_evaluation.id}.`,
    "Before implementation, independently validate this Task Spec against the latest baseline and current Task Pool evidence.",
    "Do not write this dry-run proposal directly to POST /tasks/batch without approval and validation evidence.",
  ].join("\n"),
});

const buildBaseOperation = (
  evaluation: EvaluationGap,
  coveredTask: null | TaskPoolItem,
): BaseProposalOperation => ({
  coverage_judgment: coveredTask
    ? {
        covered_by_task_id: coveredTask.task_id,
        status: "covered_by_unfinished_task",
        summary: `Unfinished Task ${coveredTask.task_id} already covers dimension ${evaluation.source_dimension.id} evaluation ${evaluation.source_evaluation.id}.`,
      }
    : {
        status: "uncovered_gap",
        summary: `No unfinished Task Pool item covers dimension ${evaluation.source_dimension.id} evaluation ${evaluation.source_evaluation.id}.`,
      },
  dependency_conflict_plan: buildDependencyConflictPlan(coveredTask),
  dry_run_only: true,
  must_not_write_directly: true,
  requires_task_spec_validation: !coveredTask,
  source_dimension: evaluation.source_dimension,
  source_evaluation: evaluation.source_evaluation,
  source_gap: evaluation.source_gap,
});

export const buildCoordinatorProposalDryRun = ({
  evaluations,
  rejectedTasks = [],
  staleTaskFeedback = [],
  taskPool,
}: CoordinatorProposalDryRunInput): CoordinatorProposalDryRun => {
  const operations: CoordinatorProposalOperation[] = [];

  for (const evaluation of evaluations) {
    const coveredTask = taskPool.find(
      (task) => isUnfinished(task) && matchesSource(task, evaluation),
    );
    const baseOperation = buildBaseOperation(evaluation, coveredTask ?? null);

    if (coveredTask) {
      operations.push({
        ...baseOperation,
        decision: "keep",
        planning_feedback: null,
        requires_task_spec_validation: false,
        task_id: coveredTask.task_id,
        task_spec_draft: null,
      });

      continue;
    }

    const rejectedCoverage = rejectedTasks.find(
      (task) =>
        matchesSource(task, evaluation) && hasStaleOrSelfOverlapFeedback(task),
    );

    if (rejectedCoverage) {
      operations.push({
        ...baseOperation,
        decision: "create",
        planning_feedback: {
          blocked: true,
          reason: `Rejected prior coverage ${rejectedCoverage.task_id} reported stale/self-overlap feedback; re-plan replacement against latest baseline and current Task Pool before validation.`,
          rejected_task_id: rejectedCoverage.task_id,
        },
        task_spec_draft: null,
      });

      continue;
    }

    operations.push({
      ...baseOperation,
      decision: "create",
      planning_feedback: null,
      task_spec_draft: buildTaskSpecDraft(evaluation),
    });
  }

  for (const { reason, task } of staleTaskFeedback) {
    operations.push({
      coverage_judgment: {
        status: "stale_unfinished_task",
        summary: `Unfinished Task ${task.task_id} is stale: ${reason}`,
      },
      decision: "delete",
      dependency_conflict_plan: {
        conflict_draft:
          "Delete only after confirming no active dependency still requires this stale task.",
        dependency_draft: [],
      },
      dry_run_only: true,
      must_not_write_directly: true,
      planning_feedback: {
        blocked: false,
        reason,
      },
      requires_task_spec_validation: false,
      source_dimension: null,
      source_evaluation: null,
      source_gap: "",
      task_id: task.task_id,
      task_spec_draft: null,
    });
  }

  return {
    dry_run: true,
    operations,
  };
};
