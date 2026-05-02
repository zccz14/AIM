import type { Task } from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import { cancelableSleep } from "./cancelable-sleep.js";
import type { OpenCodeSessionManager } from "./opencode-session-manager.js";
import type { OptimizerLaneEventInput } from "./optimizer-lane-events.js";
import { buildTaskSessionPrompt } from "./task-continue-prompt.js";

type DeveloperSessionManager = Pick<OpenCodeSessionManager, "createSession">;

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
  listUnfinishedTasks(): Promise<Task[]>;
  updateTask?(
    taskId: string,
    patch: { session_id: string },
  ): Promise<null | Task>;
};

type CreateDeveloperOptions = {
  logger?: ApiLogger;
  onLaneEvent?: (event: OptimizerLaneEventInput) => void;
  sessionManager: DeveloperSessionManager;
  sessionRepository: DeveloperSessionRepository;
  taskRepository: DeveloperTaskRepository;
};

const heartbeatMs = 1000;

const summarizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const createDeveloper = ({
  logger,
  onLaneEvent,
  sessionManager,
  sessionRepository,
  taskRepository,
}: CreateDeveloperOptions): AsyncDisposable => {
  const stack = new AsyncDisposableStack();
  const abortController = new AbortController();

  const createTaskSession = async (task: Task, titlePrefix = "AIM Developer") =>
    sessionManager.createSession({
      prompt: buildTaskSessionPrompt(task),
      projectId: task.project_id,
      title: `${titlePrefix}: ${task.title}`,
    });

  const bindUnassignedTask = async (task: Task) => {
    onLaneEvent?.({
      event: "start",
      lane_name: "developer",
      project_id: task.project_id,
      summary: `Developer lane started session assignment for task ${task.task_id}.`,
      task_id: task.task_id,
    });

    const createdSession = await createTaskSession(task);
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

  const recoverMissingAssignedSession = async (task: Task) => {
    if (!taskRepository.updateTask) {
      throw new Error(
        "Task repository does not support rebinding unavailable assigned sessions",
      );
    }

    const createdSession = await createTaskSession(
      task,
      "AIM Developer Recovery",
    );
    const reboundTask = await taskRepository.updateTask(task.task_id, {
      session_id: createdSession.session_id,
    });

    if (
      reboundTask?.session_id === createdSession.session_id &&
      !reboundTask.done
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
      summary: `Developer lane skipped assigned session rebind for task ${task.task_id}: another session claimed it or the task finished.`,
      task_id: task.task_id,
    });
  };

  const ensureAssignedTaskSession = async (task: Task) => {
    if (!task.session_id) {
      return;
    }

    const session = await sessionRepository.getSessionById(task.session_id);

    if (!session) {
      await recoverMissingAssignedSession(task);
      return;
    }

    onLaneEvent?.({
      event: "noop",
      lane_name: "developer",
      project_id: task.project_id,
      session_id: task.session_id,
      summary: `Developer lane kept task ${task.task_id} bound to existing OpenCode session ${task.session_id}.`,
      task_id: task.task_id,
    });
  };

  const heartbeat = async () => {
    const tasks = await taskRepository.listUnfinishedTasks();
    const activeProjectIds = [...new Set(tasks.map((task) => task.project_id))];

    for (const task of tasks) {
      if (abortController.signal.aborted) {
        return;
      }

      if (task.done) {
        continue;
      }

      try {
        if (task.session_id === null) {
          await bindUnassignedTask(task);
        } else {
          await ensureAssignedTaskSession(task);
        }
      } catch (error) {
        logger?.error(
          {
            err: error,
            event: "developer_task_failed",
            project_id: task.project_id,
            task_id: task.task_id,
          },
          `Developer failed while ensuring task session binding for task ${task.task_id}`,
        );
        onLaneEvent?.({
          event: "failure",
          lane_name: "developer",
          project_id: task.project_id,
          session_id: task.session_id ?? undefined,
          summary: `Developer lane failed for task ${task.task_id}: ${summarizeError(error)}. Fix the task session blocker and retry assignment.`,
          task_id: task.task_id,
        });
      }
    }

    if (tasks.length === 0) {
      for (const projectId of activeProjectIds) {
        onLaneEvent?.({
          event: "idle",
          lane_name: "developer",
          project_id: projectId,
          summary: "Developer lane idle: no unfinished tasks.",
        });
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
