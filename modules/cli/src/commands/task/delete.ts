import { Command, Flags } from "@oclif/core";

import {
  createTaskContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class TaskDeleteCommand extends Command {
  static override description = "Delete a task via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "task-id": Flags.string({ description: "Task identifier" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskDeleteCommand);

    try {
      const client = createTaskContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const taskId = requireFlag(flags["task-id"], "task-id");

      await client.deleteTaskById(taskId);
      writeSuccess(this, { deleted: true, task_id: taskId });
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
