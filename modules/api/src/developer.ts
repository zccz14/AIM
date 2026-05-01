import type { Task } from "@aim-ai/contract";

import { AIM_SESSION_SETTLEMENT_PROTOCOL } from "./aim-session-settlement-protocol.js";
import type { ApiLogger } from "./api-logger.js";
import { cancelableSleep } from "./cancelable-sleep.js";
import { execGh, execGit } from "./exec-file.js";
import type { OpenCodeSessionManager } from "./opencode-session-manager.js";
import type { OptimizerLaneEventInput } from "./optimizer-lane-events.js";
import { ensureProjectWorkspace } from "./project-workspace.js";
import {
  type BaselineFacts,
  buildTaskSessionPrompt,
} from "./task-continue-prompt.js";

type BaselineRepository = {
  getLatestBaselineFacts(projectDirectory: string): Promise<BaselineFacts>;
};

type DeveloperSessionManager = Pick<OpenCodeSessionManager, "createSession">;

type PullRequestFollowupView = {
  autoMergeRequest?: unknown;
  mergeable?: unknown;
  mergedAt?: unknown;
  reviewDecision?: unknown;
  state?: unknown;
  statusCheckRollup?: unknown;
};

type PullRequestStatusProvider = {
  getTaskPullRequestStatus(task: Task): Promise<{
    category: string;
  }>;
};

type DeveloperSessionRepository = {
  getSessionById(sessionId: string):
    | { session_id: string; state: "pending" | "rejected" | "resolved" }
    | null
    | Promise<{
        session_id: string;
        state: "pending" | "rejected" | "resolved";
      } | null>;
};

type DeveloperTaskRepository = {
  assignSessionIfUnassigned(
    taskId: string,
    sessionId: string,
  ): Promise<null | Task>;
  getTaskById?(taskId: string): Promise<null | Task> | null | Task;
  listRejectedTasksByProject(projectId: string): Promise<Task[]>;
  listUnfinishedTasks(): Promise<Task[]>;
  updateTask?(
    taskId: string,
    patch: { session_id: string },
  ): Promise<null | Task>;
};

type CreateDeveloperOptions = {
  baselineRepository?: BaselineRepository;
  canStartTask?: (
    task: Task,
  ) =>
    | { ok: true }
    | { ok: false; reason: string }
    | Promise<{ ok: true } | { ok: false; reason: string }>;
  logger?: ApiLogger;
  onLaneEvent?: (event: OptimizerLaneEventInput) => void;
  pullRequestStatusProvider?: PullRequestStatusProvider;
  sessionManager: DeveloperSessionManager;
  sessionRepository: DeveloperSessionRepository;
  taskRepository: DeveloperTaskRepository;
};

const heartbeatMs = 1000;

const git = async (projectDirectory: string, args: string[]) =>
  (await execGit(projectDirectory, args, { target: projectDirectory })).trim();

const getPullRequestFollowupOutput = (pullRequestUrl: string) =>
  execGh(
    [
      "pr",
      "view",
      pullRequestUrl,
      "--json",
      "state,mergedAt,mergeable,reviewDecision,statusCheckRollup,autoMergeRequest",
    ],
    { target: pullRequestUrl },
  );

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

