import type { ProjectListResponse } from "@aim-ai/contract";
import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

const toProjectListView = (projects: ProjectListResponse) => ({
  items: projects.items.map((project) => ({
    project_id: project.id,
    name: project.name,
    git_origin_url: project.git_origin_url,
    global_provider_id: project.global_provider_id,
    global_model_id: project.global_model_id,
    optimizer_enabled: project.optimizer_enabled,
  })),
});

export default class ProjectListCommand extends Command {
  static override description = "List projects via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ProjectListCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const projects = await client.listProjects();

      writeSuccess(this, toProjectListView(projects));
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
