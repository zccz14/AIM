import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class TaskWriteBulkListCommand extends Command {
  static override description =
    "List coordinator task write bulk intents for a project via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-path": Flags.string({ description: "Evaluated project path" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskWriteBulkListCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const taskWriteBulks = await client.listTaskWriteBulks({
        project_path: requireFlag(flags["project-path"], "project-path"),
      });

      writeSuccess(this, taskWriteBulks);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
