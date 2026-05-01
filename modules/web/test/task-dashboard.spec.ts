import { expect, type Page, test } from "@playwright/test";

const currentBaselineCommitSha = "10c965007a9682b212c6531f148a30f98cad3d2c";
const zeroOpenCodeSessionTokens = {
  cached_tokens: 0,
  cache_write_tokens: 0,
  input_tokens: 0,
  output_tokens: 0,
  project_id: null,
  reasoning_tokens: 0,
  title: null,
};

const buildTask = ({
  dependencies = [],
  done = false,
  gitOriginUrl = "https://github.com/example/main.git",
  projectId = "00000000-0000-4000-8000-000000000010",
  result = "",
  sourceBaselineFreshness = {
    current_commit: "abc1234",
    source_commit: "abc1234",
    status: "current",
    summary: "Task source baseline matches current origin/main abc1234",
  },
  spec,
  status = "pending",
  taskId,
  updatedAt = "2026-04-19T00:00:00.000Z",
  worktreePath = null,
  pullRequestUrl = null,
}: {
  dependencies?: string[];
  done?: boolean;
  gitOriginUrl?: string;
  projectId?: string;
  result?: string;
  sourceBaselineFreshness?: {
    current_commit: string | null;
    source_commit: string | null;
    status: "current" | "stale" | "unknown";
    summary: string;
  };
  spec: string;
  status?: string;
  taskId: string;
  updatedAt?: string;
  worktreePath?: string | null;
  pullRequestUrl?: string | null;
}) => ({
  task_id: taskId,
  title: spec.split("\n", 1)[0] ?? spec,
  task_spec: spec,
  project_id: projectId,
  git_origin_url: gitOriginUrl,
  global_provider_id: "anthropic",
  global_model_id: "claude-sonnet-4-5",
  session_id: null,
  worktree_path: worktreePath,
  pull_request_url: pullRequestUrl,
  dependencies,
  result,
  source_metadata: {},
  source_baseline_freshness: sourceBaselineFreshness,
  done,
  status,
  created_at: "2026-04-19T00:00:00.000Z",
  updated_at: updatedAt,
});

const buildDimension = ({
  dimensionId = "dimension-readme-fit",
  evaluationMethod = "Compare visible dashboard evidence against README goal convergence.",
  goal = "Dashboard keeps AIM Director focused on baseline convergence.",
  name = "README Fit",
  projectId = "00000000-0000-4000-8000-000000000010",
}: {
  dimensionId?: string;
  evaluationMethod?: string;
  goal?: string;
  name?: string;
  projectId?: string;
} = {}) => ({
  id: dimensionId,
  project_id: projectId,
  name,
  goal,
  evaluation_method: evaluationMethod,
  created_at: "2026-04-20T09:00:00.000Z",
  updated_at: "2026-04-20T09:05:00.000Z",
});

const buildDimensionEvaluation = ({
  commitSha = "abc1234",
  createdAt = "2026-04-20T09:10:00.000Z",
  dimensionId = "dimension-readme-fit",
  evaluation = "Strong convergence evidence, missing one explicit intervention path.",
  evaluationId = "evaluation-readme-fit-1",
  score = 82,
}: {
  commitSha?: string;
  createdAt?: string;
  dimensionId?: string;
  evaluation?: string;
  evaluationId?: string;
  score?: number;
} = {}) => ({
  id: evaluationId,
  dimension_id: dimensionId,
  project_id: "00000000-0000-4000-8000-000000000010",
  commit_sha: commitSha,
  evaluator_model: "gpt-5.5",
  score,
  evaluation,
  created_at: createdAt,
});

const buildProject = ({
  gitOriginUrl = "https://github.com/example/main.git",
  globalModelId = "claude-sonnet-4-5",
  globalProviderId = "anthropic",
  name = "Main project",
  optimizerEnabled = false,
  projectId = "00000000-0000-4000-8000-000000000010",
  tokenBudgetLimit = null,
  tokenWarningThreshold = null,
  costWarningThreshold = null,
}: {
  costWarningThreshold?: number | null;
  gitOriginUrl?: string;
  globalModelId?: string;
  globalProviderId?: string;
  name?: string;
  optimizerEnabled?: boolean;
  projectId?: string;
  tokenBudgetLimit?: number | null;
  tokenWarningThreshold?: number | null;
} = {}) => ({
  id: projectId,
  name,
  git_origin_url: gitOriginUrl,
  global_provider_id: globalProviderId,
  global_model_id: globalModelId,
  optimizer_enabled: optimizerEnabled,
  token_budget_limit: tokenBudgetLimit,
  token_warning_threshold: tokenWarningThreshold,
  cost_warning_threshold: costWarningThreshold,
  created_at: "2026-04-26T00:00:00.000Z",
  updated_at: "2026-04-26T00:00:00.000Z",
});

const buildDirectorClarification = ({
  clarificationId = "clarification-1",
  createdAt = "2026-04-28T10:00:00.000Z",
  dimensionId = null,
  kind = "clarification",
  message = "Clarify whether the README fit gap should be prioritized.",
  projectId = "00000000-0000-4000-8000-000000000010",
  status = "open",
}: {
  clarificationId?: string;
  createdAt?: string;
  dimensionId?: string | null;
  kind?: "clarification" | "adjustment";
  message?: string;
  projectId?: string;
  status?: "open" | "addressed" | "dismissed";
} = {}) => ({
  id: clarificationId,
  project_id: projectId,
  dimension_id: dimensionId,
  kind,
  message,
  status,
  created_at: createdAt,
  updated_at: createdAt,
});

const buildTaskPullRequestStatus = ({
  category = "waiting_checks",
  pullRequestUrl = "https://github.com/example/main/pull/42",
  recoveryAction = "Wait for required checks before merging.",
  summary = "Pull request is open and required checks are still running.",
}: {
  category?: string;
  pullRequestUrl?: string | null;
  recoveryAction?: string;
  summary?: string;
} = {}) => ({
  category,
  summary,
  recovery_action: recoveryAction,
  task_status: "pending",
  task_done: false,
  pull_request_url: pullRequestUrl,
});

const buildProjectTokenUsage = ({
  budgetWarning = {
    status: "not_configured",
    token_warning_threshold: null,
    cost_warning_threshold: null,
    message: null,
  },
  cost = 3.75,
  failures = [],
  input = 300,
  messages = 3,
  output = 450,
  projectId = "00000000-0000-4000-8000-000000000010",
  tokenBudget = null,
  tasks = [
    {
      task_id: "task-main",
      title: "Active main task",
      session_id: "ses_main",
      totals: {
        input: 200,
        output: 300,
        reasoning: 25,
        cache: { read: 15, write: 5 },
        total: 550,
        cost: 2.5,
        messages: 2,
      },
      failures: [],
    },
    {
      task_id: "task-resolved",
      title: "Completed project task",
      session_id: "ses_resolved",
      totals: {
        input: 100,
        output: 150,
        reasoning: 10,
        cache: { read: 5, write: 0 },
        total: 260,
        cost: 1.25,
        messages: 1,
      },
      failures: [],
    },
  ],
  total = 810,
}: {
  budgetWarning?: {
    status: "not_configured" | "within_budget" | "exceeded";
    token_warning_threshold: number | null;
    cost_warning_threshold: number | null;
    message: string | null;
  };
  cost?: number;
  failures?: Array<{
    code: "OPENCODE_MESSAGES_UNAVAILABLE";
    message: string;
    root_session_id: string;
    task_id: string;
  }>;
  input?: number;
  messages?: number;
  output?: number;
  projectId?: string;
  tokenBudget?: {
    exhausted: boolean;
    limit: number | null;
    remaining: number | null;
    used: number;
  } | null;
  tasks?: Array<{
    failures: Array<{
      code: "OPENCODE_MESSAGES_UNAVAILABLE";
      message: string;
      root_session_id: string;
      task_id: string;
    }>;
    session_id: string;
    task_id: string;
    title: string;
    totals: {
      cache: { read: number; write: number };
      cost: number;
      input: number;
      messages: number;
      output: number;
      reasoning: number;
      total: number;
    };
  }>;
  total?: number;
} = {}) => ({
  project_id: projectId,
  totals: {
    input,
    output,
    reasoning: 35,
    cache: { read: 20, write: 5 },
    total,
    cost,
    messages,
  },
  budget_warning: budgetWarning,
  token_budget: tokenBudget ?? {
    exhausted: false,
    limit: null,
    remaining: null,
    used: total,
  },
  tasks,
  sessions: tasks.map((task) => ({
    root_session_id: task.session_id,
    task_id: task.task_id,
    title: task.title,
    totals: task.totals,
    failure: task.failures[0] ?? null,
  })),
  failures,
});

