import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  parseDirectorClarificationKindFlag,
  requireFlag,
  writeSuccess,
} from "../../../lib/task-command.js";

const buildMessage = (prompt: string, context: string | undefined) => {
  if (context === undefined) {
    return prompt;
  }

  return `${prompt}\n\nContext:\n${context}`;
};

export default class DirectorClarificationsCreateCommand extends Command {
  static override description =
    "Create a Director clarification or adjustment request for a project";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-id": Flags.string({ description: "Project id" }),
    "dimension-id": Flags.string({ description: "Dimension id" }),
    kind: Flags.string({
      description: "Request kind: clarification or adjustment",
    }),
    prompt: Flags.string({ description: "Clarification prompt" }),
    context: Flags.string({ description: "Additional request context" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DirectorClarificationsCreateCommand);

    try {
      const projectId = requireFlag(flags["project-id"], "project-id");
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const clarification = await client.createDirectorClarification(
        projectId,
        {
          project_id: projectId,
          dimension_id: flags["dimension-id"],
          kind: parseDirectorClarificationKindFlag(
            requireFlag(flags.kind, "kind"),
          ),
          message: buildMessage(
            requireFlag(flags.prompt, "prompt"),
            flags.context,
          ),
        },
      );

      writeSuccess(this, clarification);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
