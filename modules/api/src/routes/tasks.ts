import { execFile } from "node:child_process";

import {
  createTaskBatchRequestSchema,
  createTaskRequestSchema,
  patchTaskRequestSchema,
  type TaskPullRequestStatusResponse,
  type TaskStatus,
  taskByIdPath,
  taskDependenciesPath,
  taskDependenciesRequestSchema,
  taskErrorSchema,
  taskPullRequestStatusPath,
  taskPullRequestStatusResponseSchema,
  taskPullRequestUrlPath,
  taskPullRequestUrlRequestSchema,
  taskRejectPath,
  taskResolvePath,
  taskResultRequestSchema,
  taskSpecPath,
  taskStatusSchema,
  tasksBatchPath,
  tasksPath,
  taskWorktreePathPath,
  taskWorktreePathRequestSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import type { ApiLogger } from "../api-logger.js";
import {
  createOpenCodeSdkAdapter,
  type OpenCodeSdkAdapter,
} from "../opencode-sdk-adapter.js";
import type { OptimizerEvent } from "../optimizer-runtime.js";
import { buildTaskLogFields } from "../task-log-fields.js";
import { createTaskRepository } from "../task-repository.js";

const taskByIdRoutePath = taskByIdPath.replace("{taskId}", ":taskId");
const tasksBatchRoutePath = tasksBatchPath;
const taskWorktreePathRoutePath = taskWorktreePathPath.replace(
  "{taskId}",
  ":taskId",
);
const taskPullRequestUrlRoutePath = taskPullRequestUrlPath.replace(
  "{taskId}",
  ":taskId",
);
const taskPullRequestStatusRoutePath = taskPullRequestStatusPath.replace(
  "{taskId}",
  ":taskId",
);
const taskDependenciesRoutePath = taskDependenciesPath.replace(
  "{taskId}",
  ":taskId",
);
const taskSpecRoutePath = taskSpecPath.replace("{taskId}", ":taskId");
const taskResolveRoutePath = taskResolvePath.replace("{taskId}", ":taskId");
const taskRejectRoutePath = taskRejectPath.replace("{taskId}", ":taskId");

const buildNotFoundError = (taskId: string) =>
  taskErrorSchema.parse({
    code: "TASK_NOT_FOUND",
    message: `Task ${taskId} was not found`,
  });

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "TASK_VALIDATION_ERROR",
    message,
  });

const buildOpenCodeModelsUnavailableError = () =>
  taskErrorSchema.parse({
    code: "OPENCODE_MODELS_UNAVAILABLE",
    message:
      "Cannot validate developer_provider_id and developer_model_id because OpenCode models are unavailable",
  });

const requireTaskId = (taskId: string | undefined) => taskId ?? "task-unknown";

const parseListFilters = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const done = searchParams.get("done");
  const sessionId = searchParams.get("session_id");

  if (status !== null && !taskStatusSchema.safeParse(status).success) {
    return buildValidationError("Invalid task status filter");
  }

  if (done !== null && done !== "true" && done !== "false") {
    return buildValidationError("Invalid task done filter");
  }

  if (sessionId !== null && sessionId.length === 0) {
    return buildValidationError("Invalid task session filter");
  }

  return {
    done: done === null ? undefined : done === "true",
    session_id: sessionId ?? undefined,
    status: status === null ? undefined : (status as TaskStatus),
  };
};

const parseCreateTaskRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createTaskRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseCreateTaskBatchRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createTaskBatchRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task batch payload"),
      ok: false as const,
    };
  }

  const taskIds = new Map<string, "create" | "delete">();

  for (const operation of result.data.operations) {
    const taskId =
      operation.type === "create" ? operation.task.task_id : operation.task_id;
    const existingOperationType = taskIds.get(taskId);

    if (existingOperationType && existingOperationType !== operation.type) {
      return {
        error: buildValidationError(
          `Task batch cannot create and delete task_id ${taskId} in the same batch`,
        ),
        ok: false as const,
      };
    }

    if (existingOperationType) {
      return {
        error: buildValidationError(
          "Task batch operations must not repeat task_id",
        ),
        ok: false as const,
      };
    }

    taskIds.set(taskId, operation.type);
  }

  return { data: result.data, ok: true as const };
};

const parsePatchTaskRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);

  const result = patchTaskRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task patch"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseTaskResultRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskResultRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task result"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const getPullRequestMergedOutput = (pullRequestUrl: string) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      "gh",
      ["pr", "view", pullRequestUrl, "--json", "state,mergedAt"],
      { encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          reject(error);

          return;
        }

        resolve(stdout);
      },
    );
  });

const getPullRequestFollowupOutput = (pullRequestUrl: string) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      "gh",
      [
        "pr",
        "view",
        pullRequestUrl,
        "--json",
        "state,mergedAt,mergeable,reviewDecision,statusCheckRollup,autoMergeRequest",
      ],
      { encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          reject(error);

          return;
        }

        resolve(stdout);
      },
    );
  });

type PullRequestFollowupView = {
  autoMergeRequest?: unknown;
  mergeable?: unknown;
  mergedAt?: unknown;
  reviewDecision?: unknown;
  state?: unknown;
  statusCheckRollup?: unknown;
};

const readCheckName = (check: unknown) => {
  if (!check || typeof check !== "object") {
    return "unnamed check";
  }

  const candidate = check as { name?: unknown; workflowName?: unknown };

  return typeof candidate.name === "string" && candidate.name.trim().length > 0
    ? candidate.name.trim()
    : typeof candidate.workflowName === "string" &&
        candidate.workflowName.trim().length > 0
      ? candidate.workflowName.trim()
      : "unnamed check";
};

const readCheckState = (check: unknown) => {
  if (!check || typeof check !== "object") {
    return { conclusion: "", status: "" };
  }

  const candidate = check as { conclusion?: unknown; status?: unknown };

  return {
    conclusion:
      typeof candidate.conclusion === "string"
        ? candidate.conclusion.toUpperCase()
        : "",
    status:
      typeof candidate.status === "string"
        ? candidate.status.toUpperCase()
        : "",
  };
};

const buildPullRequestFollowupStatus = (
  task: {
    done: boolean;
    pull_request_url: string | null;
    status: TaskStatus;
  },
  pullRequest: PullRequestFollowupView | null,
): TaskPullRequestStatusResponse => {
  const base = {
    pull_request_url: task.pull_request_url,
    task_done: task.done,
    task_status: task.status,
  };

  if (!task.pull_request_url) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "no_pull_request",
      recovery_action:
        "Record pull_request_url after creating the PR, or continue development until a PR exists.",
      summary: "No pull_request_url is recorded for this task.",
    });
  }

  if (!pullRequest) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "pull_request_unavailable",
      recovery_action:
        "Verify the pull_request_url, GitHub CLI authentication, and repository access. If the PR was deleted or cannot be recovered, reject or escalate with the exact lookup failure.",
      summary: "Could not query the pull request with gh.",
    });
  }

  const state = typeof pullRequest.state === "string" ? pullRequest.state : "";
  const mergedAt =
    typeof pullRequest.mergedAt === "string" ? pullRequest.mergedAt.trim() : "";
  const checks = Array.isArray(pullRequest.statusCheckRollup)
    ? pullRequest.statusCheckRollup
    : [];
  const failedChecks = checks.filter((check) => {
    const { conclusion } = readCheckState(check);

    return ["ACTION_REQUIRED", "CANCELLED", "FAILURE", "TIMED_OUT"].includes(
      conclusion,
    );
  });
  const waitingChecks = checks.filter((check) => {
    const { status } = readCheckState(check);

    return [
      "EXPECTED",
      "IN_PROGRESS",
      "PENDING",
      "QUEUED",
      "REQUESTED",
    ].includes(status);
  });
  const reviewDecision =
    typeof pullRequest.reviewDecision === "string"
      ? pullRequest.reviewDecision
      : "";
  const mergeable =
    typeof pullRequest.mergeable === "string" ? pullRequest.mergeable : "";
  const autoMergeEnabled = pullRequest.autoMergeRequest != null;

  if (
    (state === "MERGED" || mergedAt.length > 0) &&
    task.status !== "resolved"
  ) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "merged_but_not_resolved",
      recovery_action:
        "Report the final result with POST /tasks/{taskId}/resolve now that the pull request is merged.",
      summary: "Pull request is merged, but the AIM task is still processing.",
    });
  }

  if (state === "CLOSED") {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "closed_abandoned",
      recovery_action:
        "Confirm whether the closed PR was intentionally abandoned. Reopen or create a replacement PR if work should continue; otherwise reject with the closure reason.",
      summary: "Pull request is closed without being merged.",
    });
  }

  if (failedChecks.length > 0) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "failed_checks",
      recovery_action:
        "Inspect the failing required checks, fix in-scope failures on the same branch, push, and continue PR follow-up. Escalate if the failure is outside task scope.",
      summary: `Required checks failed: ${failedChecks.map(readCheckName).join(", ")}.`,
    });
  }

  if (waitingChecks.length > 0) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "waiting_checks",
      recovery_action:
        "Wait for required checks to finish, then reclassify the PR before merging or resolving the task.",
      summary: `Required checks are still running: ${waitingChecks.map(readCheckName).join(", ")}.`,
    });
  }

  if (["CHANGES_REQUESTED", "REVIEW_REQUIRED"].includes(reviewDecision)) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "review_blocked",
      recovery_action:
        "Address blocking review feedback on the same branch, then wait for review dismissal or approval before merging.",
      summary: `Pull request review is blocking merge: ${reviewDecision}.`,
    });
  }

  if (["CONFLICTING", "UNKNOWN"].includes(mergeable)) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "merge_conflict",
      recovery_action:
        "Fetch origin, rebase the task branch on origin/main, resolve conflicts, push, and continue PR follow-up.",
      summary: `Pull request mergeability is ${mergeable}.`,
    });
  }

  if (!autoMergeEnabled) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "auto_merge_unavailable",
      recovery_action:
        "Enable auto-merge with squash if repository policy allows it. If GitHub refuses, record the exact reason and continue manual PR follow-up.",
      summary:
        "Pull request is open, but auto-merge is not enabled or unavailable.",
    });
  }

  return taskPullRequestStatusResponseSchema.parse({
    ...base,
    category: "ready_to_merge",
    recovery_action:
      "Checks and review are clear. Merge according to repository policy if auto-merge has not already completed it.",
    summary:
      "Pull request has no observed checks, review, or mergeability blockers.",
  });
};

