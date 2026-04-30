import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../../lib/task-command.js";

export default class DirectorClarificationsListCommand extends Command {
  static override description =
    "List Director clarification and adjustment requests for a project";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "dimension-id": Flags.string({ description: "Dimension id filter" }),
    "project-id": Flags.string({ description: "Project id" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DirectorClarificationsListCommand);

    try {
      const projectId = requireFlag(flags["project-id"], "project-id");
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const dimensionId = flags["dimension-id"];
      const clarifications = await client.listDirectorClarifications(
        projectId,
        dimensionId ? { dimension_id: dimensionId } : undefined,
      );

      writeSuccess(this, {
        items: clarifications.items.map((clarification) => ({
          id: clarification.id,
          kind: clarification.kind,
          status: clarification.status,
          prompt: clarification.message,
          created_at: clarification.created_at,
        })),
      });
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
