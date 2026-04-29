import { spawn } from "node:child_process";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { createServer } from "node:http";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const cliBinUrl = new URL("../bin/aim.js", import.meta.url);
const cliRootUrl = new URL("../", import.meta.url);
const cliEntryUrl = new URL("../dist/index.mjs", import.meta.url);
const projectId = "00000000-0000-4000-8000-000000000001";

type RecordedRequest = {
  method: string;
  path: string;
  json: unknown;
};

const dryRunRequest = {
  project_id: projectId,
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
    {
      decision: "keep",
      dry_run_only: true,
      must_not_write_directly: true,
      requires_task_spec_validation: false,
      task_id: "task-1",
      keep_reason: "Existing task still covers the gap.",
      source_dimension: null,
      source_evaluation: null,
      source_gap: "Existing task coverage.",
      task_spec_draft: null,
      planning_feedback: null,
      coverage_judgment: {
        status: "covered_by_unfinished_task",
        covered_by_task_id: "task-1",
        summary: "Covered by task-1.",
      },
      dependency_conflict_plan: {
        conflict_draft: "Keep existing task.",
        dependency_draft: ["task-0"],
      },
      source_metadata_planning_evidence: {
        conflict_duplicate_assessment: "Existing task is not duplicate.",
        current_task_pool_coverage: "Covered.",
        dependency_rationale: "Depends on task-0.",
        unfinished_task_non_conflict_rationale: "Keep path is non-conflicting.",
      },
    },
    {
      decision: "delete",
      dry_run_only: true,
      must_not_write_directly: true,
      requires_task_spec_validation: false,
      task_id: "task-2",
      delete_reason: "Task is stale against baseline.",
      source_dimension: null,
      source_evaluation: null,
      source_gap: "Stale active task.",
      task_spec_draft: null,
      planning_feedback: {
        blocked: true,
        reason: "Reject stale predecessor first.",
        rejected_task_id: "task-2",
      },
      coverage_judgment: {
        status: "stale_unfinished_task",
        summary: "Task no longer matches current baseline.",
      },
      dependency_conflict_plan: {
        conflict_draft: "Delete stale task.",
        dependency_draft: [],
      },
      source_metadata_planning_evidence: {
        conflict_duplicate_assessment: "Stale task conflicts with current gap.",
        current_task_pool_coverage: "Stale coverage.",
        dependency_rationale: "No dependency should be created.",
        unfinished_task_non_conflict_rationale: "Delete path removes overlap.",
      },
    },
  ],
};

const runningServers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all(
    [...runningServers].map(async (server) => {
      runningServers.delete(server);
      server.close();
      await once(server, "close");
    }),
  );
});

beforeAll(async () => {
  try {
    await access(cliEntryUrl);
  } catch {
    throw new Error(
      "Expected modules/cli/dist/index.mjs to exist before running CLI tests. Run pnpm --filter ./modules/cli run build:dist first.",
    );
  }
});

const startCoordinatorServer = async ({ failDryRun = false } = {}) => {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    await once(request, "end");

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = `${url.pathname}${url.search}`;
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const json = bodyText ? JSON.parse(bodyText) : null;

    requests.push({
      method: request.method ?? "GET",
      path,
      json,
    });

    if (
      request.method === "POST" &&
      path === "/api/coordinator/proposals/dry-run"
    ) {
      if (failDryRun) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            code: "TASK_VALIDATION_ERROR",
            message: "planning evidence is required",
          }),
        );
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(dryRunResponse));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: "UNAVAILABLE", message: "not found" }));
  });

  runningServers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("expected tcp server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
  };
};

const runCli = async (args: string[], stdin?: string) => {
  const child = spawn(process.execPath, [cliBinUrl.pathname, ...args], {
    cwd: cliRootUrl,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  child.stdin.end(stdin ?? "");

  const [exitCode] = (await once(child, "close")) as [number | null];

  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
};

describe("coordinator proposal dry-run cli command", () => {
  it("submits a stdin dry-run payload and prints a read-only proposal summary", async () => {
    const server = await startCoordinatorServer();

    const result = await runCli(
      [
        "coordinator",
        "proposal",
        "dry-run",
        "--base-url",
        `${server.baseUrl}/api`,
        "--stdin",
      ],
      JSON.stringify(dryRunRequest),
    );

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(server.requests).toEqual([
      {
        method: "POST",
        path: "/api/coordinator/proposals/dry-run",
        json: dryRunRequest,
      },
    ]);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        dry_run: true,
        must_not_write_directly: true,
        proposal_counts: {
          create: 1,
          keep: 1,
          delete: 1,
          blocked: 1,
        },
        proposals: [
          {
            decision: "create",
            dry_run_only: true,
            must_not_write_directly: true,
            requires_task_spec_validation: true,
            task_id: null,
            task_spec_title: "Add Coordinator dry-run CLI preflight",
            source_gap: "No CLI preflight command exists.",
            coverage_judgment: dryRunResponse.operations[0].coverage_judgment,
            planning_feedback: null,
            dependency_conflict_plan:
              dryRunResponse.operations[0].dependency_conflict_plan,
            source_metadata_planning_evidence:
              dryRunResponse.operations[0].source_metadata_planning_evidence,
          },
          {
            decision: "keep",
            dry_run_only: true,
            must_not_write_directly: true,
            requires_task_spec_validation: false,
            task_id: "task-1",
            task_spec_title: null,
            source_gap: "Existing task coverage.",
            coverage_judgment: dryRunResponse.operations[1].coverage_judgment,
            planning_feedback: null,
            dependency_conflict_plan:
              dryRunResponse.operations[1].dependency_conflict_plan,
            source_metadata_planning_evidence:
              dryRunResponse.operations[1].source_metadata_planning_evidence,
          },
          {
            decision: "delete",
            dry_run_only: true,
            must_not_write_directly: true,
            requires_task_spec_validation: false,
            task_id: "task-2",
            task_spec_title: null,
            source_gap: "Stale active task.",
            coverage_judgment: dryRunResponse.operations[2].coverage_judgment,
            planning_feedback: dryRunResponse.operations[2].planning_feedback,
            dependency_conflict_plan:
              dryRunResponse.operations[2].dependency_conflict_plan,
            source_metadata_planning_evidence:
              dryRunResponse.operations[2].source_metadata_planning_evidence,
          },
        ],
      },
    });
  });

  it("preserves coordinator dry-run API errors on stderr", async () => {
    const server = await startCoordinatorServer({ failDryRun: true });

    const result = await runCli(
      [
        "coordinator:proposal:dry-run",
        "--base-url",
        `${server.baseUrl}/api`,
        "--stdin",
      ],
      JSON.stringify(dryRunRequest),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "TASK_VALIDATION_ERROR",
        message: "planning evidence is required",
      },
    });
  });

  it("requires an explicit payload source before any request", async () => {
    const server = await startCoordinatorServer();

    const result = await runCli([
      "coordinator",
      "proposal",
      "dry-run",
      "--base-url",
      `${server.baseUrl}/api`,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_USAGE_ERROR",
        message:
          "coordinator proposal dry-run requires exactly one of --payload-file, --payload-json, or --stdin",
      },
    });
    expect(server.requests).toEqual([]);
  });
});