const buildCoordinatorDryRunOperation = ({
  blocked = false,
  decision,
  taskId,
}: {
  blocked?: boolean;
  decision: "create" | "keep" | "delete";
  taskId?: string;
}) => {
  const base = {
    coverage_judgment: {
      status:
        decision === "keep"
          ? "covered_by_unfinished_task"
          : decision === "delete"
            ? "stale_unfinished_task"
            : "uncovered_gap",
      covered_by_task_id:
        decision === "keep" ? (taskId ?? "task-main") : undefined,
      summary:
        decision === "keep"
          ? "Current active task already covers this Manager gap."
          : decision === "delete"
            ? "Rejected feedback marks this task as stale against the current baseline."
            : "No active project task covers this Manager gap.",
    },
    dependency_conflict_plan: {
      conflict_draft: "No dependency conflict detected in dry-run evidence.",
      dependency_draft: [],
    },
    dry_run_only: true,
    must_not_write_directly: true,
    requires_task_spec_validation: decision !== "keep",
    source_dimension: {
      id: "dimension-readme-fit",
      name: "README Fit",
    },
    source_evaluation: {
      id: "evaluation-readme-fit-1",
      commit_sha: currentBaselineCommitSha,
      evaluation: "Dashboard lacks Coordinator dry-run proposal visibility.",
    },
    source_gap: "Coordinator preflight visibility gap",
    source_metadata_planning_evidence: {
      conflict_duplicate_assessment: "No duplicate dry-run proposal detected.",
      current_task_pool_coverage: "Project-scoped task pool was checked.",
      dependency_rationale: "No dependency draft is required for the summary.",
      unfinished_task_non_conflict_rationale:
        "Unfinished task evidence remains read-only.",
    },
  };

  if (decision === "keep") {
    return {
      ...base,
      decision,
      keep_reason: "Keep existing active coverage.",
      planning_feedback: null,
      task_id: taskId ?? "task-main",
      task_spec_draft: null,
    };
  }

  if (decision === "delete") {
    return {
      ...base,
      decision,
      delete_reason: "Delete stale duplicate candidate from the active pool.",
      planning_feedback: {
        blocked: false,
        reason: "Rejected feedback indicates stale planning evidence.",
        rejected_task_id: "task-rejected",
      },
      task_id: taskId ?? "task-stale",
      task_spec_draft: null,
    };
  }

  return {
    ...base,
    decision,
    planning_feedback: blocked
      ? {
          blocked: true,
          reason:
            "Blocked until Coordinator validation resolves stale rejected feedback.",
          rejected_task_id: "task-rejected",
        }
      : null,
    task_spec_draft: blocked
      ? null
      : {
          title: "Expose Coordinator dry-run proposal summary",
          spec: "# Task\nShow read-only Coordinator dry-run proposal evidence.",
        },
  };
};

const routeProjectOptimizerStatus = async (
  page: Page,
  currentBaseline: string | null,
) => {
  await page.route("**/api/projects/*/optimizer/status", async (route) => {
    const projectId =
      new URL(route.request().url()).pathname.split("/").at(3) ??
      "00000000-0000-4000-8000-000000000010";

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project_id: projectId,
        optimizer_enabled: true,
        runtime_active: true,
        blocker_summary: null,
        current_baseline_commit_sha: currentBaseline,
        recent_events: [],
        token_usage: {
          availability: "no_sessions",
          failed_root_session_count: 0,
          failure_summary: null,
          root_session_count: 0,
          totals: {
            cache: { read: 0, write: 0 },
            cost: 0,
            input: 0,
            messages: 0,
            output: 0,
            reasoning: 0,
            total: 0,
          },
          budget_warning: {
            status: "not_configured",
            token_warning_threshold: null,
            cost_warning_threshold: null,
            message: null,
          },
          token_budget: {
            exhausted: false,
            limit: null,
            remaining: null,
            used: 0,
          },
        },
      }),
    });
  });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("aim.serverBaseUrl", "/api");
    window.localStorage.setItem("aim.web.locale", "en");
  });

  await page.route("**/api/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? [
                buildTask({
                  done: true,
                  result: "Merged and verified.",
                  spec: "Completed project task",
                  status: "resolved",
                  taskId: "task-resolved",
                }),
              ]
            : [
                buildTask({
                  dependencies: ["task-resolved"],
                  spec: "Active main task",
                  taskId: "task-main",
                }),
                buildTask({
                  gitOriginUrl: "https://github.com/example/research.git",
                  projectId: "00000000-0000-4000-8000-000000000011",
                  spec: "Research project task",
                  taskId: "task-research",
                }),
              ],
      }),
    });
  });

  await page.route("**/api/tasks/*/pull_request_status", async (route) => {
    const taskId = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2) ?? "task-main",
    );

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        buildTaskPullRequestStatus({
          pullRequestUrl: null,
          summary: `No pull request recorded for ${taskId}.`,
          recoveryAction:
            "Create or link a pull request before merge follow-up.",
          category: "no_pull_request",
        }),
      ),
    });
  });

  await page.route("**/api/projects**", async (route) => {
    if (new URL(route.request().url()).pathname.includes("/director/")) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildProject(),
          buildProject({
            globalModelId: "gpt-5.5",
            globalProviderId: "openai",
            gitOriginUrl: "https://github.com/example/research.git",
            name: "Research project",
            projectId: "00000000-0000-4000-8000-000000000011",
          }),
        ],
      }),
    });
  });

  await page.route("**/api/projects/*/token-usage", async (route) => {
    const projectId =
      new URL(route.request().url()).pathname.split("/").at(3) ??
      "00000000-0000-4000-8000-000000000010";

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        buildProjectTokenUsage({
          cost: 0,
          input: 0,
          messages: 0,
          output: 0,
          projectId,
          tasks: [],
          total: 0,
        }),
      ),
    });
  });

  await page.route(
    "**/api/projects/*/director/clarifications",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            buildDirectorClarification({
              message: "Clarify whether target-gap coverage needs a replan.",
            }),
          ],
        }),
      });
    },
  );

  await page.route("**/api/dimensions**", async (route) => {
    const projectId = new URL(route.request().url()).searchParams.get(
      "project_id",
    );
    const dimensions = [
      buildDimension(),
      buildDimension({
        dimensionId: "dimension-research-fit",
        name: "Research Fit",
        projectId: "00000000-0000-4000-8000-000000000011",
      }),
    ].filter(
      (dimension) => projectId === null || dimension.project_id === projectId,
    );

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: dimensions }),
    });
  });

  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [buildDimensionEvaluation()] }),
    });
  });

  await page.route("**/api/task_write_bulks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route("**/api/opencode/sessions**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            session_id: "ses_pending_review",
            state: "pending",
            value: "Waiting on required checks.",
            reason: null,
            continue_prompt: "Continue with required checks follow-up.",
            provider_id: "anthropic",
            model_id: "claude-sonnet-4-5",
            ...zeroOpenCodeSessionTokens,
            stale: true,
            created_at: "2026-04-27T08:00:00.000Z",
            updated_at: "2026-04-27T09:30:00.000Z",
          },
          {
            session_id: "ses_resolved_delivery",
            state: "resolved",
            value: "PR merged and baseline refreshed.",
            reason: null,
            continue_prompt: null,
            provider_id: null,
            model_id: null,
            ...zeroOpenCodeSessionTokens,
            stale: false,
            created_at: "2026-04-26T08:00:00.000Z",
            updated_at: "2026-04-26T11:30:00.000Z",
          },
          {
            session_id: "ses_rejected_scope",
            state: "rejected",
            value: null,
            reason: "Spec no longer matches origin/main.",
            continue_prompt: null,
            provider_id: null,
            model_id: null,
            ...zeroOpenCodeSessionTokens,
            stale: false,
            created_at: "2026-04-25T08:00:00.000Z",
            updated_at: "2026-04-25T09:00:00.000Z",
          },
        ],
      }),
    });
  });
});

test("renders a simplified top-level dashboard for projects and dimensions", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { exact: true, name: "Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByText("Multi-project observability and global settings."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dimensions" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Project observability" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "AIM Dimension report" }),
  ).toBeVisible();
  await expect(page.getByText("2 projects")).toBeVisible();
  await expect(page.getByText("2 dimensions")).toBeVisible();
  await expect(
    page.getByText("Pending 1 / Resolved 1 / Rejected 1"),
  ).toBeVisible();
  const resultRegion = page.getByRole("region", {
    name: "Project result quality",
  });
  await expect(resultRegion).toBeVisible();
  await expect(
    resultRegion.getByText("Task outcome summary", { exact: true }),
  ).toBeVisible();
  await expect(
    resultRegion.getByText("Success Rate", { exact: true }),
  ).toBeVisible();
  await expect(resultRegion.getByText("100%", { exact: true })).toBeVisible();
  await expect(
    resultRegion.getByText("1 resolved and 0 rejected in completed history."),
  ).toBeVisible();
  await expect(resultRegion.getByText("Gap / Blocker Signal")).toBeVisible();
  await expect(page.getByText("OpenCode Pending")).toHaveCount(0);
  await expect(page.getByText("OpenCode Resolved")).toHaveCount(0);
  await expect(page.getByText("OpenCode Rejected")).toHaveCount(0);

  for (const removedLabel of [
    "Task Write Bulks",
    "Rejected Feedback Signals",
    "Recent Active Tasks",
    "Evidence Ledger",
    "Decision Observability",
    "Intervention Rail",
  ]) {
    await expect(page.getByText(removedLabel, { exact: true })).toHaveCount(0);
  }
});

