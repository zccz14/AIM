import { Command, Flags } from "@oclif/core";

import {
  createTaskContractClient,
  exitWithFailure,
  parseStatusFlag,
  pickLastValue,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class TaskCreateCommand extends Command {
  static override description = "Create a task via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    title: Flags.string({ description: "Task title" }),
    "task-spec": Flags.string({ description: "Task spec string" }),
    "project-id": Flags.string({ description: "Task project id" }),
    "session-id": Flags.string({ description: "Task session id" }),
    "worktree-path": Flags.string({ description: "Task worktree path" }),
    "pull-request-url": Flags.string({
      description: "Pull request URL",
      multiple: true,
    }),
    dependency: Flags.string({
      description: "Task dependency id",
      multiple: true,
    }),
    status: Flags.string({ description: "Task status" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskCreateCommand);

    try {
      const client = createTaskContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const task = await client.createTask({
        title: requireFlag(flags.title, "title"),
        task_spec: requireFlag(flags["task-spec"], "task-spec"),
        project_id: requireFlag(flags["project-id"], "project-id"),
        session_id: flags["session-id"],
        worktree_path: flags["worktree-path"],
        pull_request_url: pickLastValue(flags["pull-request-url"]),
        dependencies: flags.dependency ?? [],
        status: parseStatusFlag(flags.status),
      });

      writeSuccess(this, task);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
