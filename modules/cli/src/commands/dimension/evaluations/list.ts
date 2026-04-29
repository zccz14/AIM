import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../../lib/task-command.js";

type DimensionEvaluationSummary = {
  commit: string;
  score: number;
  summary: string;
};

export default class DimensionEvaluationsListCommand extends Command {
  static override description = "List dimension evaluation history summaries";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "dimension-id": Flags.string({ description: "Dimension identifier" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DimensionEvaluationsListCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const evaluations = await client.listDimensionEvaluations(
        requireFlag(flags["dimension-id"], "dimension-id"),
      );
      const items = evaluations.items.map(
        (evaluation): DimensionEvaluationSummary => ({
          commit: evaluation.commit_sha,
          score: evaluation.score,
          summary: evaluation.evaluation,
        }),
      );

      writeSuccess(this, { items });
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