test("shows a clear project overview empty state when no task history exists", async ({
  page,
}) => {
  await page.route("**/api/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? []
            : [
                buildTask({
                  spec: "Active main task",
                  taskId: "task-main",
                }),
              ],
      }),
    });
  });

  await page.goto("/");

  const resultRegion = page.getByRole("region", {
    name: "Project result quality",
  });
  await expect(resultRegion).toBeVisible();
  await expect(resultRegion.getByText("No history")).toBeVisible();
  await expect(
    resultRegion.getByText("No completed task history is available yet."),
  ).toBeVisible();
  await expect(
    resultRegion.getByText(
      "Result quality will appear here after AIM records a completed task.",
    ),
  ).toBeVisible();
});

test("summarizes mixed resolved and rejected task history in the overview", async ({
  page,
}) => {
  await page.route("**/api/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? [
                buildTask({
                  done: true,
                  result: "Merged and verified.",
                  spec: "Completed resolved project task",
                  status: "resolved",
                  taskId: "task-resolved",
                }),
                buildTask({
                  done: true,
                  result:
                    "Rejected because the spec no longer matched baseline.",
                  spec: "Completed rejected project task",
                  status: "rejected",
                  taskId: "task-rejected",
                }),
              ]
            : [
                buildTask({
                  dependencies: ["task-resolved"],
                  spec: "Active main task",
                  taskId: "task-main",
                }),
              ],
      }),
    });
  });

  await page.goto("/");

  const resultRegion = page.getByRole("region", {
    name: "Project result quality",
  });
  await expect(resultRegion.getByText("50%", { exact: true })).toBeVisible();
  await expect(
    resultRegion.getByText("1 resolved and 1 rejected in completed history."),
  ).toBeVisible();
  await expect(
    resultRegion.getByText("2 signals", { exact: true }),
  ).toBeVisible();
  await expect(
    resultRegion.getByText(
      "1 active dependency-linked tasks and 1 rejected history items may need Manager/Coordinator attention.",
    ),
  ).toBeVisible();
});

test("opens project detail with project-scoped dimensions and task pool stats", async ({
  page,
}) => {
  await page.goto("/#/projects");

  await page.getByRole("link", { name: "Open Main project" }).click();

  await expect(page).toHaveURL(
    /\/#\/projects\/00000000-0000-4000-8000-000000000010$/,
  );
  await expect(
    page.getByRole("heading", { name: "Project Detail" }),
  ).toBeVisible();
  await expect(page.getByText("Main project", { exact: true })).toBeVisible();
  await expect(
    page.getByText("https://github.com/example/main.git"),
  ).toBeVisible();
  await expect(page.getByText("1 active task")).toBeVisible();
  await expect(page.getByText("1 completed task")).toBeVisible();
  await expect(page.getByText("1 dependency-linked task")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Project dimensions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "README Fit" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Research Fit")).toHaveCount(0);
});

test("shows project token totals, heaviest task attribution, and partial failure details", async ({
  page,
}) => {
  await page.route("**/api/projects/*/token-usage", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        buildProjectTokenUsage({
          failures: [
            {
              code: "OPENCODE_MESSAGES_UNAVAILABLE",
              message:
                "OpenCode messages are temporarily unavailable; retry after the session store recovers.",
              root_session_id: "ses_unavailable_root",
              task_id: "task-main",
            },
          ],
        }),
      ),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const usage = page.getByRole("region", { name: "Project token usage" });

  await expect(usage).toBeVisible();
  await expect(usage.getByText("810 tokens", { exact: true })).toBeVisible();
  await expect(usage.getByText("$3.75", { exact: true })).toBeVisible();
  await expect(usage.getByText("Input 300 / Output 450")).toBeVisible();
  await expect(usage.getByText("3 messages", { exact: true })).toBeVisible();
  await expect(usage.getByText("Heaviest task")).toBeVisible();
  await expect(
    usage.getByText("Active main task", { exact: true }),
  ).toBeVisible();
  await expect(usage.getByText("550 tokens / $2.50")).toBeVisible();
  await expect(usage.getByText("1 usage lookup failed")).toBeVisible();
  await expect(
    usage.getByText("task-main / ses_unavailable_root"),
  ).toBeVisible();
  await expect(
    usage.getByText(
      "OpenCode messages are temporarily unavailable; retry after the session store recovers.",
    ),
  ).toBeVisible();
});

test("shows project token budget warning when configured thresholds are exceeded", async ({
  page,
}) => {
  await page.route("**/api/projects/*/token-usage", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        buildProjectTokenUsage({
          budgetWarning: {
            status: "exceeded",
            token_warning_threshold: 800,
            cost_warning_threshold: 5,
            message:
              "Project token usage exceeds the configured token warning threshold.",
          },
        }),
      ),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const usage = page.getByRole("region", { name: "Project token usage" });

  await expect(usage.getByText("Budget warning")).toBeVisible();
  await expect(
    usage.getByText(
      "Project token usage exceeds the configured token warning threshold.",
    ),
  ).toBeVisible();
  await expect(usage.getByText("Token threshold 800 tokens")).toBeVisible();
  await expect(usage.getByText("Cost threshold $5.00")).toBeVisible();
});

test("shows project token usage empty and query failure states", async ({
  page,
}) => {
  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  let usage = page.getByRole("region", { name: "Project token usage" });

  await expect(usage).toBeVisible();
  await expect(usage.getByText("No token usage recorded")).toBeVisible();
  await expect(
    usage.getByText(
      "Project token and cost totals will appear after AIM records OpenCode usage for this project.",
    ),
  ).toBeVisible();

  await page.route("**/api/projects/*/token-usage", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 503,
      body: JSON.stringify({
        code: "OPENCODE_MESSAGES_UNAVAILABLE",
        message: "OpenCode usage service is unavailable.",
      }),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000011");

  usage = page.getByRole("region", { name: "Project token usage" });

  await expect(usage).toBeVisible();
  await expect(usage.getByText("Token usage unavailable")).toBeVisible();
  await expect(
    usage.getByText("Refresh project-scoped usage and retry."),
  ).toBeVisible();
});

test("keeps project token usage isolated to the selected project", async ({
  page,
}) => {
  const requestedProjectIds: string[] = [];

  await page.route("**/api/projects/*/token-usage", async (route) => {
    const projectId =
      new URL(route.request().url()).pathname.split("/").at(3) ?? "";

    requestedProjectIds.push(projectId);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        projectId === "00000000-0000-4000-8000-000000000011"
          ? buildProjectTokenUsage({
              cost: 9.99,
              input: 900,
              messages: 1,
              output: 99,
              projectId,
              tasks: [
                {
                  task_id: "task-research",
                  title: "Research project task",
                  session_id: "ses_research",
                  totals: {
                    input: 900,
                    output: 99,
                    reasoning: 0,
                    cache: { read: 0, write: 0 },
                    total: 999,
                    cost: 9.99,
                    messages: 1,
                  },
                  failures: [],
                },
              ],
              total: 999,
            })
          : buildProjectTokenUsage({ projectId }),
      ),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000011");

  const usage = page.getByRole("region", { name: "Project token usage" });

  await expect(usage.getByText("999 tokens", { exact: true })).toBeVisible();
  await expect(usage.getByText("$9.99", { exact: true })).toBeVisible();
  await expect(usage.getByText("Research project task")).toBeVisible();
  await expect(usage.getByText("810 tokens", { exact: true })).toHaveCount(0);
  await expect
    .poll(() => requestedProjectIds)
    .toEqual(["00000000-0000-4000-8000-000000000011"]);
});

test("shows read-only Coordinator dry-run proposal summary without task batch writes", async ({
  page,
}) => {
  const dryRunRequests: unknown[] = [];
  const taskBatchRequests: unknown[] = [];

  await page.route("**/api/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? [
                buildTask({
                  done: true,
                  result: "Merged and verified.",
                  spec: "Completed project task",
                  status: "resolved",
                  taskId: "task-resolved",
                }),
                buildTask({
                  done: true,
                  pullRequestUrl: "https://github.com/example/main/pull/21",
                  result:
                    "Rejected because stale planning evidence overlapped.",
                  spec: "Rejected project dry-run feedback",
                  status: "rejected",
                  taskId: "task-rejected",
                }),
                buildTask({
                  done: true,
                  gitOriginUrl: "https://github.com/example/research.git",
                  projectId: "00000000-0000-4000-8000-000000000011",
                  result: "Rejected research feedback outside this project.",
                  spec: "Rejected research task",
                  status: "rejected",
                  taskId: "task-research-rejected",
                }),
              ]
            : [
                buildTask({
                  dependencies: ["task-resolved"],
                  pullRequestUrl: "https://github.com/example/main/pull/20",
                  spec: "Active main task",
                  taskId: "task-main",
                  worktreePath: "/repo/.worktrees/task-main",
                }),
                buildTask({
                  gitOriginUrl: "https://github.com/example/research.git",
                  projectId: "00000000-0000-4000-8000-000000000011",
                  spec: "Research project task",
                  taskId: "task-research",
                }),
              ],
      }),
    });
  });
  await page.route("**/api/tasks/batch", async (route) => {
    taskBatchRequests.push({
      method: route.request().method(),
      body: route.request().postData(),
    });
    await route.fulfill({
      contentType: "application/json",
      status: 500,
      body: JSON.stringify({
        code: "UNEXPECTED_TASK_BATCH_WRITE",
        message: "The dry-run summary must not write Tasks.",
      }),
    });
  });
  await page.route("**/api/coordinator/proposals/dry-run", async (route) => {
    dryRunRequests.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        dry_run: true,
        operations: [
          buildCoordinatorDryRunOperation({ decision: "create" }),
          buildCoordinatorDryRunOperation({
            decision: "create",
            blocked: true,
          }),
          buildCoordinatorDryRunOperation({
            decision: "keep",
            taskId: "task-main",
          }),
          buildCoordinatorDryRunOperation({
            decision: "delete",
            taskId: "task-stale",
          }),
        ],
      }),
    });
  });
  await routeProjectOptimizerStatus(page, currentBaselineCommitSha);

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const dryRunRegion = page.getByRole("region", {
    name: "Coordinator dry-run proposal summary",
  });
  await expect(dryRunRegion).toBeVisible();
  await expect(
    dryRunRegion.getByText("Create 2", { exact: true }),
  ).toBeVisible();
  await expect(dryRunRegion.getByText("Keep 1", { exact: true })).toBeVisible();
  await expect(
    dryRunRegion.getByText("Delete 1", { exact: true }),
  ).toBeVisible();
  await expect(
    dryRunRegion.getByText("Blocked 1", { exact: true }),
  ).toBeVisible();
  await expect(
    dryRunRegion.getByText("No active project task covers this Manager gap."),
  ).toHaveCount(2);
  await expect(
    dryRunRegion.getByText(
      "Blocked until Coordinator validation resolves stale rejected feedback.",
    ),
  ).toBeVisible();
  await expect(
    dryRunRegion.getByText(
      "Read-only dry-run evidence only: candidates still require Task Spec validation and approved POST /tasks/batch outside the GUI.",
    ),
  ).toBeVisible();
  await expect.poll(() => dryRunRequests.length).toBe(1);
  expect(dryRunRequests[0]).toMatchObject({
    project_id: "00000000-0000-4000-8000-000000000010",
    currentBaselineCommit: currentBaselineCommitSha,
    taskPool: [
      expect.objectContaining({
        task_id: "task-main",
        worktree_path: "/repo/.worktrees/task-main",
        pull_request_url: "https://github.com/example/main/pull/20",
      }),
    ],
    rejectedTasks: [
      expect.objectContaining({
        task_id: "task-rejected",
        worktree_path: null,
        pull_request_url: "https://github.com/example/main/pull/21",
      }),
    ],
    staleTaskFeedback: [
      expect.objectContaining({
        reason: "Rejected because stale planning evidence overlapped.",
        task: expect.objectContaining({
          task_id: "task-rejected",
          worktree_path: null,
          pull_request_url: "https://github.com/example/main/pull/21",
        }),
      }),
    ],
  });
  expect(taskBatchRequests).toEqual([]);
});

