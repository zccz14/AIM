import { Command, Flags } from "@oclif/core";

import {
  createTaskContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class TaskGetCommand extends Command {
  static override description = "Get a task via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "task-id": Flags.string({ description: "Task identifier" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskGetCommand);

    try {
      const client = createTaskContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const task = await client.getTaskById(
        requireFlag(flags["task-id"], "task-id"),
      );

      writeSuccess(this, task);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