const categorizePullRequest = (pullRequest: PullRequestFollowupView) => {
  const state = typeof pullRequest.state === "string" ? pullRequest.state : "";
  const mergedAt =
    typeof pullRequest.mergedAt === "string" ? pullRequest.mergedAt.trim() : "";
  const checks = Array.isArray(pullRequest.statusCheckRollup)
    ? pullRequest.statusCheckRollup
    : [];
  const failedChecks = checks.some((check) => {
    const { conclusion } = readCheckState(check);

    return ["ACTION_REQUIRED", "CANCELLED", "FAILURE", "TIMED_OUT"].includes(
      conclusion,
    );
  });
  const waitingChecks = checks.some((check) => {
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

  if (state === "MERGED" || mergedAt.length > 0) {
    return "merged_but_not_resolved";
  }

  if (state === "CLOSED") {
    return "closed_abandoned";
  }

  if (failedChecks) {
    return "failed_checks";
  }

  if (waitingChecks) {
    return "waiting_checks";
  }

  if (["CHANGES_REQUESTED", "REVIEW_REQUIRED"].includes(reviewDecision)) {
    return "review_blocked";
  }

  if (["CONFLICTING", "UNKNOWN"].includes(mergeable)) {
    return "merge_conflict";
  }

  if (pullRequest.autoMergeRequest == null) {
    return "auto_merge_unavailable";
  }

  return "ready_to_merge";
};

const defaultBaselineRepository: BaselineRepository = {
  async getLatestBaselineFacts(projectDirectory) {
    await git(projectDirectory, ["fetch", "origin", "main"]);

    return {
      commitSha: await git(projectDirectory, ["rev-parse", "origin/main"]),
      fetchedAt: new Date().toISOString(),
      summary: await git(projectDirectory, [
        "log",
        "-1",
        "--format=%s",
        "origin/main",
      ]),
    };
  },
};

const defaultPullRequestStatusProvider: PullRequestStatusProvider = {
  async getTaskPullRequestStatus(task) {
    if (!task.pull_request_url) {
      return { category: "no_pull_request" };
    }

    try {
      return {
        category: categorizePullRequest(
          JSON.parse(
            await getPullRequestFollowupOutput(task.pull_request_url),
          ) as PullRequestFollowupView,
        ),
      };
    } catch {
      return { category: "pull_request_unavailable" };
    }
  },
};

const summarizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const withExplicitSourceBaselineFreshness = (task: Task): Task =>
  task.source_baseline_freshness
    ? task
    : {
        ...task,
        source_baseline_freshness: {
          current_commit: null,
          source_commit: null,
          status: "unknown",
          summary: "not set",
        },
      };

const buildMergedPullRequestSettlementPrompt = (
  task: Task,
  context: Parameters<typeof buildTaskSessionPrompt>[1],
) => `${buildTaskSessionPrompt(task, context)}

Merged PR settlement objective:
- This is settlement-only work for a PR-backed AIM Task whose pull_request_status is merged_but_not_resolved.
- Confirm the GitHub PR is merged before resolving the AIM Task.
- clean up the task worktree after the PR terminal state is confirmed.
- refresh the main workspace to origin/main with git fetch origin && git checkout origin/main.
- Then settle the current AIM-managed session using ${AIM_SESSION_SETTLEMENT_PROTOCOL} with a concise final result.
- If settlement cannot proceed, settle the current AIM-managed session using ${AIM_SESSION_SETTLEMENT_PROTOCOL} with an actionable rejected reason that names the blocker and next recovery step.
`;

export const createDeveloper = ({
  baselineRepository = defaultBaselineRepository,
  canStartTask = () => ({ ok: true }),
  logger,
  onLaneEvent,
  pullRequestStatusProvider = defaultPullRequestStatusProvider,
  sessionManager,
  sessionRepository,
  taskRepository,
}: CreateDeveloperOptions): AsyncDisposable => {
  const stack = new AsyncDisposableStack();
  const abortController = new AbortController();

  const bindTask = async (task: Task) => {
    onLaneEvent?.({
      event: "start",
      lane_name: "developer",
      project_id: task.project_id,
      summary: `Developer lane started session assignment for task ${task.task_id}.`,
      task_id: task.task_id,
    });
    const createdSession = await sessionManager.createSession({
      prompt: buildTaskSessionPrompt(task),
      projectId: task.project_id,
      title: `AIM Developer: ${task.title}`,
    });

    const assignedTask = await taskRepository.assignSessionIfUnassigned(
      task.task_id,
      createdSession.session_id,
    );

    if (
      assignedTask?.session_id === createdSession.session_id &&
      !assignedTask.done
    ) {
      onLaneEvent?.({
        event: "success",
        lane_name: "developer",
        project_id: task.project_id,
        session_id: createdSession.session_id,
        summary: `Developer lane assigned task ${task.task_id} to session ${createdSession.session_id}.`,
        task_id: task.task_id,
      });
      return;
    }

    onLaneEvent?.({
      event: "noop",
      lane_name: "developer",
      project_id: task.project_id,
      session_id: createdSession.session_id,
      summary: `Developer lane skipped task ${task.task_id}: another session already claimed it or the task finished.`,
      task_id: task.task_id,
    });
  };

  const getUnmetDependencyIds = async (
    task: Task,
    listedTasksById: Map<string, Task>,
  ) => {
    const unmetDependencyIds: string[] = [];

    for (const dependencyId of task.dependencies ?? []) {
      const dependencyTask =
        listedTasksById.get(dependencyId) ??
        (await taskRepository.getTaskById?.(dependencyId)) ??
        null;

      if (dependencyTask?.status !== "resolved") {
        unmetDependencyIds.push(dependencyId);
      }
    }

    return unmetDependencyIds;
  };

  const buildSettlementPromptContext = async (
    task: Task,
    unfinishedTasks: Task[],
  ) => {
    const directory = await ensureProjectWorkspace(task);
    const [baselineFacts, rejectedTasks] = await Promise.all([
      baselineRepository.getLatestBaselineFacts(directory),
      taskRepository.listRejectedTasksByProject(task.project_id),
    ]);
    const activeTasks = unfinishedTasks
      .filter((activeTask) => activeTask.project_id === task.project_id)
      .map(withExplicitSourceBaselineFreshness);

    return {
      directory,
      prompt: buildMergedPullRequestSettlementPrompt(task, {
        activeTasks,
        baselineFacts,
        rejectedTasks,
      }),
    };
  };

  const continueMergedPullRequestSettlement = async (
    task: Task,
    unfinishedTasks: Task[],
  ) => {
    const { prompt } = await buildSettlementPromptContext(
      task,
      unfinishedTasks,
    );

    if (task.session_id) {
      onLaneEvent?.({
        event: "noop",
        lane_name: "developer",
        project_id: task.project_id,
        session_id: task.session_id,
        summary: `Developer lane skipped merged PR settlement for task ${task.task_id}: external session continuation is disabled.`,
        task_id: task.task_id,
      });

      return;
    }

    const createdSession = await sessionManager.createSession({
      prompt,
      projectId: task.project_id,
      title: `AIM Developer Settlement: ${task.title}`,
    });

    const assignedTask = await taskRepository.assignSessionIfUnassigned(
      task.task_id,
      createdSession.session_id,
    );

    if (
      assignedTask?.session_id === createdSession.session_id &&
      !assignedTask.done
    ) {
      onLaneEvent?.({
        event: "success",
        lane_name: "developer",
        project_id: task.project_id,
        session_id: createdSession.session_id,
        summary: `Developer lane assigned merged PR settlement task ${task.task_id} to session ${createdSession.session_id}.`,
        task_id: task.task_id,
      });

      return;
    }
  };

  const continueAssignedPendingSession = async (
    task: Task,
    tasksById: Map<string, Task>,
  ) => {
    if (!task.session_id) {
      return;
    }

    const recoverUnavailableAssignedSession = async () => {
      if (task.pull_request_url) {
        const { category } =
          await pullRequestStatusProvider.getTaskPullRequestStatus(task);
        onLaneEvent?.({
          event: "noop",
          lane_name: "developer",
          project_id: task.project_id,
          session_id: task.session_id ?? undefined,
          summary: `Developer lane skipped assigned task ${task.task_id}: pull request follow-up category ${category} is not unavailable session recovery scope.`,
          task_id: task.task_id,
        });

        return;
      }

      const unmetDependencyIds = await getUnmetDependencyIds(task, tasksById);
      if (unmetDependencyIds.length > 0) {
        onLaneEvent?.({
          event: "noop",
          lane_name: "developer",
          project_id: task.project_id,
          session_id: task.session_id ?? undefined,
          summary: `Developer lane skipped assigned task ${task.task_id} in project ${task.project_id}: unresolved dependencies ${unmetDependencyIds.join(", ")}.`,
          task_id: task.task_id,
        });

        return;
      }

      if (!taskRepository.updateTask) {
        throw new Error(
          "Task repository does not support rebinding unavailable assigned sessions",
        );
      }

      const createdSession = await sessionManager.createSession({
        prompt: buildTaskSessionPrompt(task),
        projectId: task.project_id,
        title: `AIM Developer Recovery: ${task.title}`,
      });

      const recoveredTask = await taskRepository.updateTask(task.task_id, {
        session_id: createdSession.session_id,
      });

      if (
        recoveredTask?.session_id === createdSession.session_id &&
        !recoveredTask.done
      ) {
        onLaneEvent?.({
          event: "success",
          lane_name: "developer",
          project_id: task.project_id,
          session_id: createdSession.session_id,
          summary: `Developer lane recovered unavailable session ${task.session_id} for task ${task.task_id} with session ${createdSession.session_id}.`,
          task_id: task.task_id,
        });

        return;
      }

      onLaneEvent?.({
        event: "noop",
        lane_name: "developer",
        project_id: task.project_id,
        session_id: createdSession.session_id,
        summary: `Developer lane skipped unavailable session recovery for task ${task.task_id}: another session claimed it or the task finished.`,
        task_id: task.task_id,
      });
    };

    const session = await sessionRepository.getSessionById(task.session_id);
    if (!session) {
      await recoverUnavailableAssignedSession();

      return;
    }

    const sessionState = session.state;

    if (sessionState !== "pending") {
      onLaneEvent?.({
        event: "noop",
        lane_name: "developer",
        project_id: task.project_id,
        session_id: task.session_id,
        summary: `Developer lane skipped assigned task ${task.task_id}: OpenCode session ${task.session_id} is ${sessionState ?? "unavailable"}.`,
        task_id: task.task_id,
      });

      return;
    }

    if (task.pull_request_url) {
      const { category } =
        await pullRequestStatusProvider.getTaskPullRequestStatus(task);
      onLaneEvent?.({
        event: "noop",
        lane_name: "developer",
        project_id: task.project_id,
        session_id: task.session_id,
        summary: `Developer lane skipped assigned task ${task.task_id}: pull request follow-up category ${category} is not pending session continuation scope.`,
        task_id: task.task_id,
      });

      return;
    }

    const unmetDependencyIds = await getUnmetDependencyIds(task, tasksById);
    if (unmetDependencyIds.length > 0) {
      onLaneEvent?.({
        event: "noop",
        lane_name: "developer",
        project_id: task.project_id,
        session_id: task.session_id,
        summary: `Developer lane skipped assigned task ${task.task_id} in project ${task.project_id}: unresolved dependencies ${unmetDependencyIds.join(", ")}.`,
        task_id: task.task_id,
      });

      return;
    }

    onLaneEvent?.({
      event: "noop",
      lane_name: "developer",
      project_id: task.project_id,
      session_id: task.session_id,
      summary: `Developer lane skipped assigned pending session ${task.session_id} for task ${task.task_id}: external session continuation is disabled.`,
      task_id: task.task_id,
    });
  };

  const findMergedPullRequestSettlementTasks = async (tasks: Task[]) => {
    const settlementTasks: Task[] = [];

    for (const task of tasks) {
      if (task.done || task.status !== "pending" || !task.pull_request_url) {
        continue;
      }

      const { category } =
        await pullRequestStatusProvider.getTaskPullRequestStatus(task);

      if (category === "merged_but_not_resolved") {
        settlementTasks.push(task);
      }
    }

    return settlementTasks;
  };

  const heartbeat = async () => {
    const tasks = await taskRepository.listUnfinishedTasks();
    const tasksById = new Map(tasks.map((task) => [task.task_id, task]));
    const settlementTasks = await findMergedPullRequestSettlementTasks(tasks);
    if (settlementTasks.length > 0) {
      for (const task of settlementTasks) {
        if (abortController.signal.aborted) {
          return;
        }

        try {
          await continueMergedPullRequestSettlement(task, tasks);
        } catch (error) {
          logger?.error(
            {
              err: error,
              event: "developer_task_failed",
              project_id: task.project_id,
              task_id: task.task_id,
            },
            `Developer failed while continuing merged PR settlement for task ${task.task_id}`,
          );
          onLaneEvent?.({
            event: "failure",
            lane_name: "developer",
            project_id: task.project_id,
            summary: `Developer lane failed merged PR settlement for task ${task.task_id}: ${summarizeError(error)}. Fix the task session blocker and retry assignment.`,
            task_id: task.task_id,
          });
        }
      }

      return;
    }

    const unassignedTasks = tasks.filter(
      (task) => !task.done && task.session_id === null,
    );
    const activeProjectIds = [...new Set(tasks.map((task) => task.project_id))];

    for (const task of unassignedTasks) {
      if (abortController.signal.aborted) {
        return;
      }

      try {
        const unmetDependencyIds = await getUnmetDependencyIds(task, tasksById);

        if (unmetDependencyIds.length > 0) {
          onLaneEvent?.({
            event: "noop",
            lane_name: "developer",
            project_id: task.project_id,
            summary: `Developer lane skipped task ${task.task_id} in project ${task.project_id}: unresolved dependencies ${unmetDependencyIds.join(", ")}.`,
            task_id: task.task_id,
          });
          continue;
        }

        const startEligibility = await canStartTask(task);
        if (!startEligibility.ok) {
          onLaneEvent?.({
            event: "idle",
            lane_name: "developer",
            project_id: task.project_id,
            summary: startEligibility.reason,
            task_id: task.task_id,
          });
          continue;
        }

        await bindTask(task);
      } catch (error) {
        logger?.error(
          {
            err: error,
            event: "developer_task_failed",
            project_id: task.project_id,
            task_id: task.task_id,
          },
          `Developer failed while assigning task ${task.task_id}`,
        );
        onLaneEvent?.({
          event: "failure",
          lane_name: "developer",
          project_id: task.project_id,
          summary: `Developer lane failed for task ${task.task_id}: ${summarizeError(error)}. Fix the task session blocker and retry assignment.`,
          task_id: task.task_id,
        });
      }
    }

    if (unassignedTasks.length === 0) {
      const assignedTasks = tasks.filter(
        (task) => !task.done && task.session_id !== null,
      );

      if (assignedTasks.length === 0) {
        for (const projectId of activeProjectIds) {
          onLaneEvent?.({
            event: "idle",
            lane_name: "developer",
            project_id: projectId,
            summary: "Developer lane idle: no unassigned unfinished tasks.",
          });
        }
      }

      for (const task of assignedTasks) {
        if (abortController.signal.aborted) {
          return;
        }

        try {
          await continueAssignedPendingSession(task, tasksById);
        } catch (error) {
          logger?.error(
            {
              err: error,
              event: "developer_task_failed",
              project_id: task.project_id,
              task_id: task.task_id,
            },
            `Developer failed while continuing assigned pending session for task ${task.task_id}`,
          );
          onLaneEvent?.({
            event: "failure",
            lane_name: "developer",
            project_id: task.project_id,
            session_id: task.session_id ?? undefined,
            summary: `Developer lane failed assigned pending session continuation for task ${task.task_id}: ${summarizeError(error)}. Fix the task session blocker and retry continuation.`,
            task_id: task.task_id,
          });
        }
      }
    }
  };

  const loop = (async () => {
    while (!abortController.signal.aborted) {
      try {
        await heartbeat();
      } catch (error) {
        logger?.warn(
          { error: summarizeError(error), event: "developer_heartbeat_failed" },
          "Developer heartbeat failed",
        );
      }

      await cancelableSleep(heartbeatMs, {
        signal: abortController.signal,
      }).catch(() => undefined);
    }
  })();

  stack.defer(async () => {
    abortController.abort();
    await loop;
  });

  return {
    async [Symbol.asyncDispose]() {
      await stack.disposeAsync();
    },
  };
};