test("shows an actionable Coordinator dry-run error state when the API rejects the request", async ({
  page,
}) => {
  await page.route("**/api/coordinator/proposals/dry-run", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 400,
      body: JSON.stringify({
        code: "TASK_VALIDATION_ERROR",
        message: "currentBaselineCommit is required for dry-run planning.",
      }),
    });
  });
  await routeProjectOptimizerStatus(page, currentBaselineCommitSha);

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const dryRunRegion = page.getByRole("region", {
    name: "Coordinator dry-run proposal summary",
  });
  await expect(dryRunRegion).toBeVisible();
  await expect(
    dryRunRegion.getByText("Coordinator dry-run unavailable"),
  ).toBeVisible();
  await expect(
    dryRunRegion.getByText(
      "Refresh project-scoped dashboard evidence and retry Coordinator preflight.",
    ),
  ).toBeVisible();
});

test("submits a project Director clarification and shows recent request status", async ({
  page,
}) => {
  const requests: unknown[] = [];
  const statusRequests: unknown[] = [];
  let clarifications = [
    buildDirectorClarification({
      clarificationId: "clarification-existing",
      message: "Clarify whether target-gap coverage needs a replan.",
    }),
  ];

  await page.route(
    "**/api/projects/*/director/clarifications/*",
    async (route) => {
      const request = route.request();
      const clarificationId = decodeURIComponent(
        new URL(request.url()).pathname.split("/").at(-1) ?? "",
      );
      const payload = JSON.parse(request.postData() ?? "{}") as {
        status: "open" | "addressed" | "dismissed";
      };

      statusRequests.push({ clarificationId, ...payload });
      clarifications = clarifications.map((clarification) =>
        clarification.id === clarificationId
          ? {
              ...clarification,
              status: payload.status,
              updated_at: "2026-04-28T11:05:00.000Z",
            }
          : clarification,
      );

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          clarifications.find(
            (clarification) => clarification.id === clarificationId,
          ),
        ),
      });
    },
  );

  await page.route(
    "**/api/projects/*/director/clarifications",
    async (route) => {
      if (route.request().method() === "POST") {
        const payload = JSON.parse(route.request().postData() ?? "{}") as {
          dimension_id?: string | null;
          kind: "clarification" | "adjustment";
          message: string;
          project_id: string;
        };

        requests.push(payload);
        const createdClarification = buildDirectorClarification({
          clarificationId: "clarification-created",
          createdAt: "2026-04-28T11:00:00.000Z",
          dimensionId: payload.dimension_id ?? null,
          kind: payload.kind,
          message: payload.message,
          projectId: payload.project_id,
        });
        clarifications = [createdClarification, ...clarifications];

        await route.fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify(createdClarification),
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: clarifications }),
      });
    },
  );

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const panel = page.getByRole("region", {
    name: "Director clarification requests",
  });

  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("Clarify whether target-gap coverage needs a replan."),
  ).toBeVisible();
  await expect(panel.getByText("open", { exact: true }).first()).toBeVisible();
  await panel.getByLabel("Request type").selectOption("adjustment");
  await panel
    .getByLabel("Request message")
    .fill("Adjust the next scan toward baseline freshness evidence.");
  await panel.getByRole("button", { name: "Send request" }).click();

  await expect(panel.getByText("Request recorded")).toBeVisible();
  await expect(
    panel.getByText("Adjust the next scan toward baseline freshness evidence."),
  ).toBeVisible();
  await expect
    .poll(() => requests)
    .toEqual([
      {
        project_id: "00000000-0000-4000-8000-000000000010",
        dimension_id: null,
        kind: "adjustment",
        message: "Adjust the next scan toward baseline freshness evidence.",
      },
    ]);

  await panel.getByRole("button", { name: "Mark resolved" }).first().click();
  await expect(
    panel.getByText("addressed", { exact: true }).first(),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Reopen" }).first().click();
  await expect(panel.getByText("open", { exact: true }).first()).toBeVisible();
  await expect
    .poll(() => statusRequests)
    .toEqual([
      { clarificationId: "clarification-created", status: "addressed" },
      { clarificationId: "clarification-created", status: "open" },
    ]);
});

test("shows Director clarification status errors with localized actions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("aim.web.locale", "zh");
  });
  await page.route(
    "**/api/projects/*/director/clarifications/*",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 503,
        body: JSON.stringify({
          code: "DIRECTOR_CLARIFICATION_VALIDATION_ERROR",
          message: "Director clarification status store is unavailable.",
        }),
      });
    },
  );
  await page.route(
    "**/api/projects/*/director/clarifications",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            buildDirectorClarification({
              clarificationId: "clarification-status-error",
              message: "Clarify whether target-gap coverage needs a replan.",
            }),
          ],
        }),
      });
    },
  );

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const panel = page.getByRole("region", { name: "Director 澄清请求" });

  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "标记已处理" }).click();
  await expect(panel.getByText("澄清状态更新失败")).toBeVisible();
  await expect(
    panel.getByText("Director clarification status store is unavailable."),
  ).toBeVisible();
});

