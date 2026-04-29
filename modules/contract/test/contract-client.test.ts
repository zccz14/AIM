import { describe, expect, it } from "vitest";

import { createContractClient } from "../src/client.js";

const dryRunRequest = {
  project_id: "00000000-0000-4000-8000-000000000001",
  currentBaselineCommit: "7cdc5a1",
  evaluations: [
    {
      source_dimension: {
        id: "dimension-1",
        name: "Coordinator governance",
      },
      source_evaluation: {
        id: "evaluation-1",
        evaluation: "Coordinator needs a preflight before task writes.",
      },
      source_gap: "No CLI preflight command exists.",
    },
  ],
  taskPool: [],
};

const dryRunResponse = {
  dry_run: true,
  operations: [
    {
      decision: "create",
      dry_run_only: true,
      must_not_write_directly: true,
      requires_task_spec_validation: true,
      source_dimension: {
        id: "dimension-1",
        name: "Coordinator governance",
      },
      source_evaluation: {
        id: "evaluation-1",
        evaluation: "Coordinator needs a preflight before task writes.",
      },
      source_gap: "No CLI preflight command exists.",
      task_spec_draft: {
        title: "Add Coordinator dry-run CLI preflight",
        spec: "# Task",
      },
      planning_feedback: null,
      coverage_judgment: {
        status: "uncovered_gap",
        summary: "No active task covers the CLI preflight.",
      },
      dependency_conflict_plan: {
        conflict_draft: "No duplicate active CLI task.",
        dependency_draft: [],
      },
      source_metadata_planning_evidence: {
        conflict_duplicate_assessment: "No duplicate active CLI task.",
        current_task_pool_coverage: "Uncovered.",
        dependency_rationale: "Dry-run API is already available.",
        unfinished_task_non_conflict_rationale: "No overlapping CLI command.",
      },
    },
  ],
};

describe("contract client coordinator proposal dry-run", () => {
  it("posts the provided request to the read-only dry-run endpoint", async () => {
    const requests: Array<{ method: string; path: string; json: unknown }> = [];
    const client = createContractClient({
      fetch: async (input, init) => {
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(String(input), "http://127.0.0.1"), init);
        const url = new URL(request.url, "http://127.0.0.1");
        const bodyText = await request.text();

        requests.push({
          method: request.method,
          path: url.pathname,
          json: bodyText ? JSON.parse(bodyText) : null,
        });

        return new Response(JSON.stringify(dryRunResponse), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });

    await expect(
      client.createCoordinatorProposalDryRun(dryRunRequest),
    ).resolves.toEqual(dryRunResponse);
    expect(requests).toEqual([
      {
        method: "POST",
        path: "/coordinator/proposals/dry-run",
        json: dryRunRequest,
      },
    ]);
  });
});
