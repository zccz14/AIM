import type { Project } from "@aim-ai/contract";
import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../../lib/task-command.js";

const toProjectOptimizerConfigView = (project: Project) => ({
  project_id: project.id,
  name: project.name,
  git_origin_url: project.git_origin_url,
  global_provider_id: project.global_provider_id,
  global_model_id: project.global_model_id,
  optimizer_enabled: project.optimizer_enabled,
  update_type: "persisted_configuration" as const,
});

const resolveOptimizerEnabled = (flags: {
  enable?: boolean;
  disable?: boolean;
}) => {
  if (flags.enable && flags.disable) {
    throw {
      code: "CLI_INVALID_FLAG_VALUE",
      message: "cannot combine --enable with --disable",
    };
  }

  if (!flags.enable && !flags.disable) {
    throw {
      code: "CLI_USAGE_ERROR",
      message: "project optimizer update requires --enable or --disable",
    };
  }

  return Boolean(flags.enable);
};

export default class ProjectOptimizerUpdateCommand extends Command {
  static override description = "Update persisted project optimizer config";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-id": Flags.string({ description: "Project identifier" }),
    enable: Flags.boolean({
      allowNo: false,
      description: "Persistently enable the project optimizer",
    }),
    disable: Flags.boolean({
      allowNo: false,
      description: "Persistently disable the project optimizer",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ProjectOptimizerUpdateCommand);

    try {
      const optimizerEnabled = resolveOptimizerEnabled(flags);
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const project = await client.patchProjectById(
        requireFlag(flags["project-id"], "project-id"),
        { optimizer_enabled: optimizerEnabled },
      );

      writeSuccess(this, toProjectOptimizerConfigView(project));
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