test("shows actionable API errors and keeps the Director clarification panel mobile safe", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 390 });
  await page.route(
    "**/api/projects/*/director/clarifications",
    async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          contentType: "application/json",
          status: 503,
          body: JSON.stringify({
            code: "DIRECTOR_CLARIFICATION_VALIDATION_ERROR",
            message: "Director clarification store is temporarily unavailable.",
          }),
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    },
  );

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const panel = page.getByRole("region", {
    name: "Director clarification requests",
  });

  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("No recent Director clarification requests"),
  ).toBeVisible();
  await panel
    .getByLabel("Request message")
    .fill("Clarify the rejected feedback recovery path.");
  await panel.getByRole("button", { name: "Send request" }).click();

  await expect(
    panel.getByText("Clarification request failed", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("Director clarification store is temporarily unavailable."),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("shows task source baseline freshness for current, stale, and missing metadata", async ({
  page,
}) => {
  await page.route("**/api/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? []
            : [
                buildTask({
                  spec: "Current source baseline task",
                  taskId: "task-current-source",
                }),
                buildTask({
                  sourceBaselineFreshness: {
                    current_commit: "fc284b9aa5ff780228c625011d4714f9e6771622",
                    source_commit: "45eeecbf2a0c2d33dd9dd4896fc8dd6d6b9ded13",
                    status: "stale",
                    summary:
                      "Task source baseline 45eeecbf2a0c2d33dd9dd4896fc8dd6d6b9ded13 differs from current origin/main fc284b9aa5ff780228c625011d4714f9e6771622",
                  },
                  spec: "Stale source baseline task",
                  taskId: "task-stale-source",
                }),
                buildTask({
                  sourceBaselineFreshness: {
                    current_commit: "fc284b9aa5ff780228c625011d4714f9e6771622",
                    source_commit: null,
                    status: "unknown",
                    summary:
                      "Task source baseline metadata is missing latest_origin_main_commit",
                  },
                  spec: "Missing source baseline task",
                  taskId: "task-missing-source",
                }),
              ],
      }),
    });
  });

  await page.goto("/#/tasks/task-current-source");
  await expect(page.getByText("Source Baseline: current")).toBeVisible();

  await page.goto("/#/tasks/task-stale-source");
  await expect(page.getByText("Source Baseline: stale")).toBeVisible();
  await expect(
    page.getByText(
      "Task source baseline 45eeecbf2a0c2d33dd9dd4896fc8dd6d6b9ded13 differs from current origin/main fc284b9aa5ff780228c625011d4714f9e6771622",
    ),
  ).toBeVisible();

  await page.goto("/#/tasks/task-missing-source");
  await expect(page.getByText("Source Baseline: unknown")).toBeVisible();
  await expect(
    page.getByText(
      "Task source baseline metadata is missing latest_origin_main_commit",
    ),
  ).toBeVisible();
});

test("shows the selected task pull request follow-up status", async ({
  page,
}) => {
  await page.route("**/api/tasks/*/pull_request_status", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        buildTaskPullRequestStatus({
          category: "waiting_checks",
          recoveryAction: "Wait for required checks to finish, then merge.",
          summary: "Pull request #42 is waiting for required checks.",
        }),
      ),
    });
  });

  await page.goto("/#/tasks/task-main");

  const status = page.getByRole("region", { name: "Pull Request Status" });

  await expect(status.getByText("Loading pull request status")).toBeVisible();
  await expect(status.getByText("waiting_checks")).toBeVisible();
  await expect(
    status.getByText("Pull request #42 is waiting for required checks."),
  ).toBeVisible();
  await expect(
    status.getByText("Wait for required checks to finish, then merge."),
  ).toBeVisible();
});

test("summarizes active task pull request follow-up status in the table", async ({
  page,
}) => {
  await page.route("**/api/tasks/*/pull_request_status", async (route) => {
    const taskId = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2) ?? "",
    );

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        taskId === "task-main"
          ? buildTaskPullRequestStatus({
              category: "waiting_checks",
              recoveryAction: "Continue with required checks follow-up.",
              summary: "Pull request #42 is waiting for required checks.",
            })
          : buildTaskPullRequestStatus({
              category: "no_pull_request",
              pullRequestUrl: null,
              recoveryAction:
                "Create or link a pull request before merge follow-up.",
              summary: "No pull request exists for the research task.",
            }),
      ),
    });
  });

  await page.goto("/");

  const taskTable = page.getByRole("heading", {
    name: "Active Unfinished Tasks",
  });

  await expect(taskTable).toBeVisible();
  await expect(page.getByText("PR Follow-up")).toBeVisible();
  await expect(page.getByText("waiting_checks")).toBeVisible();
  await expect(
    page.getByText("Pull request #42 is waiting for required checks."),
  ).toBeVisible();
  await expect(
    page.getByText("Continue with required checks follow-up."),
  ).toBeVisible();
  await expect(page.getByText("no_pull_request")).toBeVisible();
  await expect(
    page.getByText("No pull request is linked to this task."),
  ).toBeVisible();
});

test("shows active task pull request loading and error summaries", async ({
  page,
}) => {
  let resolveMainStatus: () => void = () => undefined;
  const mainStatusReady = new Promise<void>((resolve) => {
    resolveMainStatus = resolve;
  });

  await page.route("**/api/tasks/*/pull_request_status", async (route) => {
    const taskId = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2) ?? "",
    );

    if (taskId === "task-main") {
      await mainStatusReady;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          buildTaskPullRequestStatus({
            category: "review_blocked",
            summary: "Pull request #42 is waiting for review.",
          }),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "TASK_VALIDATION_ERROR",
        message: "GitHub status lookup timed out.",
      }),
    });
  });

  await page.goto("/");

  await expect(
    page.getByText("Loading pull request status").first(),
  ).toBeVisible();
  resolveMainStatus();
  await expect(page.getByText("review_blocked")).toBeVisible();
  await expect(
    page.getByText(
      "Pull request status unavailable: GitHub status lookup timed out.",
    ),
  ).toBeVisible();
});

test("shows pull request status errors without hiding task relationships", async ({
  page,
}) => {
  await page.route("**/api/tasks/*/pull_request_status", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "TASK_VALIDATION_ERROR",
        message: "GitHub status lookup timed out.",
      }),
    });
  });

  await page.goto("/#/tasks/task-main");

  const relationships = page.getByText("task-resolved", { exact: true });
  const status = page.getByRole("region", { name: "Pull Request Status" });

  await expect(relationships).toBeVisible();
  await expect(
    status.getByText(
      "Pull request status unavailable: GitHub status lookup timed out.",
    ),
  ).toBeVisible();
});

test("keeps pull request status isolated when switching tasks", async ({
  page,
}) => {
  const requests: string[] = [];

  await page.route("**/api/tasks/*/pull_request_status", async (route) => {
    const taskId = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2) ?? "",
    );

    requests.push(taskId);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        taskId === "task-research"
          ? buildTaskPullRequestStatus({
              category: "no_pull_request",
              pullRequestUrl: null,
              recoveryAction: "Create a PR when the research task is ready.",
              summary: "No pull request exists for the research task.",
            })
          : buildTaskPullRequestStatus({
              category: "ready_to_merge",
              recoveryAction: "Merge after Director confirmation.",
              summary: "Pull request #42 is ready to merge.",
            }),
      ),
    });
  });

  await page.goto("/#/tasks/task-main");

  const status = page.getByRole("region", { name: "Pull Request Status" });

  await expect(status.getByText("ready_to_merge")).toBeVisible();
  await expect(
    status.getByText("Pull request #42 is ready to merge."),
  ).toBeVisible();

  await page.goto("/#/tasks/task-research");

  await expect(status.getByText("no_pull_request")).toBeVisible();
  await expect(
    status.getByText("No pull request exists for the research task."),
  ).toBeVisible();
  await expect(
    status.getByText("No pull request is linked to this task."),
  ).toBeVisible();
  await expect(
    status.getByText("Pull request #42 is ready to merge."),
  ).toHaveCount(0);
  expect(requests).toEqual(["task-main", "task-research"]);
});

test("shows project optimizer config and runtime observability separately", async ({
  page,
}) => {
  await page.route("**/api/projects**", async (route) => {
    if (new URL(route.request().url()).pathname.includes("/director/")) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [buildProject({ optimizerEnabled: true })],
      }),
    });
  });
  await page.route("**/api/projects/*/optimizer/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project_id: "00000000-0000-4000-8000-000000000010",
        optimizer_enabled: true,
        runtime_active: false,
        blocker_summary:
          "Optimizer lane developer_follow_up error: gh failed with token [REDACTED]. Check optimizer logs and fix the lane blocker before expecting new scans.",
        token_usage: {
          availability: "partial",
          failed_root_session_count: 1,
          failure_summary: "Token usage unavailable for 1 of 2 root sessions.",
          root_session_count: 2,
          totals: {
            cache: { read: 30, write: 40 },
            cost: 1.25,
            input: 10,
            messages: 1,
            output: 20,
            reasoning: 5,
            total: 105,
          },
          budget_warning: {
            status: "not_configured",
            token_warning_threshold: null,
            cost_warning_threshold: null,
            message: null,
          },
          token_budget: {
            exhausted: false,
            limit: null,
            remaining: null,
            used: 105,
          },
        },
        recent_events: [
          {
            event: "failure",
            lane_name: "developer",
            summary:
              "Developer lane failed for task task-lane-history: gh failed. Fix the task session blocker and retry assignment.",
            task_id: "task-lane-history",
            timestamp: "2026-04-29T10:00:00.000Z",
          },
          {
            event: "idle",
            lane_name: "coordinator",
            summary:
              "Coordinator lane idle: coordinator session already active.",
            timestamp: "2026-04-29T09:59:00.000Z",
          },
        ],
      }),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const optimizerRegion = page.getByRole("region", {
    name: "Project optimizer runtime",
  });

  await expect(optimizerRegion).toBeVisible();
  await expect(optimizerRegion.getByText("Config enabled")).toBeVisible();
  await expect(
    optimizerRegion.getByText("Runtime inactive", { exact: true }),
  ).toBeVisible();
  await expect(optimizerRegion.getByText("Triggers")).toHaveCount(0);
  await expect(optimizerRegion.getByText("Recent event")).toHaveCount(0);
  await expect(optimizerRegion.getByText("Recent scan")).toHaveCount(0);
  await expect(optimizerRegion.getByText("Recent lane events")).toBeVisible();
  await expect(optimizerRegion.getByText("developer failure")).toBeVisible();
  await expect(optimizerRegion.getByText("coordinator idle")).toBeVisible();
  await expect(
    optimizerRegion.getByText("Fix the task session blocker"),
  ).toBeVisible();
  await expect(
    optimizerRegion.getByText("task-lane-history", { exact: true }),
  ).toBeVisible();
  await expect(optimizerRegion.getByText("Check optimizer logs")).toBeVisible();
  await expect(optimizerRegion.getByText("Token usage status")).toBeVisible();
  await expect(optimizerRegion.getByText("Partial usage data")).toBeVisible();
  await expect(optimizerRegion.getByText("105 tokens / $1.25")).toBeVisible();
  await expect(
    optimizerRegion.getByText(
      "Token usage unavailable for 1 of 2 root sessions.",
    ),
  ).toBeVisible();
  await expect(optimizerRegion.getByText("[REDACTED]")).toBeVisible();
  await expect(optimizerRegion.getByText("ghp_1234567890")).toHaveCount(0);
});

