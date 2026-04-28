import { Command, Flags } from "@oclif/core";

import {
  createTaskContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class TaskPrStatusCommand extends Command {
  static override description = "Get task pull request follow-up status";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "task-id": Flags.string({ description: "Task identifier" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskPrStatusCommand);

    try {
      const client = createTaskContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const status = await client.getTaskPullRequestStatusById(
        requireFlag(flags["task-id"], "task-id"),
      );

      writeSuccess(this, status);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
