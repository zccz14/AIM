import type { Task } from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import { execGit } from "./exec-file.js";
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

type DeveloperSessionCreator = Pick<OpenCodeSessionManager, "createSession">;

type DeveloperTaskRepository = {
  assignSessionIfUnassigned(
    taskId: string,
    sessionId: string,
  ): Promise<null | Task>;
  listRejectedTasksByProject(projectId: string): Promise<Task[]>;
  listUnfinishedTasks(): Promise<Task[]>;
};

type CreateDeveloperOptions = {
  baselineRepository?: BaselineRepository;
  logger?: ApiLogger;
  onLaneEvent?: (event: OptimizerLaneEventInput) => void;
  sessionManager: DeveloperSessionCreator;
  taskRepository: DeveloperTaskRepository;
};

type ManagedDeveloperSession = Awaited<
  ReturnType<DeveloperSessionCreator["createSession"]>
>;

const heartbeatMs = 1000;

const git = async (projectDirectory: string, args: string[]) =>
  (await execGit(projectDirectory, args, { target: projectDirectory })).trim();

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

const summarizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const sleep = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();

      return;
    }

    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

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

export const createDeveloper = ({
  baselineRepository = defaultBaselineRepository,
  logger,
  onLaneEvent,
  sessionManager,
  taskRepository,
}: CreateDeveloperOptions): AsyncDisposable => {
  const stack = new AsyncDisposableStack();
  const abortController = new AbortController();
  const activeSessions = new Map<string, ManagedDeveloperSession>();

  const bindTask = async (task: Task, unfinishedTasks: Task[]) => {
    let createdSession: ManagedDeveloperSession | null = null;

    try {
      onLaneEvent?.({
        event: "start",
        lane_name: "developer",
        project_id: task.project_id,
        summary: `Developer lane started session assignment for task ${task.task_id}.`,
        task_id: task.task_id,
      });
      const directory = await ensureProjectWorkspace(task);
      const [baselineFacts, rejectedTasks] = await Promise.all([
        baselineRepository.getLatestBaselineFacts(directory),
        taskRepository.listRejectedTasksByProject(task.project_id),
      ]);
      const activeTasks = unfinishedTasks
        .filter((activeTask) => activeTask.project_id === task.project_id)
        .map(withExplicitSourceBaselineFreshness);
      createdSession = await sessionManager.createSession({
        directory,
        model: {
          modelID: task.global_model_id,
          providerID: task.global_provider_id,
        },
        prompt: buildTaskSessionPrompt(task, {
          activeTasks,
          baselineFacts,
          rejectedTasks,
        }),
        title: `AIM Developer: ${task.title}`,
      });

      const assignedTask = await taskRepository.assignSessionIfUnassigned(
        task.task_id,
        createdSession.sessionId,
      );

      if (
        assignedTask?.session_id === createdSession.sessionId &&
        !assignedTask.done
      ) {
        activeSessions.set(createdSession.sessionId, createdSession);
        onLaneEvent?.({
          event: "success",
          lane_name: "developer",
          project_id: task.project_id,
          session_id: createdSession.sessionId,
          summary: `Developer lane assigned task ${task.task_id} to session ${createdSession.sessionId}.`,
          task_id: task.task_id,
        });
        createdSession = null;
        return;
      }

      await createdSession[Symbol.asyncDispose]();
      onLaneEvent?.({
        event: "noop",
        lane_name: "developer",
        project_id: task.project_id,
        session_id: createdSession.sessionId,
        summary: `Developer lane skipped task ${task.task_id}: another session already claimed it or the task finished.`,
        task_id: task.task_id,
      });
      createdSession = null;
    } catch (error) {
      if (createdSession) {
        await createdSession[Symbol.asyncDispose]();
      }

      throw error;
    }
  };

  const heartbeat = async () => {
    const tasks = await taskRepository.listUnfinishedTasks();
    const unassignedTasks = tasks.filter(
      (task) => !task.done && task.session_id === null,
    );
    const activeProjectIds = [...new Set(tasks.map((task) => task.project_id))];

    if (unassignedTasks.length === 0) {
      for (const projectId of activeProjectIds) {
        onLaneEvent?.({
          event: "idle",
          lane_name: "developer",
          project_id: projectId,
          summary: "Developer lane idle: no unassigned unfinished tasks.",
        });
      }
    }

    for (const task of unassignedTasks) {
      if (abortController.signal.aborted) {
        return;
      }

      try {
        await bindTask(task, tasks);
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

      await sleep(heartbeatMs, abortController.signal);
    }
  })();

  stack.defer(async () => {
    abortController.abort();
    await loop;
    const sessions = [...activeSessions.values()];
    activeSessions.clear();
    await Promise.all(
      sessions.map((session) => session[Symbol.asyncDispose]()),
    );
  });

  return {
    async [Symbol.asyncDispose]() {
      await stack.disposeAsync();
    },
  };
};