test("summarizes when the main target gap is already covered by unfinished tasks", async ({
  page,
}) => {
  await page.route("**/api/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? []
            : [
                buildTask({
                  spec: "Add explicit accessibility gap path to the Director dashboard",
                  taskId: "task-accessibility-gap",
                }),
              ],
      }),
    });
  });
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildDimensionEvaluation({
            evaluation:
              "Accessibility gap path is missing from the Director dashboard.",
            score: 43,
          }),
        ],
      }),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const cockpit = page.getByRole("region", { name: "Target-gap cockpit" });

  await expect(cockpit).toBeVisible();
  await expect(cockpit.getByText("Main current gap")).toBeVisible();
  await expect(
    cockpit.getByText(
      "Accessibility gap path is missing from the Director dashboard.",
    ),
  ).toBeVisible();
  await expect(cockpit.getByText("Covered by unfinished tasks")).toBeVisible();
  await expect(cockpit.getByText("Wait for Developer")).toBeVisible();
});

test("warns Director when rejected feedback indicates stale or duplicate coverage risk", async ({
  page,
}) => {
  await page.route("**/api/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? [
                buildTask({
                  done: true,
                  result:
                    "Rejected: stale spec and duplicate coverage overlaps the active task.",
                  spec: "Rejected duplicate dashboard gap task",
                  status: "rejected",
                  taskId: "task-rejected-duplicate",
                }),
              ]
            : [
                buildTask({
                  spec: "Improve dashboard gap coverage",
                  taskId: "task-gap-coverage",
                }),
              ],
      }),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const cockpit = page.getByRole("region", { name: "Target-gap cockpit" });

  await expect(cockpit.getByText("Rejected feedback risk")).toBeVisible();
  await expect(
    cockpit.getByText("Stale or duplicate coverage risk"),
  ).toBeVisible();
  await expect(cockpit.getByText("Ask Coordinator to replan")).toBeVisible();
});

test("exposes the visible dimension evaluation path for the current gap", async ({
  page,
}) => {
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildDimensionEvaluation({
            evaluation:
              "Planning gap path is visible but has no decision summary yet.",
            score: 38,
          }),
        ],
      }),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const cockpit = page.getByRole("region", { name: "Target-gap cockpit" });

  await expect(cockpit.getByText("README Fit", { exact: true })).toBeVisible();
  await expect(cockpit.getByText("38/100", { exact: true })).toBeVisible();
  await expect(
    cockpit.getByRole("link", { name: "Review README Fit gap path" }),
  ).toHaveAttribute("href", "#/dimensions/dimension-readme-fit");
});

test("labels a dimension evaluation as current when it matches the baseline", async ({
  page,
}) => {
  await routeProjectOptimizerStatus(page, currentBaselineCommitSha);
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildDimensionEvaluation({ commitSha: currentBaselineCommitSha }),
        ],
      }),
    });
  });

  await page.goto("/");

  const report = page.getByRole("region", { name: "AIM Dimension report" });

  await expect(report.getByText("Current baseline evaluated")).toBeVisible();
  await expect(
    report.getByText("Evaluation commit: 10c965007a96"),
  ).toBeVisible();

  await page.getByRole("button", { name: "README Fit" }).click();

  const freshness = page.getByRole("region", {
    name: "Current baseline evaluated",
  });

  await expect(freshness).toBeVisible();
  await expect(
    freshness.getByText(
      "Latest evaluation matches the current origin/main baseline.",
    ),
  ).toBeVisible();
  await expect(
    freshness.getByRole("link", { name: currentBaselineCommitSha }).first(),
  ).toHaveAttribute(
    "href",
    `https://github.com/example/main/commit/${currentBaselineCommitSha}`,
  );
});

test("labels a dimension evaluation as stale when it is behind the baseline", async ({
  page,
}) => {
  await routeProjectOptimizerStatus(page, currentBaselineCommitSha);
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [buildDimensionEvaluation({ commitSha: "abc1234" })],
      }),
    });
  });

  await page.goto("/#/dimensions/dimension-readme-fit");

  const freshness = page.getByRole("region", {
    name: "Stale baseline evaluation",
  });

  await expect(freshness).toBeVisible();
  await expect(
    freshness.getByText("10c965007a9682b212c6531f148a30f98cad3d2c"),
  ).toBeVisible();
  await expect(freshness.getByText("abc1234")).toBeVisible();
  await expect(
    freshness.getByText("should be treated as historical signal only"),
  ).toBeVisible();

  const trend = page.getByRole("figure", { name: "README Fit score trend" });

  await expect(
    trend.getByRole("link", { name: "abc1234" }).first(),
  ).toHaveAttribute("href", "https://github.com/example/main/commit/abc1234");
});

test("labels a dimension as missing when the current baseline has no evaluation", async ({
  page,
}) => {
  await routeProjectOptimizerStatus(page, currentBaselineCommitSha);
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/#/dimensions/dimension-readme-fit");

  const freshness = page.getByRole("region", {
    name: "No current baseline evaluation",
  });

  await expect(freshness).toBeVisible();
  await expect(freshness.getByText(currentBaselineCommitSha)).toBeVisible();
  await expect(freshness.getByText("Evaluation commit: None")).toBeVisible();
  await expect(
    freshness.getByText("this dimension has no evaluation for it yet"),
  ).toBeVisible();
});

test("labels dimension freshness as unknown when the baseline is unavailable", async ({
  page,
}) => {
  await routeProjectOptimizerStatus(page, null);
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [buildDimensionEvaluation({ commitSha: "abc1234" })],
      }),
    });
  });

  await page.goto("/#/dimensions/dimension-readme-fit");

  const freshness = page.getByRole("region", { name: "Unknown baseline" });

  await expect(freshness).toBeVisible();
  await expect(freshness.getByText("Current baseline: None")).toBeVisible();
  await expect(freshness.getByText("abc1234")).toBeVisible();
  await expect(
    freshness.getByText("evaluation freshness cannot be classified"),
  ).toBeVisible();
});

test("shows only dimension-scoped Director clarifications on a dimension detail page", async ({
  page,
}) => {
  const listRequests: string[] = [];

  await page.unroute("**/api/projects/*/director/clarifications");
  await page.route(
    "**/api/projects/*/director/clarifications**",
    async (route) => {
      const requestUrl = new URL(route.request().url());
      const dimensionId = requestUrl.searchParams.get("dimension_id");

      listRequests.push(requestUrl.search);

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items:
            dimensionId === "dimension-readme-fit"
              ? [
                  buildDirectorClarification({
                    clarificationId: "clarification-readme-fit",
                    dimensionId: "dimension-readme-fit",
                    message: "Clarify README Fit convergence evidence.",
                  }),
                ]
              : [
                  buildDirectorClarification({
                    clarificationId: "clarification-other-dimension",
                    dimensionId: "dimension-other-fit",
                    message: "Clarify another dimension only.",
                  }),
                ],
        }),
      });
    },
  );

  await page.goto("/#/dimensions/dimension-readme-fit");

  const panel = page.getByRole("region", {
    name: "Director clarification requests",
  });

  await expect(
    panel.getByText("Clarify README Fit convergence evidence."),
  ).toBeVisible();
  await expect(panel.getByText("Clarify another dimension only.")).toHaveCount(
    0,
  );
  await expect
    .poll(() => listRequests)
    .toContain("?dimension_id=dimension-readme-fit");
});