const verifyPullRequestMerged = async (pullRequestUrl: string) => {
  let stdout: string;
  try {
    stdout = await getPullRequestMergedOutput(pullRequestUrl);
  } catch {
    return buildValidationError(
      "Could not confirm pull_request_url is merged with gh. Make sure GitHub CLI is installed, authenticated, and the PR exists.",
    );
  }

  let pullRequest: { mergedAt?: unknown; state?: unknown };
  try {
    pullRequest = JSON.parse(stdout) as { mergedAt?: unknown; state?: unknown };
  } catch {
    return buildValidationError(
      "Could not confirm pull_request_url is merged with gh. Make sure GitHub CLI is installed, authenticated, and the PR exists.",
    );
  }

  const mergedAt =
    typeof pullRequest.mergedAt === "string" ? pullRequest.mergedAt.trim() : "";

  if (pullRequest.state !== "MERGED" && mergedAt.length === 0) {
    return buildValidationError(
      "Task cannot be resolved until pull_request_url points to a merged pull request.",
    );
  }

  return null;
};

const parseTaskWorktreePathRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskWorktreePathRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task worktree_path payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseTaskPullRequestUrlRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskPullRequestUrlRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task pull_request_url payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseTaskDependenciesRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskDependenciesRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task dependencies payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterTaskRoutesOptions = {
  logger?: ApiLogger;
  onTaskResolved?: (event: OptimizerEvent) => Promise<void> | void;
  openCodeModelsAdapter?: Pick<OpenCodeSdkAdapter, "listSupportedModels">;
  resourceScope?: Pick<AsyncDisposableStack, "use">;
};

