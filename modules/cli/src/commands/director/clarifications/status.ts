import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  parseDirectorClarificationStatusFlag,
  requireFlag,
  writeSuccess,
} from "../../../lib/task-command.js";

export default class DirectorClarificationsStatusCommand extends Command {
  static override description =
    "Update a Director clarification or adjustment request status";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-id": Flags.string({ description: "Project id" }),
    "clarification-id": Flags.string({ description: "Clarification id" }),
    status: Flags.string({
      description: "Request status: open, addressed, or dismissed",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DirectorClarificationsStatusCommand);

    try {
      const projectId = requireFlag(flags["project-id"], "project-id");
      const clarificationId = requireFlag(
        flags["clarification-id"],
        "clarification-id",
      );
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const clarification = await client.patchDirectorClarificationById(
        projectId,
        clarificationId,
        {
          status: parseDirectorClarificationStatusFlag(
            requireFlag(flags.status, "status"),
          ),
        },
      );

      writeSuccess(this, clarification);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