test("keeps project management available on the Projects page", async ({
  page,
}) => {
  let projects = [buildProject()];
  const requests: string[] = [];

  await page.route("**/api/projects**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const projectId = decodeURIComponent(
      requestUrl.pathname.split("/").at(-1) ?? "",
    );

    requests.push(request.method());

    if (request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: projects }),
      });
      return;
    }

    if (request.method() === "POST") {
      const payload = JSON.parse(request.postData() ?? "{}") as {
        git_origin_url: string;
        global_model_id: string;
        global_provider_id: string;
        name: string;
      };
      const createdProject = buildProject({
        gitOriginUrl: payload.git_origin_url,
        globalModelId: payload.global_model_id,
        globalProviderId: payload.global_provider_id,
        name: payload.name,
        projectId: "00000000-0000-4000-8000-000000000012",
      });

      projects = [...projects, createdProject];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(createdProject),
      });
      return;
    }

    if (request.method() === "PATCH") {
      const payload = JSON.parse(request.postData() ?? "{}") as {
        git_origin_url?: string;
        global_model_id?: string;
        global_provider_id?: string;
        name?: string;
      };
      const updatedProject = {
        ...projects.find((project) => project.id === projectId),
        ...payload,
        updated_at: "2026-04-26T00:05:00.000Z",
      };

      projects = projects.map((project) =>
        project.id === projectId ? updatedProject : project,
      );
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(updatedProject),
      });
      return;
    }

    if (request.method() === "DELETE") {
      projects = projects.filter((project) => project.id !== projectId);
      await route.fulfill({ status: 204 });
      return;
    }

    await route.fallback();
  });

  await page.goto("/#/projects");

  await expect(
    page.getByRole("heading", { name: "Project Register" }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /Main project/ })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Git Origin URL" }),
  ).toBeVisible();

  await page.getByLabel("Project Name").fill("Created project");
  await page
    .getByLabel("Git Origin URL")
    .fill("https://github.com/example/created.git");
  await page.getByLabel("Global Provider").fill("anthropic");
  await page.getByLabel("Global Model").fill("claude-sonnet-4-5");
  await page.getByRole("button", { name: "Create Project" }).click();

  await expect(
    page.getByRole("row", { name: /Created project/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit Main project" }).click();
  await page.getByLabel("Project Name").fill("Renamed project");
  await page.getByRole("button", { name: "Save Project" }).click();

  await expect(
    page.getByRole("row", { name: /Renamed project/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete Renamed project" }).click();

  await expect(page.getByRole("row", { name: /Renamed project/ })).toHaveCount(
    0,
  );
  expect(requests).toEqual(
    expect.arrayContaining(["GET", "POST", "PATCH", "DELETE"]),
  );
});

test("opens an OpenCode sessions list page without drilling into session details", async ({
  page,
}) => {
  const longContinuePrompt = [
    "Continue with required checks follow-up.",
    "Review the required check timeline before deciding whether to wait or intervene.",
    "Preserve the exact token prompt-tail-8f92c7 when the field is expanded.",
  ].join("\n");
  const longValue = [
    "Waiting on required checks.",
    "The latest run is still pending on the platform queue.",
    "Preserve the exact token value-tail-4b7a21 when the field is expanded.",
  ].join("\n");
  const longReason = [
    "Spec no longer matches origin/main.",
    "The task references an obsolete dashboard route after the latest baseline refresh.",
    "Preserve the exact token reason-tail-93fd10 when the field is expanded.",
  ].join("\n");

  await page.route("**/api/opencode/sessions**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 404 });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            session_id: "ses_pending_review",
            state: "pending",
            value: longValue,
            reason: null,
            continue_prompt: longContinuePrompt,
            provider_id: "anthropic",
            model_id: "claude-sonnet-4-5",
            ...zeroOpenCodeSessionTokens,
            stale: true,
            created_at: "2026-04-27T08:00:00.000Z",
            updated_at: "2026-04-27T09:30:00.000Z",
          },
          {
            session_id: "ses_resolved_delivery",
            state: "resolved",
            value: "PR merged and baseline refreshed.",
            reason: null,
            continue_prompt: null,
            provider_id: null,
            model_id: null,
            ...zeroOpenCodeSessionTokens,
            stale: false,
            created_at: "2026-04-26T08:00:00.000Z",
            updated_at: "2026-04-26T11:30:00.000Z",
          },
          {
            session_id: "ses_rejected_scope",
            state: "rejected",
            value: null,
            reason: longReason,
            continue_prompt: null,
            provider_id: null,
            model_id: null,
            ...zeroOpenCodeSessionTokens,
            stale: false,
            created_at: "2026-04-25T08:00:00.000Z",
            updated_at: "2026-04-25T09:00:00.000Z",
          },
          {
            session_id: "ses_prompt_only",
            state: "resolved",
            value: null,
            reason: null,
            continue_prompt: "Continue the prompt-only session.",
            provider_id: "anthropic",
            model_id: "claude-opus-4-5",
            ...zeroOpenCodeSessionTokens,
            stale: false,
            created_at: "2026-04-24T08:00:00.000Z",
            updated_at: "2026-04-24T09:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("link", { name: "OpenCode Sessions" }).click();

  await expect(page).toHaveURL(/\/#\/opencode\/sessions$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "OpenCode Sessions" }),
  ).toBeVisible();
  const sessionsRegion = page.getByRole("region", {
    name: "OpenCode sessions",
  });

  await expect(sessionsRegion).toBeVisible();
  await expect(
    sessionsRegion.getByText("Pending 1 / Resolved 2 / Rejected 1", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Pending Sessions", { exact: true }),
  ).toHaveCount(0);
  await expect(
    sessionsRegion.getByText("Resolved Sessions", { exact: true }),
  ).toHaveCount(0);
  await expect(
    sessionsRegion.getByText("Rejected Sessions", { exact: true }),
  ).toHaveCount(0);
  const pendingReviewRow = sessionsRegion.getByRole("row", {
    name: /ses_pending_review/,
  });
  await expect(pendingReviewRow).toBeVisible();
  await expect(
    sessionsRegion.getByText("Pending", { exact: true }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Stale", { exact: true }),
  ).toBeVisible();
  await expect(
    pendingReviewRow.getByText("Continue prompt ready"),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Continue with required checks follow-up."),
  ).toBeVisible();
  await expect(sessionsRegion.getByText("prompt-tail-8f92c7")).toBeHidden();
  await expect(
    sessionsRegion.getByText("Waiting on required checks."),
  ).toBeVisible();
  await expect(sessionsRegion.getByText("value-tail-4b7a21")).toBeHidden();
  await expect(
    sessionsRegion.getByText("anthropic / claude-sonnet-4-5"),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByRole("button", {
      exact: true,
      name: "Continue all pending sessions",
    }),
  ).toHaveCount(0);
  await expect(
    sessionsRegion.getByRole("button", { exact: true, name: "Continue" }),
  ).toHaveCount(0);
  await expect(
    sessionsRegion.getByRole("row", { name: /ses_resolved_delivery/ }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("PR merged and baseline refreshed."),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByRole("button", { name: /PR merged and baseline/ }),
  ).toHaveCount(0);
  await expect(
    sessionsRegion.getByRole("row", { name: /ses_rejected_scope/ }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Spec no longer matches origin/main."),
  ).toBeVisible();
  await expect(sessionsRegion.getByText("reason-tail-93fd10")).toBeHidden();
  const promptOnlyRow = sessionsRegion.getByRole("row", {
    name: /ses_prompt_only/,
  });
  await expect(promptOnlyRow).toBeVisible();
  await expect(
    promptOnlyRow.getByText("Continue the prompt-only session."),
  ).toBeVisible();
  await expect(promptOnlyRow.getByText("None", { exact: true })).toHaveCount(0);
  await sessionsRegion.getByRole("button", { name: /Continue prompt/ }).click();
  await expect(sessionsRegion.getByText("prompt-tail-8f92c7")).toBeVisible();
  await sessionsRegion.getByRole("button", { name: /Value/ }).click();
  await expect(sessionsRegion.getByText("value-tail-4b7a21")).toBeVisible();
  await sessionsRegion.getByRole("button", { name: /Reason/ }).click();
  await expect(sessionsRegion.getByText("reason-tail-93fd10")).toBeVisible();
  await sessionsRegion.getByRole("button", { name: /Reason/ }).click();
  await expect(sessionsRegion.getByText("reason-tail-93fd10")).toBeHidden();
  await expect(page.getByRole("link", { name: /Open session/ })).toHaveCount(0);
});

test("summarizes OpenCode session token usage and refreshes one session", async ({
  page,
}) => {
  const refreshRequests: string[] = [];
  const sessions = [
    {
      session_id: "ses_token_heavy",
      state: "pending",
      value: null,
      reason: null,
      continue_prompt: "Continue after usage refresh.",
      project_id: null,
      provider_id: "anthropic",
      model_id: "claude-sonnet-4-5",
      title: null,
      input_tokens: 1200,
      cached_tokens: 300,
      cache_write_tokens: 40,
      output_tokens: 500,
      reasoning_tokens: 75,
      stale: false,
      created_at: "2026-04-27T08:00:00.000Z",
      updated_at: "2026-04-27T09:30:00.000Z",
    },
    {
      session_id: "ses_no_usage",
      state: "resolved",
      value: "No token usage recorded yet.",
      reason: null,
      continue_prompt: null,
      provider_id: null,
      model_id: null,
      ...zeroOpenCodeSessionTokens,
      stale: false,
      created_at: "2026-04-26T08:00:00.000Z",
      updated_at: "2026-04-26T11:30:00.000Z",
    },
  ];

  await page.route("**/api/opencode/sessions**", async (route) => {
    const requestUrl = new URL(route.request().url());

    if (
      route.request().method() === "POST" &&
      requestUrl.pathname.endsWith("/token-usage/refresh")
    ) {
      refreshRequests.push(requestUrl.pathname);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...sessions[0],
          input_tokens: 1500,
          cached_tokens: 450,
          cache_write_tokens: 60,
          output_tokens: 650,
          reasoning_tokens: 90,
          updated_at: "2026-04-27T09:45:00.000Z",
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: sessions }),
    });
  });

  await page.goto("/#/opencode/sessions");

  const sessionsRegion = page.getByRole("region", {
    name: "OpenCode sessions",
  });
  const heavyUsageRow = sessionsRegion.getByRole("row", {
    name: /ses_token_heavy/,
  });
  const noUsageRow = sessionsRegion.getByRole("row", { name: /ses_no_usage/ });

  await expect(sessionsRegion.getByText("Input 1,200")).toBeVisible();
  await expect(sessionsRegion.getByText("Cached input 300")).toBeVisible();
  await expect(sessionsRegion.getByText("Cache writes 40")).toBeVisible();
  await expect(sessionsRegion.getByText("Output 500")).toBeVisible();
  await expect(sessionsRegion.getByText("Reasoning 75")).toBeVisible();
  await expect(heavyUsageRow.getByText("2,115 tokens")).toBeVisible();
  await expect(
    heavyUsageRow.getByText("in 1,200 / cache 300+40 / out 500 / reason 75"),
  ).toBeVisible();
  await expect(noUsageRow.getByText("No usage")).toBeVisible();
  await expect(heavyUsageRow.getByText("Input tokens")).toBeVisible();
  await expect(heavyUsageRow.getByText("1,200", { exact: true })).toBeVisible();
  await expect(heavyUsageRow.getByText("Cached tokens")).toBeVisible();
  await expect(heavyUsageRow.getByText("300", { exact: true })).toBeVisible();
  await expect(heavyUsageRow.getByText("Cache write tokens")).toBeVisible();
  await expect(heavyUsageRow.getByText("40", { exact: true })).toBeVisible();
  await expect(heavyUsageRow.getByText("Output tokens")).toBeVisible();
  await expect(heavyUsageRow.getByText("500", { exact: true })).toBeVisible();
  await expect(heavyUsageRow.getByText("Reasoning tokens")).toBeVisible();
  await expect(heavyUsageRow.getByText("75", { exact: true })).toBeVisible();

  await heavyUsageRow
    .getByRole("button", { exact: true, name: "Refresh usage" })
    .click();

  await expect
    .poll(() => refreshRequests)
    .toEqual(["/api/opencode/sessions/ses_token_heavy/token-usage/refresh"]);
  await expect(sessionsRegion.getByText("Input 1,500")).toBeVisible();
  await expect(sessionsRegion.getByText("Cached input 450")).toBeVisible();
  await expect(sessionsRegion.getByText("Cache writes 60")).toBeVisible();
  await expect(sessionsRegion.getByText("Output 650")).toBeVisible();
  await expect(sessionsRegion.getByText("Reasoning 90")).toBeVisible();
  await expect(heavyUsageRow.getByText("2,750 tokens")).toBeVisible();
  await expect(
    heavyUsageRow.getByText("in 1,500 / cache 450+60 / out 650 / reason 90"),
  ).toBeVisible();
});

test("opens a dimension detail trend with time, score, evaluation points, and tooltip descriptions", async ({
  page,
}) => {
  const dimension = buildDimension();
  const evaluations = [
    buildDimensionEvaluation({
      createdAt: "2026-04-20T09:10:00.000Z",
      dimensionId: dimension.id,
      evaluation:
        "Initial fit is weak because the dashboard hides Director goals.",
      evaluationId: "evaluation-readme-fit-1",
      score: 48,
    }),
    buildDimensionEvaluation({
      createdAt: "2026-04-20T10:15:00.000Z",
      dimensionId: dimension.id,
      evaluation: "Goal fit improves once dimensions appear before tasks.",
      evaluationId: "evaluation-readme-fit-2",
      score: 74,
    }),
    buildDimensionEvaluation({
      createdAt: "2026-04-20T11:20:00.000Z",
      dimensionId: dimension.id,
      evaluation:
        "Strong convergence evidence, missing one explicit intervention path.",
      evaluationId: "evaluation-readme-fit-3",
      score: 82,
    }),
  ];

  await page.route("**/api/dimensions**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [dimension] }),
    });
  });

  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: evaluations }),
    });
  });

  await page.goto(`/#/dimensions/${dimension.id}`);

  await expect(page.getByRole("heading", { name: "README Fit" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dimension Detail" }),
  ).toBeVisible();

  const trend = page.getByRole("figure", { name: "README Fit score trend" });

  await expect(trend).toBeVisible();
  await expect(trend.getByText("Time", { exact: true })).toBeVisible();
  await expect(trend.getByText("Score", { exact: true })).toBeVisible();
  await expect(
    trend.getByText("2026-04-20 09:10", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    trend.getByText("2026-04-20 10:15", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    trend.getByText("2026-04-20 11:20", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    trend.getByRole("application", { name: "README Fit score trend chart" }),
  ).toBeVisible();
  await expect(trend.getByText("Score 82").first()).toBeVisible();

  await trend
    .getByRole("application", { name: "README Fit score trend chart" })
    .focus();
  await expect(
    trend
      .getByText(
        "Strong convergence evidence, missing one explicit intervention path.",
      )
      .first(),
  ).toBeVisible();
});

test("highlights the latest dimension evaluation and links GitHub commit evidence", async ({
  page,
}) => {
  const dimension = buildDimension();
  const evaluations = [
    buildDimensionEvaluation({
      commitSha: "1111111",
      createdAt: "2026-04-20T09:10:00.000Z",
      dimensionId: dimension.id,
      evaluation: "Earlier evidence still needs Director review.",
      evaluationId: "evaluation-readme-fit-1",
      score: 48,
    }),
    buildDimensionEvaluation({
      commitSha: "2222222",
      createdAt: "2026-04-20T11:20:00.000Z",
      dimensionId: dimension.id,
      evaluation: "Latest evidence clearly identifies the intervention path.",
      evaluationId: "evaluation-readme-fit-2",
      score: 82,
    }),
  ];

  await page.route("**/api/dimensions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [dimension] }),
    });
  });

  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: evaluations }),
    });
  });

  await page.goto(`/#/dimensions/${dimension.id}`);

  const latest = page.getByRole("region", { name: "Latest evaluation" });

  await expect(latest).toBeVisible();
  await expect(latest.getByText("82/100", { exact: true })).toBeVisible();
  await expect(
    latest.getByText(
      "Latest evidence clearly identifies the intervention path.",
    ),
  ).toBeVisible();
  await expect(latest.getByRole("link", { name: "2222222" })).toHaveAttribute(
    "href",
    "https://github.com/example/main/commit/2222222",
  );

  const trend = page.getByRole("figure", { name: "README Fit score trend" });

  await expect(
    trend.getByRole("link", { name: "1111111" }).first(),
  ).toHaveAttribute("href", "https://github.com/example/main/commit/1111111");
});

