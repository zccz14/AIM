import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class ManagerReportListCommand extends Command {
  static override description =
    "List manager reports for a project via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-path": Flags.string({ description: "Evaluated project path" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ManagerReportListCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const managerReports = await client.listManagerReports({
        project_path: requireFlag(flags["project-path"], "project-path"),
      });

      writeSuccess(this, managerReports);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
