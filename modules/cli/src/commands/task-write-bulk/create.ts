import type { CreateTaskWriteBulkRequest } from "@aim-ai/contract";
import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  parseJsonFlag,
  parseSourceMetadataJson,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class TaskWriteBulkCreateCommand extends Command {
  static override description =
    "Create a coordinator task write bulk intent via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-path": Flags.string({ description: "Evaluated project path" }),
    "bulk-id": Flags.string({ description: "Task write bulk identifier" }),
    "content-markdown": Flags.string({
      description: "Task write bulk markdown",
    }),
    "entries-json": Flags.string({
      description: "Task write bulk entry array JSON",
    }),
    "baseline-ref": Flags.string({ description: "Traceable baseline ref" }),
    "source-metadata-json": Flags.string({
      description: "Source metadata JSON object with string values",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskWriteBulkCreateCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const taskWriteBulk = await client.createTaskWriteBulk({
        project_path: requireFlag(flags["project-path"], "project-path"),
        bulk_id: requireFlag(flags["bulk-id"], "bulk-id"),
        content_markdown: requireFlag(
          flags["content-markdown"],
          "content-markdown",
        ),
        entries: parseJsonFlag<CreateTaskWriteBulkRequest["entries"]>(
          requireFlag(flags["entries-json"], "entries-json"),
          "entries-json",
        ),
        baseline_ref: flags["baseline-ref"],
        source_metadata: parseSourceMetadataJson(flags["source-metadata-json"]),
      });

      writeSuccess(this, taskWriteBulk);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