test("renders latest dimension evaluation Markdown with prose styling", async ({
  page,
}) => {
  const dimension = buildDimension();
  const markdownEvaluation =
    "Latest **evidence** identifies the intervention path.\n\n- Preserve Director focus";

  await page.route("**/api/dimensions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [dimension] }),
    });
  });

  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildDimensionEvaluation({
            dimensionId: dimension.id,
            evaluation: markdownEvaluation,
          }),
        ],
      }),
    });
  });

  await page.goto(`/#/dimensions/${dimension.id}`);

  const latest = page.getByRole("region", { name: "Latest evaluation" });
  const renderedEvaluation = latest.locator(".prose");

  await expect(renderedEvaluation).toHaveClass(/(^|\s)prose(\s|$)/);
  await expect(renderedEvaluation.locator("strong")).toHaveText("evidence");
  await expect(renderedEvaluation.locator("li")).toHaveText(
    "Preserve Director focus",
  );
});

test("renders the AIM brand mark and global controls without optimizer controls", async ({
  page,
}) => {
  const optimizerRequests: string[] = [];

  await page.route("**/api/optimizer/**", async (route) => {
    optimizerRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto("/");

  await expect(page.getByAltText("AIM icon")).toBeVisible();
  await expect(
    page.getByRole("heading", { exact: true, name: "AIM" }),
  ).toBeVisible();
  await expect(
    page.locator('head link[rel="icon"][href="/favicon.svg"]'),
  ).toHaveCount(1);

  const globalControls = page.getByRole("group", { name: "Global controls" });

  await expect(
    globalControls.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await expect(
    globalControls.getByRole("button", { exact: true, name: "Refresh" }),
  ).toBeVisible();
  await expect(
    globalControls.getByRole("switch", { name: "AIM Optimizer" }),
  ).toHaveCount(0);
  expect(
    optimizerRequests.filter(
      (url) => new URL(url).pathname === "/api/optimizer/status",
    ),
  ).toEqual([]);
});

test("redirects removed task write bulk and direct task creation routes", async ({
  page,
}) => {
  await page.goto("/#/task-write-bulks/bulk-approval-1");

  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.getByText("Task Write Bulk Details")).toHaveCount(0);

  await page.goto("/#/tasks/new");

  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.getByLabel("Task Spec")).toHaveCount(0);
});
