import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class TaskWriteBulkGetCommand extends Command {
  static override description =
    "Get a coordinator task write bulk intent via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-path": Flags.string({ description: "Evaluated project path" }),
    "bulk-id": Flags.string({ description: "Task write bulk identifier" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskWriteBulkGetCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const taskWriteBulk = await client.getTaskWriteBulkById(
        requireFlag(flags["bulk-id"], "bulk-id"),
        {
          project_path: requireFlag(flags["project-path"], "project-path"),
        },
      );

      writeSuccess(this, taskWriteBulk);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
