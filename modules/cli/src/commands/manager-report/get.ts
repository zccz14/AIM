import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class ManagerReportGetCommand extends Command {
  static override description =
    "Get a manager report via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-path": Flags.string({ description: "Evaluated project path" }),
    "report-id": Flags.string({ description: "Manager report identifier" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ManagerReportGetCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const managerReport = await client.getManagerReportById(
        requireFlag(flags["report-id"], "report-id"),
        {
          project_path: requireFlag(flags["project-path"], "project-path"),
        },
      );

      writeSuccess(this, managerReport);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
