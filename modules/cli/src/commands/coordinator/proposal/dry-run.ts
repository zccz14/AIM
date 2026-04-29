import { readFile } from "node:fs/promises";

import type {
  CoordinatorProposalDryRunResponse,
  CreateCoordinatorProposalDryRunRequest,
} from "@aim-ai/contract";
import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  parseJsonFlag,
  requireFlag,
  writeSuccess,
} from "../../../lib/task-command.js";

type ProposalSummary = {
  decision: "create" | "keep" | "delete";
  dry_run_only: true;
  must_not_write_directly: true;
  requires_task_spec_validation: boolean;
  task_id: string | null;
  task_spec_title: string | null;
  source_gap: string;
  coverage_judgment: unknown;
  planning_feedback: unknown;
  dependency_conflict_plan: unknown;
  source_metadata_planning_evidence: unknown;
};

const usageError = (message: string) => ({
  code: "CLI_USAGE_ERROR" as const,
  message,
});

const readStdin = async () => {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const resolvePayloadText = async (flags: {
  "payload-file"?: string;
  "payload-json"?: string;
  stdin?: boolean;
}) => {
  const selectedSources = [
    flags["payload-file"] !== undefined,
    flags["payload-json"] !== undefined,
    flags.stdin === true,
  ].filter(Boolean).length;

  if (selectedSources !== 1) {
    throw usageError(
      "coordinator proposal dry-run requires exactly one of --payload-file, --payload-json, or --stdin",
    );
  }

  if (flags["payload-json"] !== undefined) {
    return flags["payload-json"];
  }

  if (flags["payload-file"] !== undefined) {
    return readFile(flags["payload-file"], "utf8");
  }

  return readStdin();
};

const toDryRunSummary = (response: CoordinatorProposalDryRunResponse) => {
  const proposals = response.operations.map((operation): ProposalSummary => {
    const taskId =
      "task_id" in operation && typeof operation.task_id === "string"
        ? operation.task_id
        : null;

    return {
      decision: operation.decision,
      dry_run_only: operation.dry_run_only,
      must_not_write_directly: operation.must_not_write_directly,
      requires_task_spec_validation: operation.requires_task_spec_validation,
      task_id: taskId,
      task_spec_title: operation.task_spec_draft?.title ?? null,
      source_gap: operation.source_gap,
      coverage_judgment: operation.coverage_judgment,
      planning_feedback: operation.planning_feedback,
      dependency_conflict_plan: operation.dependency_conflict_plan,
      source_metadata_planning_evidence:
        operation.source_metadata_planning_evidence,
    };
  });

  return {
    dry_run: response.dry_run,
    must_not_write_directly: proposals.every(
      (proposal) => proposal.must_not_write_directly,
    ),
    proposal_counts: {
      create: proposals.filter((proposal) => proposal.decision === "create")
        .length,
      keep: proposals.filter((proposal) => proposal.decision === "keep").length,
      delete: proposals.filter((proposal) => proposal.decision === "delete")
        .length,
      blocked: proposals.filter((proposal) => {
        const feedback = proposal.planning_feedback;

        return (
          feedback !== null &&
          typeof feedback === "object" &&
          "blocked" in feedback &&
          (feedback as { blocked: unknown }).blocked === true
        );
      }).length,
    },
    proposals,
  };
};

export default class CoordinatorProposalDryRunCommand extends Command {
  static override description =
    "Submit a read-only Coordinator proposal dry-run payload";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "payload-file": Flags.string({
      description: "Path to a JSON dry-run request payload",
    }),
    "payload-json": Flags.string({
      description: "Inline JSON dry-run request",
    }),
    stdin: Flags.boolean({
      description: "Read JSON dry-run request from stdin",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CoordinatorProposalDryRunCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const payloadText = await resolvePayloadText(flags);
      const payload = parseJsonFlag<CreateCoordinatorProposalDryRunRequest>(
        payloadText,
        "payload-json",
      );
      const result = await client.createCoordinatorProposalDryRun(payload);

      writeSuccess(this, toDryRunSummary(result));
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
