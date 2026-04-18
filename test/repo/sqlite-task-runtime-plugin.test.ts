import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getTaskRuntimeDatabasePath,
  openTaskRuntimeDatabase,
  type TaskRecord,
} from "../../.opencode/plugins/task-runtime-sqlite/database.ts";
import {
  buildFollowUpTaskPrompt,
  buildInitialTaskPrompt,
} from "../../.opencode/plugins/task-runtime-sqlite/prompt-builder.ts";
import { createSessionRuntime } from "../../.opencode/plugins/task-runtime-sqlite/session-runtime.ts";
import { createTaskRepository } from "../../.opencode/plugins/task-runtime-sqlite/task-repository.ts";

const createTaskDatabase = async (caseName: string) => {
  const projectDir = join(
    process.cwd(),
    "test/repo/.tmp/sqlite-task-runtime-plugin",
    caseName,
  );

  await rm(projectDir, { force: true, recursive: true });
  await mkdir(projectDir, { recursive: true });

  const database = openTaskRuntimeDatabase(projectDir);

  const seedTasks = (
    tasks: Array<
      Partial<TaskRecord> & Pick<TaskRecord, "task_id" | "task_spec">
    >,
  ) => {
    const insert = database.prepare(`
      INSERT INTO tasks (
        task_id,
        task_spec,
        session_id,
        worktree_path,
        pull_request_url,
        status,
        done,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const task of tasks) {
      insert.run(
        task.task_id,
        task.task_spec,
        task.session_id ?? null,
        task.worktree_path ?? null,
        task.pull_request_url ?? null,
        task.status ?? null,
        task.done === undefined ? 0 : task.done ? 1 : 0,
        task.updated_at ?? null,
      );
    }
  };

  const cleanup = async () => {
    database.close();
    await rm(projectDir, { force: true, recursive: true });
  };

  return { cleanup, projectDir, seedTasks };
};

const createEmptyProjectDir = async (caseName: string) => {
  const projectDir = join(
    process.cwd(),
    "test/repo/.tmp/sqlite-task-runtime-plugin",
    caseName,
  );

  await rm(projectDir, { force: true, recursive: true });
  await mkdir(projectDir, { recursive: true });

  return {
    cleanup: async () => {
      await rm(projectDir, { force: true, recursive: true });
    },
    projectDir,
  };
};

describe("sqlite task runtime plugin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock("../../.opencode/plugins/task-runtime-sqlite/database.ts");
    vi.doUnmock(
      "../../.opencode/plugins/task-runtime-sqlite/task-repository.ts",
    );
    vi.doUnmock(
      "../../.opencode/plugins/task-runtime-sqlite/session-runtime.ts",
    );
    vi.doUnmock(
      "../../.opencode/plugins/task-runtime-sqlite/prompt-builder.ts",
    );
  });

  it("registers the approved six tools on the plugin entrypoint", async () => {
    const { createSqliteTaskRuntimePlugin } = await import(
      "../../.opencode/plugins/task-runtime-sqlite.ts"
    );
    const plugin = createSqliteTaskRuntimePlugin({ projectDir: process.cwd() });

    const registeredTools = Object.keys(plugin.tools);

    expect(registeredTools).toEqual([
      "dispatch-tasks",
      "list-processing-tasks",
      "get-current-task",
      "mark-task-status",
      "setup-worktree-path",
      "setup-pull-request-url",
    ]);
  });

  it("does not eagerly initialize task runtime collaborators", async () => {
    const createTaskRuntimeDatabase = vi.fn(() => {
      throw new Error("should not initialize database for scaffold");
    });
    const createTaskRepository = vi.fn(() => {
      throw new Error("should not initialize repository for scaffold");
    });
    const createSessionRuntime = vi.fn(() => {
      throw new Error("should not initialize session runtime for scaffold");
    });
    const createPromptBuilder = vi.fn(() => {
      throw new Error("should not initialize prompt builder for scaffold");
    });

    vi.doMock(
      "../../.opencode/plugins/task-runtime-sqlite/database.ts",
      () => ({
        createTaskRuntimeDatabase,
      }),
    );
    vi.doMock(
      "../../.opencode/plugins/task-runtime-sqlite/task-repository.ts",
      () => ({
        createTaskRepository,
        TASK_STATUSES: [
          "created",
          "running",
          "outbound",
          "pr_following",
          "closing",
          "succeeded",
          "failed",
        ],
      }),
    );
    vi.doMock(
      "../../.opencode/plugins/task-runtime-sqlite/session-runtime.ts",
      () => ({ createSessionRuntime }),
    );
    vi.doMock(
      "../../.opencode/plugins/task-runtime-sqlite/prompt-builder.ts",
      () => ({ createPromptBuilder }),
    );

    const { createSqliteTaskRuntimePlugin } = await import(
      "../../.opencode/plugins/task-runtime-sqlite.ts"
    );

    expect(() =>
      createSqliteTaskRuntimePlugin({ projectDir: process.cwd() }),
    ).not.toThrow();
    expect(createTaskRuntimeDatabase).not.toHaveBeenCalled();
    expect(createTaskRepository).not.toHaveBeenCalled();
    expect(createSessionRuntime).not.toHaveBeenCalled();
    expect(createPromptBuilder).not.toHaveBeenCalled();
  });

  it("opens aim.sqlite under the project directory", async () => {
    const projectDir = join(
      process.cwd(),
      "test/repo/.tmp/sqlite-task-runtime-plugin/database-helper",
    );

    await rm(projectDir, { force: true, recursive: true });
    await mkdir(projectDir, { recursive: true });

    try {
      const database = openTaskRuntimeDatabase(projectDir);
      database.close();

      await expect(
        access(getTaskRuntimeDatabasePath(projectDir)),
      ).resolves.toBeUndefined();
    } finally {
      await rm(projectDir, { force: true, recursive: true });
    }
  });

  it("always resolves aim.sqlite under the project directory", () => {
    expect(getTaskRuntimeDatabasePath("/repo/worktree")).toBe(
      "/repo/worktree/aim.sqlite",
    );
  });

  it("bootstraps aim.sqlite and the tasks table for an empty project", async () => {
    const emptyProject = await createEmptyProjectDir("bootstrap-empty-project");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T00:00:00.000Z",
        projectDir: emptyProject.projectDir,
      });

      expect(repository.listUnfinishedTasks()).toEqual([]);
      await expect(
        access(getTaskRuntimeDatabasePath(emptyProject.projectDir)),
      ).resolves.toBeUndefined();

      const database = new DatabaseSync(
        getTaskRuntimeDatabasePath(emptyProject.projectDir),
      );

      try {
        const tables = database
          .prepare(
            `
              SELECT name
              FROM sqlite_master
              WHERE type = 'table' AND name = 'tasks'
            `,
          )
          .all();

        expect(tables).toEqual([{ name: "tasks" }]);

        database
          .prepare(
            `
              INSERT INTO tasks (task_id, task_spec)
              VALUES (?, ?)
            `,
          )
          .run("task-1", "bootstrapped task");
      } finally {
        database.close();
      }

      expect(repository.listUnfinishedTasks()).toEqual([
        {
          task_id: "task-1",
          task_spec: "bootstrapped task",
          session_id: null,
          worktree_path: null,
          pull_request_url: null,
          status: null,
          done: false,
          updated_at: null,
        },
      ]);
    } finally {
      await emptyProject.cleanup();
    }
  });

  it("rejects an existing tasks table missing done not-null default contract", async () => {
    const emptyProject = await createEmptyProjectDir("incompatible-tasks-schema");

    try {
      const database = new DatabaseSync(
        getTaskRuntimeDatabasePath(emptyProject.projectDir),
      );

      try {
        database.exec(`
          CREATE TABLE tasks (
            task_id TEXT NOT NULL,
            task_spec TEXT NOT NULL,
            session_id TEXT,
            worktree_path TEXT,
            pull_request_url TEXT,
            status TEXT,
            done INTEGER,
            updated_at TEXT
          )
        `);
      } finally {
        database.close();
      }

      const repository = createTaskRepository({
        now: () => "2026-04-18T00:00:00.000Z",
        projectDir: emptyProject.projectDir,
      });

      expect(() => repository.listUnfinishedTasks()).toThrow(
        "Existing tasks table schema is incompatible with sqlite task runtime",
      );
    } finally {
      await emptyProject.cleanup();
    }
  });

  it("lists only unfinished tasks from sqlite", async () => {
    const taskDatabase = await createTaskDatabase("unfinished-tasks");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T00:00:00.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        { task_id: "task-1", task_spec: "one", done: 0, status: "created" },
        {
          task_id: "task-2",
          task_spec: "two",
          done: 1,
          status: "succeeded",
        },
      ]);

      expect(repository.listUnfinishedTasks()).toEqual([
        expect.objectContaining({ task_id: "task-1", done: false }),
      ]);
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("lists processing task summaries from unfinished tasks", async () => {
    const taskDatabase = await createTaskDatabase("processing-tasks");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T00:00:00.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          session_id: "session-1",
          worktree_path: "/repo/.worktrees/task-1",
          pull_request_url: "https://example.com/pr/1",
          status: "running",
          done: 0,
          updated_at: "2026-04-18T01:00:00.000Z",
        },
        {
          task_id: "task-2",
          task_spec: "two",
          status: "succeeded",
          done: 1,
        },
      ]);

      expect(repository.listProcessingTasks()).toEqual([
        {
          task_id: "task-1",
          session_id: "session-1",
          worktree_path: "/repo/.worktrees/task-1",
          pull_request_url: "https://example.com/pr/1",
          status: "running",
          updated_at: "2026-04-18T01:00:00.000Z",
        },
      ]);
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("resolves exactly one task for the current session id", async () => {
    const taskDatabase = await createTaskDatabase("task-binding");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T00:00:00.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 0,
          status: "running",
          session_id: "session-1",
        },
      ]);

      expect(repository.getTaskBySessionID("session-1")?.task_id).toBe(
        "task-1",
      );
      expect(repository.getTaskBySessionID("missing-session")).toBeUndefined();
      expect(() =>
        repository.getRequiredTaskBySessionID("missing-session"),
      ).toThrow("Current session is not bound to a task");
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("fails when multiple tasks are bound to the same session id", async () => {
    const taskDatabase = await createTaskDatabase("duplicate-session-binding");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T00:00:00.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 0,
          status: "running",
          session_id: "session-1",
        },
        {
          task_id: "task-2",
          task_spec: "two",
          done: 0,
          status: "running",
          session_id: "session-1",
        },
      ]);

      expect(() => repository.getRequiredTaskBySessionID("session-1")).toThrow(
        "Multiple tasks are bound to session session-1",
      );
      expect(() => repository.getTaskBySessionID("session-1")).toThrow(
        "Multiple tasks are bound to session session-1",
      );
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("assigns a session id to a task", async () => {
    const taskDatabase = await createTaskDatabase("assign-session");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        { task_id: "task-1", task_spec: "one", done: 0 },
      ]);

      repository.assignSession("task-1", "session-1");

      expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
        session_id: "session-1",
        task_id: "task-1",
        updated_at: "2026-04-18T12:34:56.000Z",
      });
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("marks terminal statuses as done and refreshes updated_at", async () => {
    const taskDatabase = await createTaskDatabase("mark-terminal-status");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 0,
          status: "running",
          session_id: "session-1",
        },
      ]);

      repository.markTaskStatus({
        sessionID: "session-1",
        status: "succeeded",
      });

      expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
        status: "succeeded",
        done: true,
        updated_at: "2026-04-18T12:34:56.000Z",
      });
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("keeps non-terminal statuses unfinished", async () => {
    const taskDatabase = await createTaskDatabase("mark-non-terminal-status");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 0,
          status: "running",
          session_id: "session-1",
        },
      ]);

      repository.markTaskStatus({
        sessionID: "session-1",
        status: "pr_following",
      });

      expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
        status: "pr_following",
        done: false,
        updated_at: "2026-04-18T12:34:56.000Z",
      });
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("rejects statuses outside the approved task status set", async () => {
    const taskDatabase = await createTaskDatabase("reject-invalid-status");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 0,
          status: "running",
          session_id: "session-1",
        },
      ]);

      expect(() =>
        repository.markTaskStatus({
          sessionID: "session-1",
          status: "unknown_status",
        }),
      ).toThrow("Unsupported task status: unknown_status");
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("does not roll a terminal task back to unfinished", async () => {
    const taskDatabase = await createTaskDatabase("preserve-terminal-status");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 1,
          status: "succeeded",
          session_id: "session-1",
          updated_at: "2026-04-18T00:00:00.000Z",
        },
      ]);

      expect(() =>
        repository.markTaskStatus({
          sessionID: "session-1",
          status: "running",
        }),
      ).toThrow("Cannot move terminal task back to non-terminal status");

      expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
        status: "succeeded",
        done: true,
        updated_at: "2026-04-18T00:00:00.000Z",
      });
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("rejects overwriting succeeded with failed", async () => {
    const taskDatabase = await createTaskDatabase("reject-succeeded-to-failed");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 1,
          status: "succeeded",
          session_id: "session-1",
          updated_at: "2026-04-18T00:00:00.000Z",
        },
      ]);

      expect(() =>
        repository.markTaskStatus({
          sessionID: "session-1",
          status: "failed",
        }),
      ).toThrow("Cannot overwrite terminal task status");

      expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
        status: "succeeded",
        done: true,
        updated_at: "2026-04-18T00:00:00.000Z",
      });
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("rejects overwriting failed with succeeded", async () => {
    const taskDatabase = await createTaskDatabase("reject-failed-to-succeeded");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 1,
          status: "failed",
          session_id: "session-1",
          updated_at: "2026-04-18T00:00:00.000Z",
        },
      ]);

      expect(() =>
        repository.markTaskStatus({
          sessionID: "session-1",
          status: "succeeded",
        }),
      ).toThrow("Cannot overwrite terminal task status");

      expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
        status: "failed",
        done: true,
        updated_at: "2026-04-18T00:00:00.000Z",
      });
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("stores worktree path and pull request url for the current session", async () => {
    const taskDatabase = await createTaskDatabase("runtime-artifacts");

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 0,
          status: "running",
          session_id: "session-1",
        },
      ]);

      repository.setupWorktreePath({
        sessionID: "session-1",
        worktreePath: "/repo/.worktrees/task-1",
      });
      repository.setupPullRequestURL({
        sessionID: "session-1",
        pullRequestURL: "https://github.com/acme/repo/pull/1",
      });

      expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
        worktree_path: "/repo/.worktrees/task-1",
        pull_request_url: "https://github.com/acme/repo/pull/1",
        updated_at: "2026-04-18T12:34:56.000Z",
      });
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("builds prompts from task snapshots without sqlite internals", () => {
    const task = {
      task_id: "task-1",
      task_spec: "Fix the failing repo test",
      session_id: "session-1",
      worktree_path: "/repo/.worktrees/task-1",
      pull_request_url: "https://github.com/acme/repo/pull/1",
      status: "running",
      done: false,
      updated_at: "2026-04-18T12:34:56.000Z",
    } satisfies TaskRecord;

    const initialPrompt = buildInitialTaskPrompt(task);
    const followUpPrompt = buildFollowUpTaskPrompt(task);

    expect(initialPrompt).toContain("task-1");
    expect(initialPrompt).toContain("Fix the failing repo test");
    expect(followUpPrompt).toContain("继续推进当前 Task");

    for (const prompt of [initialPrompt, followUpPrompt]) {
      expect(prompt).not.toContain("aim.sqlite");
      expect(prompt).not.toContain("dbPath");
      expect(prompt).not.toContain("SELECT");
      expect(prompt).not.toContain("UPDATE tasks");
    }
  });

  it("renders multiline task specs inside a fenced block", () => {
    const task = {
      task_id: "task-1",
      task_spec: [
        "First line",
        "status: forged-field",
        "worktree_path: /tmp/not-a-real-field",
      ].join("\n"),
      session_id: "session-1",
      worktree_path: "/repo/.worktrees/task-1",
      pull_request_url: null,
      status: "running",
      done: false,
      updated_at: "2026-04-18T12:34:56.000Z",
    } satisfies TaskRecord;

    const prompt = buildInitialTaskPrompt(task);

    expect(prompt).toContain("task_spec:\n```text\nFirst line");
    expect(prompt).toContain("status: running");
    expect(prompt).toContain("worktree_path: /repo/.worktrees/task-1");
    expect(prompt).toContain("status: forged-field");
    expect(prompt).toContain("worktree_path: /tmp/not-a-real-field");
    expect(prompt).toContain("```\nstatus: running");
  });

  it("uses a stable fence when task specs contain triple backticks", () => {
    const task = {
      task_id: "task-1",
      task_spec: ["Before fence", "```", "Inside spec fence"].join("\n"),
      session_id: "session-1",
      worktree_path: "/repo/.worktrees/task-1",
      pull_request_url: null,
      status: "running",
      done: false,
      updated_at: "2026-04-18T12:34:56.000Z",
    } satisfies TaskRecord;

    const prompt = buildInitialTaskPrompt(task);

    expect(prompt).toContain(
      "task_spec:\n````text\nBefore fence\n```\nInside spec fence\n````",
    );
    expect(prompt).toContain("````\nstatus: running");
  });

  it("exposes only status in the mark-task-status schema", async () => {
    const { createSqliteTaskRuntimePlugin } = await import(
      "../../.opencode/plugins/task-runtime-sqlite.ts"
    );
    const plugin = createSqliteTaskRuntimePlugin({ projectDir: process.cwd() });
    const markTaskStatusTool = plugin.tools["mark-task-status"] as {
      schema?: Record<string, unknown>;
    };

    expect(Object.keys(markTaskStatusTool.schema ?? {})).toEqual(["status"]);
    expect(markTaskStatusTool.schema).toMatchObject({
      status: [
        "created",
        "running",
        "outbound",
        "pr_following",
        "closing",
        "succeeded",
        "failed",
      ],
    });
    expect(markTaskStatusTool.schema).not.toHaveProperty("task_id");
    expect(markTaskStatusTool.schema).not.toHaveProperty("done");
    expect(markTaskStatusTool.schema).not.toHaveProperty("updated_at");
  });

  it("binds task-bound tools to the current session id", async () => {
    const taskDatabase = await createTaskDatabase("task-bound-tools");

    try {
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          done: 0,
          status: "running",
          session_id: "session-1",
        },
      ]);

      await (
        plugin.tools["setup-worktree-path"] as {
          execute: (
            input: { worktreePath: string },
            context: { sessionID: string },
          ) => Promise<unknown> | unknown;
        }
      ).execute(
        { worktreePath: "/repo/.worktrees/task-1" },
        { sessionID: "session-1" },
      );

      await (
        plugin.tools["setup-pull-request-url"] as {
          execute: (
            input: { pullRequestURL: string },
            context: { sessionID: string },
          ) => Promise<unknown> | unknown;
        }
      ).execute(
        { pullRequestURL: "https://github.com/acme/repo/pull/1" },
        { sessionID: "session-1" },
      );

      expect(
        await (
          plugin.tools["get-current-task"] as {
            execute: (
              input: Record<string, never>,
              context: { sessionID: string },
            ) => Promise<TaskRecord> | TaskRecord;
          }
        ).execute({}, { sessionID: "session-1" }),
      ).toMatchObject({
        task_id: "task-1",
        worktree_path: "/repo/.worktrees/task-1",
        pull_request_url: "https://github.com/acme/repo/pull/1",
      });

      await (
        plugin.tools["mark-task-status"] as {
          execute: (
            input: { status: string },
            context: { sessionID: string },
          ) => Promise<unknown> | unknown;
        }
      ).execute({ status: "succeeded" }, { sessionID: "session-1" });

      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      expect(repository.getRequiredTaskBySessionID("session-1")).toMatchObject({
        status: "succeeded",
        done: true,
      });
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("keeps only name and tools on the plugin public surface", async () => {
    const { createSqliteTaskRuntimePlugin } = await import(
      "../../.opencode/plugins/task-runtime-sqlite.ts"
    );
    const plugin = createSqliteTaskRuntimePlugin({ projectDir: process.cwd() });

    expect(Object.keys(plugin)).toEqual(["name", "tools"]);
  });

  it("continues an existing idle session for an unfinished task", async () => {
    const taskDatabase = await createTaskDatabase("dispatch-continued-idle");

    try {
      const sessionRuntime = {
        createSession: vi.fn(),
        getSession: vi.fn().mockResolvedValue({ busy: false, id: "session-1" }),
        sendPrompt: vi.fn().mockResolvedValue(undefined),
      };
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        host: sessionRuntime,
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "Continue the queued task",
          done: 0,
          session_id: "session-1",
          status: "running",
        },
      ]);

      const result = await (
        plugin.tools["dispatch-tasks"] as {
          execute: () => Promise<unknown>;
        }
      ).execute();

      expect(result).toEqual([
        { action: "continued", sessionID: "session-1", taskID: "task-1" },
      ]);
      expect(sessionRuntime.getSession).toHaveBeenCalledWith("session-1");
      expect(sessionRuntime.createSession).not.toHaveBeenCalled();
      expect(sessionRuntime.sendPrompt).toHaveBeenCalledWith(
        "session-1",
        expect.stringContaining("继续推进当前 Task"),
      );
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("skips a busy session without sending a duplicate prompt", async () => {
    const taskDatabase = await createTaskDatabase("dispatch-skipped-busy");

    try {
      const sessionRuntime = {
        createSession: vi.fn(),
        getSession: vi.fn().mockResolvedValue({ busy: true, id: "session-1" }),
        sendPrompt: vi.fn().mockResolvedValue(undefined),
      };
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        host: sessionRuntime,
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "Keep waiting",
          done: 0,
          session_id: "session-1",
          status: "running",
        },
      ]);

      const result = await (
        plugin.tools["dispatch-tasks"] as {
          execute: () => Promise<unknown>;
        }
      ).execute();

      expect(result).toEqual([
        {
          action: "skipped_busy",
          sessionID: "session-1",
          taskID: "task-1",
        },
      ]);
      expect(sessionRuntime.createSession).not.toHaveBeenCalled();
      expect(sessionRuntime.sendPrompt).not.toHaveBeenCalled();
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("reclaims a task when its previous session no longer exists", async () => {
    const taskDatabase = await createTaskDatabase("dispatch-reclaimed");

    try {
      const sessionRuntime = {
        createSession: vi.fn().mockResolvedValue({ id: "session-2" }),
        getSession: vi.fn().mockResolvedValue(null),
        sendPrompt: vi.fn().mockResolvedValue(undefined),
      };
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        host: sessionRuntime,
        projectDir: taskDatabase.projectDir,
      });
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "Resume after session loss",
          done: 0,
          session_id: "session-1",
          status: "running",
        },
      ]);

      const result = await (
        plugin.tools["dispatch-tasks"] as {
          execute: () => Promise<unknown>;
        }
      ).execute();

      expect(result).toEqual([
        { action: "reclaimed", sessionID: "session-2", taskID: "task-1" },
      ]);
      expect(repository.getTaskBySessionID("session-2")?.task_id).toBe(
        "task-1",
      );
      expect(sessionRuntime.sendPrompt).toHaveBeenCalledWith(
        "session-2",
        expect.stringContaining("Resume after session loss"),
      );
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("creates and assigns a new session for an unbound unfinished task", async () => {
    const taskDatabase = await createTaskDatabase("dispatch-created");

    try {
      const sessionRuntime = {
        createSession: vi.fn().mockResolvedValue({ id: "session-3" }),
        getSession: vi.fn(),
        sendPrompt: vi.fn().mockResolvedValue(undefined),
      };
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        host: sessionRuntime,
        projectDir: taskDatabase.projectDir,
      });
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-2",
          task_spec: "Create a fresh session",
          done: 0,
          session_id: null,
          status: "created",
        },
      ]);

      const result = await (
        plugin.tools["dispatch-tasks"] as {
          execute: () => Promise<unknown>;
        }
      ).execute();

      expect(result).toEqual([
        { action: "created", sessionID: "session-3", taskID: "task-2" },
      ]);
      expect(sessionRuntime.getSession).not.toHaveBeenCalled();
      expect(repository.getTaskBySessionID("session-3")?.task_id).toBe(
        "task-2",
      );
      expect(sessionRuntime.sendPrompt).toHaveBeenCalledWith(
        "session-3",
        expect.stringContaining("Create a fresh session"),
      );
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("marks a dispatched task as succeeded and removes it from processing summaries", async () => {
    const taskDatabase = await createTaskDatabase(
      "dispatch-created-then-succeeded",
    );

    vi.useFakeTimers();

    try {
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:35:56.000Z",
        projectDir: taskDatabase.projectDir,
      });
      const sessionRuntime = {
        createSession: vi.fn().mockResolvedValue({ id: "session-3" }),
        sendPrompt: vi.fn().mockImplementation(async (sessionID: string) => {
          expect(
            repository.getRequiredTaskBySessionID(sessionID),
          ).toMatchObject({
            task_id: "task-2",
            session_id: sessionID,
          });
        }),
      };
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        host: sessionRuntime,
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-2",
          task_spec: "Create a fresh session",
          done: 0,
          session_id: null,
          status: "created",
          updated_at: "2026-04-18T10:00:00.000Z",
        },
      ]);

      vi.setSystemTime(new Date("2026-04-18T12:34:56.000Z"));
      await (
        plugin.tools["dispatch-tasks"] as {
          execute: () => Promise<unknown>;
        }
      ).execute();

      vi.setSystemTime(new Date("2026-04-18T12:35:56.000Z"));
      await (
        plugin.tools["mark-task-status"] as {
          execute: (
            input: { status: string },
            context: { sessionID: string },
          ) => Promise<unknown> | unknown;
        }
      ).execute({ status: "succeeded" }, { sessionID: "session-3" });

      expect(repository.getRequiredTaskBySessionID("session-3")).toMatchObject({
        task_id: "task-2",
        status: "succeeded",
        done: true,
        updated_at: "2026-04-18T12:35:56.000Z",
      });
      expect(repository.listProcessingTasks()).toEqual([]);
    } finally {
      vi.useRealTimers();
      await taskDatabase.cleanup();
    }
  });

  it("does not keep a new session binding when initial prompt delivery fails", async () => {
    const taskDatabase = await createTaskDatabase(
      "dispatch-created-prompt-failure",
    );

    try {
      const sessionRuntime = {
        createSession: vi.fn().mockResolvedValue({ id: "session-3" }),
        sendPrompt: vi.fn().mockRejectedValue(new Error("prompt failed")),
      };
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        host: sessionRuntime,
        projectDir: taskDatabase.projectDir,
      });
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-2",
          task_spec: "Create a fresh session",
          done: 0,
          session_id: null,
          status: "created",
        },
      ]);

      await expect(
        (
          plugin.tools["dispatch-tasks"] as {
            execute: () => Promise<unknown>;
          }
        ).execute(),
      ).rejects.toThrow("prompt failed");

      expect(repository.getTaskBySessionID("session-3")).toBeUndefined();
      expect(repository.listUnfinishedTasks()).toEqual([
        expect.objectContaining({ session_id: null, task_id: "task-2" }),
      ]);
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("does not replace the previous session binding when reclaim prompt delivery fails", async () => {
    const taskDatabase = await createTaskDatabase(
      "dispatch-reclaimed-prompt-failure",
    );

    try {
      const sessionRuntime = {
        createSession: vi.fn().mockResolvedValue({ id: "session-2" }),
        getSession: vi.fn().mockResolvedValue(null),
        sendPrompt: vi.fn().mockRejectedValue(new Error("prompt failed")),
      };
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        host: sessionRuntime,
        projectDir: taskDatabase.projectDir,
      });
      const repository = createTaskRepository({
        now: () => "2026-04-18T12:34:56.000Z",
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "Resume after session loss",
          done: 0,
          session_id: "session-1",
          status: "running",
        },
      ]);

      await expect(
        (
          plugin.tools["dispatch-tasks"] as {
            execute: () => Promise<unknown>;
          }
        ).execute(),
      ).rejects.toThrow("prompt failed");

      expect(repository.getTaskBySessionID("session-2")).toBeUndefined();
      expect(repository.getTaskBySessionID("session-1")).toEqual(
        expect.objectContaining({ task_id: "task-1", session_id: "session-1" }),
      );
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("dispatches only unfinished tasks at the plugin level", async () => {
    const taskDatabase = await createTaskDatabase("dispatch-only-unfinished");

    try {
      const sessionRuntime = {
        createSession: vi
          .fn()
          .mockResolvedValueOnce({ id: "session-1" })
          .mockResolvedValueOnce({ id: "session-2" }),
        sendPrompt: vi.fn().mockResolvedValue(undefined),
      };
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        host: sessionRuntime,
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "still running",
          done: 0,
          session_id: null,
          status: "created",
        },
        {
          task_id: "task-2",
          task_spec: "already finished",
          done: 1,
          session_id: null,
          status: "succeeded",
        },
      ]);

      const result = await (
        plugin.tools["dispatch-tasks"] as {
          execute: () => Promise<unknown>;
        }
      ).execute();

      expect(result).toEqual([
        { action: "created", sessionID: "session-1", taskID: "task-1" },
      ]);
      expect(sessionRuntime.createSession).toHaveBeenCalledTimes(1);
      expect(sessionRuntime.sendPrompt).toHaveBeenCalledTimes(1);
      expect(sessionRuntime.sendPrompt).toHaveBeenCalledWith(
        "session-1",
        expect.stringContaining("still running"),
      );
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("treats a missing getSession host hook as a missing session", async () => {
    const runtime = createSessionRuntime({
      createSession: async () => ({ id: "session-1" }),
      sendPrompt: async () => {},
    });

    await expect(runtime.getSession("missing-session")).resolves.toBeNull();
  });

  it("returns processing task summaries with the required fields", async () => {
    const taskDatabase = await createTaskDatabase(
      "dispatch-processing-summary",
    );

    try {
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        projectDir: taskDatabase.projectDir,
      });

      taskDatabase.seedTasks([
        {
          task_id: "task-1",
          task_spec: "one",
          session_id: "session-1",
          worktree_path: "/repo/.worktrees/task-1",
          pull_request_url: "https://github.com/acme/repo/pull/1",
          status: "running",
          done: 0,
          updated_at: "2026-04-18T01:00:00.000Z",
        },
      ]);

      expect(
        (
          plugin.tools["list-processing-tasks"] as {
            execute: () => Promise<unknown> | unknown;
          }
        ).execute(),
      ).toEqual([
        {
          pull_request_url: "https://github.com/acme/repo/pull/1",
          session_id: "session-1",
          status: "running",
          task_id: "task-1",
          updated_at: "2026-04-18T01:00:00.000Z",
          worktree_path: "/repo/.worktrees/task-1",
        },
      ]);
    } finally {
      await taskDatabase.cleanup();
    }
  });

  it("lets dispatch and list entrypoints run on an empty project", async () => {
    const emptyProject = await createEmptyProjectDir("plugin-empty-project");

    try {
      const sessionRuntime = {
        createSession: vi.fn(),
        sendPrompt: vi.fn(),
      };
      const { createSqliteTaskRuntimePlugin } = await import(
        "../../.opencode/plugins/task-runtime-sqlite.ts"
      );
      const plugin = createSqliteTaskRuntimePlugin({
        host: sessionRuntime,
        projectDir: emptyProject.projectDir,
      });

      expect(
        (
          plugin.tools["list-processing-tasks"] as {
            execute: () => Promise<unknown> | unknown;
          }
        ).execute(),
      ).toEqual([]);

      await expect(
        (
          plugin.tools["dispatch-tasks"] as {
            execute: () => Promise<unknown>;
          }
        ).execute(),
      ).resolves.toEqual([]);

      expect(sessionRuntime.createSession).not.toHaveBeenCalled();
      expect(sessionRuntime.sendPrompt).not.toHaveBeenCalled();
    } finally {
      await emptyProject.cleanup();
    }
  });

  it("keeps follow-up prompts focused on continuing the current task", () => {
    const task = {
      task_id: "task-1",
      task_spec: "Drive the current task forward",
      session_id: "session-1",
      worktree_path: "/repo/.worktrees/task-1",
      pull_request_url: "https://github.com/acme/repo/pull/1",
      status: "running",
      done: false,
      updated_at: "2026-04-18T12:34:56.000Z",
    } satisfies TaskRecord;

    const prompt = buildFollowUpTaskPrompt(task);

    expect(prompt).toContain("继续推进当前 Task");
    expect(prompt).toContain("task-1");
    expect(prompt).not.toContain("session_id =");
    expect(prompt).not.toContain("tasks");
    expect(prompt).not.toContain("aim.sqlite");
  });
});