export const registerTaskRoutes = (
  app: Hono,
  options: RegisterTaskRoutesOptions = {},
) => {
  const logger = options.logger;
  const onTaskResolved = options.onTaskResolved;
  const projectRoot = process.env.AIM_PROJECT_ROOT;
  let openCodeModelsAdapter = options.openCodeModelsAdapter;
  let repository: null | ReturnType<typeof createTaskRepository> = null;
  const getRepository = () => {
    repository ??=
      options.resourceScope?.use(createTaskRepository({ projectRoot })) ??
      createTaskRepository({ projectRoot });

    return repository;
  };
  const getOpenCodeModelsAdapter = () => {
    openCodeModelsAdapter ??= createOpenCodeSdkAdapter({
      baseUrl: process.env.OPENCODE_BASE_URL ?? "http://localhost:4096",
    });

    return openCodeModelsAdapter;
  };

  app.get(tasksPath, async (context) => {
    const filters = parseListFilters(context.req.raw);

    if ("code" in filters) {
      return context.json(filters, 400);
    }

    const items = await getRepository().listTasks(filters);

    return context.json({ items }, 200);
  });

  app.post(tasksPath, async (context) => {
    const input = await parseCreateTaskRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    let models: Awaited<ReturnType<OpenCodeSdkAdapter["listSupportedModels"]>>;
    const projectId = input.data.project_id;

    try {
      models = await getOpenCodeModelsAdapter().listSupportedModels();
    } catch {
      return context.json(buildOpenCodeModelsUnavailableError(), 503);
    }

    const project = projectId
      ? await getRepository().getProjectById(projectId)
      : null;

    if (!project) {
      return context.json(
        buildValidationError(`Project ${projectId} was not found`),
        400,
      );
    }

    if (!project.global_provider_id.trim() || !project.global_model_id.trim()) {
      return context.json(
        buildValidationError(
          `Project ${projectId} is missing global provider/model configuration`,
        ),
        400,
      );
    }

    const matchingModel = models.items.find(
      (model) =>
        model.provider_id === project.global_provider_id &&
        model.model_id === project.global_model_id,
    );

    if (!matchingModel) {
      return context.json(
        buildValidationError(
          `Project ${project.id} global_provider_id "${project.global_provider_id}" with global_model_id "${project.global_model_id}" is not available. Use GET /opencode/models to choose a supported provider/model combination.`,
        ),
        400,
      );
    }

    const payload = await getRepository().createTask(input.data);

    logger?.info(buildTaskLogFields("task_created", payload));

    return context.json(payload, 201);
  });

  app.post(tasksBatchRoutePath, async (context) => {
    const input = await parseCreateTaskBatchRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    try {
      const payload = await getRepository().createTaskBatch(input.data);

      return context.json(payload, 200);
    } catch (error) {
      return context.json(
        buildValidationError(
          error instanceof Error
            ? error.message
            : "Invalid task batch operation",
        ),
        400,
      );
    }
  });

  app.get(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(task, 200);
  });

  app.get(taskSpecRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return new Response(task.task_spec, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
      },
      status: 200,
    });
  });

  app.patch(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const patch = await parsePatchTaskRequest(context.req.raw);

    if (!patch.ok) {
      return context.json(patch.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, patch.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(payload, 200);
  });

  app.put(taskWorktreePathRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskWorktreePathRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, input.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(payload, 200);
  });

  app.put(taskPullRequestUrlRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskPullRequestUrlRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, input.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(payload, 200);
  });

  app.get(taskPullRequestStatusRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    if (!task.pull_request_url) {
      return context.json(buildPullRequestFollowupStatus(task, null), 200);
    }

    let pullRequest: PullRequestFollowupView | null = null;

    try {
      pullRequest = JSON.parse(
        await getPullRequestFollowupOutput(task.pull_request_url),
      ) as PullRequestFollowupView;
    } catch {
      pullRequest = null;
    }

    return context.json(buildPullRequestFollowupStatus(task, pullRequest), 200);
  });

  app.put(taskDependenciesRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskDependenciesRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, input.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(payload, 200);
  });

  app.post(taskResolveRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskResultRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    if (!task.pull_request_url) {
      return context.json(
        buildValidationError(
          "Task cannot be resolved until pull_request_url is recorded.",
        ),
        400,
      );
    }

    const pullRequestError = await verifyPullRequestMerged(
      task.pull_request_url,
    );

    if (pullRequestError) {
      return context.json(pullRequestError, 400);
    }

    const payload = await getRepository().resolveTask(
      taskId,
      input.data.result,
    );

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    logger?.info(buildTaskLogFields("task_resolved", payload));

    if (onTaskResolved) {
      Promise.resolve()
        .then(() =>
          onTaskResolved({ taskId: payload.task_id, type: "task_resolved" }),
        )
        .catch((error: unknown) => {
          logger?.error(
            { err: error, taskId },
            "Task scheduler scan trigger failed after task resolve",
          );
        });
    }

    return new Response(null, { status: 204 });
  });

  app.post(taskRejectRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskResultRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().rejectTask(taskId, input.data.result);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    logger?.info(buildTaskLogFields("task_rejected", payload));

    return new Response(null, { status: 204 });
  });

  app.delete(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const deleted = await getRepository().deleteTask(taskId);

    if (!deleted) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return new Response(null, { status: 204 });
  });
};
