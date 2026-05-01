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

const projectTokenUsageResponse = {
  budget_warning: {
    status: "not_configured",
    token_warning_threshold: null,
    cost_warning_threshold: null,
    message: null,
  },
  token_budget: {
    exhausted: false,
    limit: null,
    remaining: null,
    used: 42,
  },
  failures: [],
  project_id: "00000000-0000-4000-8000-000000000001",
  sessions: [
    {
      failure: null,
      root_session_id: "session-1",
      task_id: "task-1",
      title: "Use tokens",
      totals: {
        cache: { read: 3, write: 4 },
        cost: 1.25,
        input: 10,
        messages: 1,
        output: 20,
        reasoning: 5,
        total: 42,
      },
    },
  ],
  tasks: [
    {
      failures: [],
      session_id: "session-1",
      task_id: "task-1",
      title: "Use tokens",
      totals: {
        cache: { read: 3, write: 4 },
        cost: 1.25,
        input: 10,
        messages: 1,
        output: 20,
        reasoning: 5,
        total: 42,
      },
    },
  ],
  totals: {
    cache: { read: 3, write: 4 },
    cost: 1.25,
    input: 10,
    messages: 1,
    output: 20,
    reasoning: 5,
    total: 42,
  },
};

const projectResponse = {
  created_at: "2026-04-26T00:00:00.000Z",
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  git_origin_url: "https://github.com/example/main.git",
  id: "00000000-0000-4000-8000-000000000001",
  name: "Main project",
  optimizer_enabled: false,
  token_budget_limit: null,
  token_warning_threshold: null,
  cost_warning_threshold: null,
  updated_at: "2026-04-26T00:00:00.000Z",
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

describe("contract client project token usage", () => {
  it("gets project-scoped token usage from the read-only project endpoint", async () => {
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

        return new Response(JSON.stringify(projectTokenUsageResponse), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });

    await expect(
      client.getProjectTokenUsage("00000000-0000-4000-8000-000000000001"),
    ).resolves.toEqual(projectTokenUsageResponse);
    expect(requests).toEqual([
      {
        method: "GET",
        path: "/projects/00000000-0000-4000-8000-000000000001/token-usage",
        json: null,
      },
    ]);
  });
});

describe("contract client project detail", () => {
  it("gets a single project from the project detail endpoint", async () => {
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

        return new Response(JSON.stringify(projectResponse), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });

    await expect(
      client.getProjectById("00000000-0000-4000-8000-000000000001"),
    ).resolves.toEqual(projectResponse);
    expect(requests).toEqual([
      {
        method: "GET",
        path: "/projects/00000000-0000-4000-8000-000000000001",
        json: null,
      },
    ]);
  });
});
