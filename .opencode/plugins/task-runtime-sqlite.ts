import {
  buildFollowUpTaskPrompt,
  buildInitialTaskPrompt,
} from "./task-runtime-sqlite/prompt-builder.js";
import {
  createSessionRuntime,
  type SessionRuntimeHost,
} from "./task-runtime-sqlite/session-runtime.js";
import {
  createTaskRepository,
  TASK_STATUSES,
  type TaskStatus,
} from "./task-runtime-sqlite/task-repository.js";

export type SqliteTaskRuntimePluginOptions = {
  host?: SessionRuntimeHost;
  projectDir: string;
};

type ToolContext = {
  sessionID: string;
};

const createTaskBoundTools = (options: SqliteTaskRuntimePluginOptions) => {
  const getRepository = () =>
    createTaskRepository({
      now: () => new Date().toISOString(),
      projectDir: options.projectDir,
    });
  const getSessionRuntime = () => createSessionRuntime(options.host);

  const dispatchTasks = async () => {
    const repository = getRepository();
    const sessionRuntime = getSessionRuntime();
    const results: Array<{
      action: "continued" | "created" | "reclaimed" | "skipped_busy";
      sessionID: string;
      taskID: string;
    }> = [];

    for (const task of repository.listUnfinishedTasks()) {
      if (task.session_id) {
        const session = await sessionRuntime.getSession(task.session_id);

        if (session?.busy) {
          results.push({
            action: "skipped_busy",
            sessionID: task.session_id,
            taskID: task.task_id,
          });
          continue;
        }

        if (session) {
          await sessionRuntime.sendPrompt(
            session.id,
            buildFollowUpTaskPrompt(task),
          );
          results.push({
            action: "continued",
            sessionID: session.id,
            taskID: task.task_id,
          });
          continue;
        }
      }

      const session = await sessionRuntime.createSession();
      const previousSessionID = task.session_id;

      repository.assignSession(task.task_id, session.id);

      try {
        await sessionRuntime.sendPrompt(
          session.id,
          buildInitialTaskPrompt({ ...task, session_id: session.id }),
        );
      } catch (error) {
        repository.assignSession(task.task_id, previousSessionID);
        throw error;
      }

      results.push({
        action: task.session_id ? "reclaimed" : "created",
        sessionID: session.id,
        taskID: task.task_id,
      });
    }

    return results;
  };

  return {
    "dispatch-tasks": {
      schema: {},
      execute: dispatchTasks,
    },
    "list-processing-tasks": {
      schema: {},
      execute: () => getRepository().listProcessingTasks(),
    },
    "get-current-task": {
      schema: {},
      execute: (_input: Record<string, never>, context: ToolContext) =>
        getRepository().getRequiredTaskBySessionID(context.sessionID),
    },
    "mark-task-status": {
      schema: { status: [...TASK_STATUSES] },
      execute: (input: { status: TaskStatus }, context: ToolContext) =>
        getRepository().markTaskStatus({
          sessionID: context.sessionID,
          status: input.status,
        }),
    },
    "setup-worktree-path": {
      schema: { worktreePath: true },
      execute: (input: { worktreePath: string }, context: ToolContext) =>
        getRepository().setupWorktreePath({
          sessionID: context.sessionID,
          worktreePath: input.worktreePath,
        }),
    },
    "setup-pull-request-url": {
      schema: { pullRequestURL: true },
      execute: (input: { pullRequestURL: string }, context: ToolContext) =>
        getRepository().setupPullRequestURL({
          sessionID: context.sessionID,
          pullRequestURL: input.pullRequestURL,
        }),
    },
  };
};

export const createSqliteTaskRuntimePlugin = (
  options: SqliteTaskRuntimePluginOptions,
) => ({
  name: "sqlite-task-runtime",
  tools: createTaskBoundTools(options),
});
