import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  parseSourceMetadataJson,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class ManagerReportCreateCommand extends Command {
  static override description =
    "Create a manager report via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-path": Flags.string({ description: "Evaluated project path" }),
    "report-id": Flags.string({ description: "Manager report identifier" }),
    "content-markdown": Flags.string({
      description: "Manager report markdown",
    }),
    "baseline-ref": Flags.string({ description: "Traceable baseline ref" }),
    "source-metadata-json": Flags.string({
      description: "Source metadata JSON object with string values",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ManagerReportCreateCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const managerReport = await client.createManagerReport({
        project_path: requireFlag(flags["project-path"], "project-path"),
        report_id: requireFlag(flags["report-id"], "report-id"),
        content_markdown: requireFlag(
          flags["content-markdown"],
          "content-markdown",
        ),
        baseline_ref: flags["baseline-ref"],
        source_metadata: parseSourceMetadataJson(flags["source-metadata-json"]),
      });

      writeSuccess(this, managerReport);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
