import { openTaskRuntimeDatabase, type TaskRecord } from "./database.js";

type ProcessingTaskRecord = Pick<
  TaskRecord,
  | "task_id"
  | "session_id"
  | "worktree_path"
  | "pull_request_url"
  | "status"
  | "updated_at"
>;

type CreateTaskRepositoryOptions = {
  projectDir: string;
  now: () => string;
};

export const TASK_STATUSES = [
  "created",
  "running",
  "outbound",
  "pr_following",
  "closing",
  "succeeded",
  "failed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TERMINAL_TASK_STATUSES = new Set<TaskStatus>(["succeeded", "failed"]);

const isTaskStatus = (status: string): status is TaskStatus =>
  TASK_STATUSES.includes(status as TaskStatus);

const assertTaskStatus = (status: string): TaskStatus => {
  if (!isTaskStatus(status)) {
    throw new Error(`Unsupported task status: ${status}`);
  }

  return status;
};

type MarkTaskStatusInput = {
  sessionID: string;
  status: TaskStatus;
};

type SetupWorktreePathInput = {
  sessionID: string;
  worktreePath: string;
};

type SetupPullRequestURLInput = {
  sessionID: string;
  pullRequestURL: string;
};

export type TaskRepository = {
  listUnfinishedTasks(): TaskRecord[];
  listProcessingTasks(): ProcessingTaskRecord[];
  getTaskBySessionID(sessionID: string): TaskRecord | undefined;
  getRequiredTaskBySessionID(sessionID: string): TaskRecord;
  assignSession(taskID: string, sessionID: string | null): void;
  markTaskStatus(input: MarkTaskStatusInput): void;
  setupWorktreePath(input: SetupWorktreePathInput): void;
  setupPullRequestURL(input: SetupPullRequestURLInput): void;
};

const mapTaskRecord = (row: Record<string, unknown>): TaskRecord => ({
  task_id: String(row.task_id),
  task_spec: String(row.task_spec),
  session_id: row.session_id === null ? null : String(row.session_id),
  worktree_path: row.worktree_path === null ? null : String(row.worktree_path),
  pull_request_url:
    row.pull_request_url === null ? null : String(row.pull_request_url),
  status: row.status === null ? null : String(row.status),
  done: Boolean(Number(row.done)),
  updated_at: row.updated_at === null ? null : String(row.updated_at),
});

const mapProcessingTaskRecord = (
  row: Record<string, unknown>,
): ProcessingTaskRecord => ({
  task_id: String(row.task_id),
  session_id: row.session_id === null ? null : String(row.session_id),
  worktree_path: row.worktree_path === null ? null : String(row.worktree_path),
  pull_request_url:
    row.pull_request_url === null ? null : String(row.pull_request_url),
  status: row.status === null ? null : String(row.status),
  updated_at: row.updated_at === null ? null : String(row.updated_at),
});

const getTasksBySessionID = (
  projectDir: string,
  sessionID: string,
): TaskRecord[] => {
  const database = openTaskRuntimeDatabase(projectDir);

  try {
    const statement = database.prepare(
      `
        SELECT
          task_id,
          task_spec,
          session_id,
          worktree_path,
          pull_request_url,
          status,
          done,
          updated_at
        FROM tasks
        WHERE session_id = ?
      `,
    );

    return statement
      .all(sessionID)
      .map((row) => mapTaskRecord(row as Record<string, unknown>));
  } finally {
    database.close();
  }
};

export const createTaskRepository = ({
  projectDir,
  now,
}: CreateTaskRepositoryOptions): TaskRepository => {
  const updateTask = (
    taskID: string,
    query: string,
    ...params: Array<string | number | null>
  ) => {
    const database = openTaskRuntimeDatabase(projectDir);

    try {
      database.prepare(query).run(...params, now(), taskID);
    } finally {
      database.close();
    }
  };

  return {
    listUnfinishedTasks() {
      const database = openTaskRuntimeDatabase(projectDir);

      try {
        const statement = database.prepare(
          `
          SELECT
            task_id,
            task_spec,
            session_id,
            worktree_path,
            pull_request_url,
            status,
            done,
            updated_at
          FROM tasks
          WHERE done = 0
          ORDER BY task_id
        `,
        );

        return statement
          .all()
          .map((row) => mapTaskRecord(row as Record<string, unknown>));
      } finally {
        database.close();
      }
    },

    listProcessingTasks() {
      const database = openTaskRuntimeDatabase(projectDir);

      try {
        const statement = database.prepare(
          `
          SELECT
            task_id,
            session_id,
            worktree_path,
            pull_request_url,
            status,
            updated_at
          FROM tasks
          WHERE done = 0
          ORDER BY task_id
        `,
        );

        return statement
          .all()
          .map((row) =>
            mapProcessingTaskRecord(row as Record<string, unknown>),
          );
      } finally {
        database.close();
      }
    },

    getTaskBySessionID(sessionID) {
      const matches = getTasksBySessionID(projectDir, sessionID);

      if (matches.length > 1) {
        throw new Error(`Multiple tasks are bound to session ${sessionID}`);
      }

      return matches[0];
    },

    getRequiredTaskBySessionID(sessionID) {
      const matches = getTasksBySessionID(projectDir, sessionID);

      if (matches.length === 0) {
        throw new Error("Current session is not bound to a task");
      }

      if (matches.length > 1) {
        throw new Error(`Multiple tasks are bound to session ${sessionID}`);
      }

      return matches[0];
    },

    assignSession(taskID, sessionID) {
      const database = openTaskRuntimeDatabase(projectDir);

      try {
        const statement = database.prepare(
          `
          UPDATE tasks
          SET session_id = ?, updated_at = ?
          WHERE task_id = ?
        `,
        );

        statement.run(sessionID, now(), taskID);
      } finally {
        database.close();
      }
    },

    markTaskStatus({ sessionID, status }) {
      const task = this.getRequiredTaskBySessionID(sessionID);
      const nextStatus = assertTaskStatus(status);
      const currentStatus =
        task.status === null ? null : assertTaskStatus(task.status);

      if (
        currentStatus !== null &&
        TERMINAL_TASK_STATUSES.has(currentStatus) &&
        !TERMINAL_TASK_STATUSES.has(nextStatus)
      ) {
        throw new Error(
          "Cannot move terminal task back to non-terminal status",
        );
      }

      if (
        currentStatus !== null &&
        TERMINAL_TASK_STATUSES.has(currentStatus) &&
        currentStatus !== nextStatus
      ) {
        throw new Error("Cannot overwrite terminal task status");
      }

      const done = TERMINAL_TASK_STATUSES.has(nextStatus);

      updateTask(
        task.task_id,
        `
          UPDATE tasks
          SET status = ?, done = ?, updated_at = ?
          WHERE task_id = ?
        `,
        nextStatus,
        done ? 1 : 0,
      );
    },

    setupWorktreePath({ sessionID, worktreePath }) {
      const task = this.getRequiredTaskBySessionID(sessionID);

      updateTask(
        task.task_id,
        `
          UPDATE tasks
          SET worktree_path = ?, updated_at = ?
          WHERE task_id = ?
        `,
        worktreePath,
      );
    },

    setupPullRequestURL({ sessionID, pullRequestURL }) {
      const task = this.getRequiredTaskBySessionID(sessionID);

      updateTask(
        task.task_id,
        `
          UPDATE tasks
          SET pull_request_url = ?, updated_at = ?
          WHERE task_id = ?
        `,
        pullRequestURL,
      );
    },
  };
};
