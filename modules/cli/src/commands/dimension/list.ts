import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

type DimensionSummary = {
  id: string;
  name: string;
  goal: string;
  latest_score: number | null;
  latest_commit: string | null;
  latest_created_at: string | null;
};

export default class DimensionListCommand extends Command {
  static override description =
    "List project dimensions with latest evaluation summaries";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-id": Flags.string({ description: "Project identifier" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DimensionListCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const dimensions = await client.listDimensions({
        project_id: requireFlag(flags["project-id"], "project-id"),
      });
      const items = await Promise.all(
        dimensions.items.map(async (dimension): Promise<DimensionSummary> => {
          const evaluations = await client.listDimensionEvaluations(
            dimension.id,
          );
          const latestEvaluation = evaluations.items.at(-1);

          return {
            id: dimension.id,
            name: dimension.name,
            goal: dimension.goal,
            latest_score: latestEvaluation?.score ?? null,
            latest_commit: latestEvaluation?.commit_sha ?? null,
            latest_created_at: latestEvaluation?.created_at ?? null,
          };
        }),
      );

      writeSuccess(this, { items });
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
