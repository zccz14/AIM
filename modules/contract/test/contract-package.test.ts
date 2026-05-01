import { access, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";
import { adaptGeneratedRequestForPublicFetch } from "../src/client.js";

type RequestInitWithDuplex = RequestInit & {
  duplex?: "half";
};

const contractPackageUrl = new URL("../package.json", import.meta.url);
const contractPackageTestUrl = new URL(
  "./contract-package.test.ts",
  import.meta.url,
);
const apiPackageUrl = new URL("../../api/package.json", import.meta.url);
const cliPackageUrl = new URL("../../cli/package.json", import.meta.url);
const webPackageUrl = new URL("../../web/package.json", import.meta.url);
const contractEntryUrl = new URL("../dist/index.mjs", import.meta.url);
const contractTypeDefinitionUrl = new URL(
  "../dist/index.d.mts",
  import.meta.url,
);
const contractOpenApiSourceUrl = new URL("../src/openapi.ts", import.meta.url);
const contractIndexSourceUrl = new URL("../src/index.ts", import.meta.url);
const generatedClientUrl = new URL("../generated/client.ts", import.meta.url);
const generatedClientDefinitionUrl = new URL(
  "../generated/_client/client.gen.ts",
  import.meta.url,
);
const generatedClientBundledAuthUrl = new URL(
  "../generated/_client/core/auth.gen.ts",
  import.meta.url,
);
const generatedClientRawAuthUrl = new URL(
  "../generated/_client/core/auth.ts",
  import.meta.url,
);
const generatedClientSdkUrl = new URL(
  "../generated/_client/sdk.gen.ts",
  import.meta.url,
);
const generatedOpenApiUrl = new URL("../generated/openapi.ts", import.meta.url);
const generatedTypesUrl = new URL("../generated/types.ts", import.meta.url);
const generatedTypeDefinitionsUrl = new URL(
  "../generated/_types/types.gen.ts",
  import.meta.url,
);
const generatedZodUrl = new URL("../generated/zod.ts", import.meta.url);
const rootPackageUrl = new URL("../../../package.json", import.meta.url);
const vitestWorkspaceUrl = new URL(
  "../../../vitest.workspace.ts",
  import.meta.url,
);
const playwrightConfigUrl = new URL(
  "../../../playwright.config.ts",
  import.meta.url,
);
const ciWorkflowUrl = new URL(
  "../../../.github/workflows/ci.yml",
  import.meta.url,
);
const setupNodePnpmActionUrl = new URL(
  "../../../.github/actions/setup-node-pnpm/action.yml",
  import.meta.url,
);
const releaseWorkflowUrl = new URL(
  "../../../.github/workflows/release.yml",
  import.meta.url,
);
const mainProjectId = "00000000-0000-4000-8000-000000000001";
const unknownSourceBaselineFreshness = {
  current_commit: null,
  source_commit: null,
  status: "unknown",
  summary: "Task source baseline metadata is missing latest_origin_main_commit",
} as const;

type ContractPackageManifest = {
  name: string;
  exports: {
    ".": {
      import: string;
      require: string;
      types: string;
    };
  };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type WorkspacePackageManifest = {
  scripts?: Record<string, string>;
};

type RootPackageManifest = {
  scripts: Record<string, string>;
};

const skipTest = (command: string) => `[ -n "$SKIP_TEST" ] || ${command}`;

type ContractPackageModule = typeof import("../src/index.js");
type ContractPackageConsumerModule = typeof import("../dist/index.mjs");
type GeneratedClientModule = typeof import("../generated/client.js");
type GeneratedTypesModule = typeof import("../generated/types.js");
type GeneratedZodModule = typeof import("../generated/zod.ts");

type Assert<T extends true> = T;
type HasExport<Module, Key extends PropertyKey> = Key extends keyof Module
  ? true
  : false;

type _consumerExportsTask = Assert<
  HasExport<ContractPackageConsumerModule, "Task">
>;
type _consumerExportsCreateTaskRequest = Assert<
  HasExport<ContractPackageConsumerModule, "CreateTaskRequest">
>;
type _consumerExportsTaskStatus = Assert<
  HasExport<ContractPackageConsumerModule, "TaskStatus">
>;
type _consumerExportsOpenApiDocument = Assert<
  HasExport<ContractPackageConsumerModule, "OpenApiDocument">
>;
type _generatedClientExportsTaskCrud = Assert<
  HasExport<GeneratedClientModule, "listTasks"> &
    HasExport<GeneratedClientModule, "createTask"> &
    HasExport<GeneratedClientModule, "getTaskById"> &
    HasExport<GeneratedClientModule, "patchTaskById"> &
    HasExport<GeneratedClientModule, "deleteTaskById">
>;
type _generatedClientExportsProjectTokenUsage = Assert<
  HasExport<GeneratedClientModule, "getProjectTokenUsage">
>;
type _generatedTypesExportTaskCrud = Assert<
  HasExport<GeneratedTypesModule, "Task"> &
    HasExport<GeneratedTypesModule, "CreateTaskRequest"> &
    HasExport<GeneratedTypesModule, "PatchTaskRequest"> &
    HasExport<GeneratedTypesModule, "TaskListResponse">
>;
type _generatedTypesExportProjectTokenUsage = Assert<
  HasExport<GeneratedTypesModule, "ProjectTokenUsageResponse">
>;

const assertBuiltEntry = async () => {
  try {
    await access(contractEntryUrl);
  } catch {
    throw new Error(
      "Expected modules/contract/dist/index.mjs to exist before running contract package tests. Run pnpm --filter ./modules/contract run build:dist first.",
    );
  }
};

let contractPackage: ContractPackageManifest;
let apiPackage: WorkspacePackageManifest;
let cliPackage: WorkspacePackageManifest;
let rootPackage: RootPackageManifest;
let webPackage: WorkspacePackageManifest;
let contractModule: ContractPackageModule;
let generatedClientModule: GeneratedClientModule;
let generatedZodModule: GeneratedZodModule;
let playwrightConfigSource: string;
let ciWorkflowSource: string;
let setupNodePnpmActionSource: string;
let releaseWorkflowSource: string;
let contractPackageTestSource: string;

beforeAll(async () => {
  await assertBuiltEntry();
  contractPackage = JSON.parse(
    await readFile(contractPackageUrl, "utf8"),
  ) as ContractPackageManifest;
  apiPackage = JSON.parse(
    await readFile(apiPackageUrl, "utf8"),
  ) as WorkspacePackageManifest;
  cliPackage = JSON.parse(
    await readFile(cliPackageUrl, "utf8"),
  ) as WorkspacePackageManifest;
  webPackage = JSON.parse(
    await readFile(webPackageUrl, "utf8"),
  ) as WorkspacePackageManifest;
  rootPackage = JSON.parse(
    await readFile(rootPackageUrl, "utf8"),
  ) as RootPackageManifest;
  playwrightConfigSource = await readFile(playwrightConfigUrl, "utf8");
  ciWorkflowSource = await readFile(ciWorkflowUrl, "utf8");
  setupNodePnpmActionSource = await readFile(setupNodePnpmActionUrl, "utf8");
  releaseWorkflowSource = await readFile(releaseWorkflowUrl, "utf8");
  contractPackageTestSource = await readFile(contractPackageTestUrl, "utf8");
  contractModule = (await import(
    pathToFileURL(fileURLToPath(contractEntryUrl)).href
  )) as ContractPackageModule;
  generatedClientModule = (await import(
    "../generated/client.js"
  )) as GeneratedClientModule;
  generatedZodModule = (await import(
    "../generated/zod.ts"
  )) as GeneratedZodModule;
}, 30_000);

describe("contract package baseline", () => {
  it("keeps package scripts free of ambiguous exact test entrypoints and test-time builds", () => {
    const manifests = [
      ["root", rootPackage],
      ["contract", contractPackage],
      ["api", apiPackage],
      ["cli", cliPackage],
      ["web", webPackage],
    ] as const;

    expect(
      manifests
        .filter(([, manifest]) => Object.hasOwn(manifest.scripts ?? {}, "test"))
        .map(([name]) => name),
    ).toEqual([]);
    expect(contractPackageTestSource).not.toContain("ensure" + "BuiltEntry");
    expect(contractPackageTestSource).not.toContain("execFile" + "Async");
  });

  it("publishes unified root validation entrypoints", async () => {
    await expect(access(vitestWorkspaceUrl)).resolves.toBeUndefined();
    await expect(access(playwrightConfigUrl)).resolves.toBeUndefined();
    expect(rootPackage.scripts["test:repo"]).toBe(
      skipTest(
        "pnpm exec vitest run --config vitest.workspace.ts --project repo",
      ),
    );
    expect(rootPackage.scripts["test:type"]).toBe(
      skipTest("{ pnpm run typecheck && pnpm -r --if-present run test:type; }"),
    );
    expect(rootPackage.scripts["test:type:repo"]).toBe(
      skipTest("pnpm run typecheck:repo"),
    );
    expect(rootPackage.scripts["test:lint"]).toBe(
      skipTest("{ pnpm run lint && pnpm -r --if-present run test:lint; }"),
    );
    expect(rootPackage.scripts["test:lint:repo"]).toBe(
      skipTest("pnpm run lint"),
    );
    expect(rootPackage.scripts["test:smoke"]).toBe(
      skipTest("pnpm -r --if-present run test:smoke"),
    );
    expect(rootPackage.scripts["test:web"]).toBe(
      skipTest("pnpm -r --if-present run test:web"),
    );
    expect(rootPackage.scripts["test:changeset"]).toBe(
      skipTest("node ./scripts/changeset-check.mjs"),
    );
    expect(rootPackage.scripts).not.toHaveProperty("test");
    expect(rootPackage.scripts).not.toHaveProperty("changeset:check");
    expect(rootPackage.scripts.build).toBe(
      "pnpm -r --if-present build && pnpm run test:type:repo && pnpm run test:lint:repo && pnpm run test:repo && pnpm --filter ./modules/contract run openapi:check && pnpm run test:changeset",
    );
    expect(rootPackage.scripts).not.toHaveProperty("release:check");
    expect(rootPackage.scripts).not.toHaveProperty("smoke");
    expect(rootPackage.scripts).not.toHaveProperty("validate");
    expect(rootPackage.scripts).not.toHaveProperty("test:unit");
    expect(rootPackage.scripts).not.toHaveProperty("test:integration");
    expect(rootPackage.scripts).not.toHaveProperty("test:e2e");
    expect(rootPackage.scripts).not.toHaveProperty("smoke:cli");
  });

  it("keeps a minimal browser matrix in the Playwright baseline", () => {
    expect(playwrightConfigSource).toContain('name: "chromium"');
    expect(playwrightConfigSource).toContain('name: "firefox"');
  });

  it("keeps CI wired to the root build contract with CI-only setup", () => {
    expect(ciWorkflowSource).toContain("run: pnpm build");
    expect(ciWorkflowSource).toContain(
      "run: pnpm exec playwright install-deps chromium firefox",
    );
    expect(ciWorkflowSource).toContain(
      "run: pnpm exec playwright install chromium firefox",
    );
    expect(ciWorkflowSource).not.toContain(
      "pnpm test:unit && pnpm test:integration",
    );
    expect(ciWorkflowSource).not.toContain("pnpm test:e2e");
    expect(ciWorkflowSource).not.toContain("pnpm smoke:cli");
  });

  it("keeps release readiness and publish flow aligned to the root build contract", () => {
    expect(releaseWorkflowSource).toContain("run: pnpm build");
    expect(releaseWorkflowSource).toContain('install-playwright: "true"');
    expect(setupNodePnpmActionSource).toContain("install-playwright:");
    expect(setupNodePnpmActionSource).toContain(
      "run: pnpm exec playwright install --with-deps chromium firefox",
    );
    expect(releaseWorkflowSource).toContain(
      "publish: pnpm build && pnpm exec changeset publish --provenance",
    );
    expect(releaseWorkflowSource).not.toContain("run: pnpm release:check");
  });

  it("publishes the expected package export contract", () => {
    expect(contractPackage.name).toBe("@aim-ai/contract");
    expect(contractPackage.exports["."]).toEqual({
      import: "./dist/index.mjs",
      require: "./dist/index.cjs",
      types: "./dist/index.d.mts",
    });
    expect(Object.keys(contractModule).sort()).toEqual([
      "ContractClientError",
      "coordinatorProposalDryRunPath",
      "coordinatorProposalDryRunResponseSchema",
      "createContractClient",
      "createCoordinatorProposalDryRunRequestSchema",
      "createDimensionEvaluationRequestSchema",
      "createDimensionRequestSchema",
      "createDirectorClarificationRequestSchema",
      "createOpenCodeSessionRequestSchema",
      "createProjectRequestSchema",
      "createTaskBatchRequestSchema",
      "createTaskRequestSchema",
      "dbSqlitePath",
      "dimensionByIdPath",
      "dimensionEvaluationListResponseSchema",
      "dimensionEvaluationSchema",
      "dimensionEvaluationsPath",
      "dimensionListResponseSchema",
      "dimensionSchema",
      "dimensionsPath",
      "directorClarificationKindSchema",
      "directorClarificationListResponseSchema",
      "directorClarificationSchema",
      "directorClarificationStatusSchema",
      "healthErrorCodeSchema",
      "healthErrorSchema",
      "healthPath",
      "healthResponseSchema",
      "healthStatusSchema",
      "openApiDocument",
      "openCodeSessionByIdPath",
      "openCodeSessionListResponseSchema",
      "openCodeSessionRejectPath",
      "openCodeSessionResolvePath",
      "openCodeSessionSchema",
      "openCodeSessionSettleRequestSchema",
      "openCodeSessionStateSchema",
      "openCodeSessionTokenUsageRefreshPath",
      "openCodeSessionsPath",
      "opencodeModelCombinationSchema",
      "opencodeModelsPath",
      "opencodeModelsResponseSchema",
      "patchDimensionRequestSchema",
      "patchDirectorClarificationRequestSchema",
      "patchOpenCodeSessionRequestSchema",
      "patchProjectRequestSchema",
      "patchTaskRequestSchema",
      "projectByIdPath",
      "projectDirectorClarificationByIdPath",
      "projectDirectorClarificationsPath",
      "projectListResponseSchema",
      "projectOptimizerStatusPath",
      "projectOptimizerStatusResponseSchema",
      "projectSchema",
      "projectTokenUsagePath",
      "projectTokenUsageResponseSchema",
      "projectsPath",
      "taskBatchOperationResultSchema",
      "taskBatchOperationSchema",
      "taskBatchResponseSchema",
      "taskByIdPath",
      "taskDependenciesPath",
      "taskDependenciesRequestSchema",
      "taskErrorCodeSchema",
      "taskErrorSchema",
      "taskListResponseSchema",
      "taskPullRequestStatusPath",
      "taskPullRequestStatusResponseSchema",
      "taskPullRequestUrlPath",
      "taskPullRequestUrlRequestSchema",
      "taskSchema",
      "taskSpecPath",
      "taskStatusSchema",
      "taskWorktreePathPath",
      "taskWorktreePathRequestSchema",
      "tasksBatchPath",
      "tasksPath",
    ]);
    expect(
      contractModule.openApiDocument.paths[contractModule.dbSqlitePath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.healthPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.dimensionsPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.dimensionByIdPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.dimensionEvaluationsPath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.opencodeModelsPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.openCodeSessionsPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.openCodeSessionByIdPath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.openCodeSessionResolvePath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.openCodeSessionRejectPath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.openCodeSessionTokenUsageRefreshPath
      ],
    ).toBeDefined();
    expect(contractModule).not.toHaveProperty("optimizerStatusPath");
    expect(contractModule).not.toHaveProperty("optimizerStartPath");
    expect(contractModule).not.toHaveProperty("optimizerStopPath");
    expect(contractModule).not.toHaveProperty("optimizerStatusResponseSchema");
    expect(generatedClientModule).not.toHaveProperty("getOptimizerStatus");
    expect(generatedClientModule).not.toHaveProperty("startOptimizer");
    expect(generatedClientModule).not.toHaveProperty("stopOptimizer");
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/optimizer/status",
    );
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/optimizer/start",
    );
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/optimizer/stop",
    );
    expect(
      contractModule.openApiDocument.paths[contractModule.projectsPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.projectByIdPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.projectOptimizerStatusPath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.projectTokenUsagePath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.projectDirectorClarificationsPath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.projectDirectorClarificationByIdPath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.coordinatorProposalDryRunPath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.tasksPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.taskByIdPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.taskWorktreePathPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.taskPullRequestUrlPath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[
        contractModule.taskPullRequestStatusPath
      ],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.taskDependenciesPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.taskSpecPath],
    ).toBeDefined();
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/tasks/{taskId}/resolve",
    );
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/tasks/{taskId}/reject",
    );
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/manager_reports",
    );
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/manager_reports/{reportId}",
    );
    expect(
      contractModule.openApiDocument.paths[contractModule.tasksBatchPath],
    ).toBeDefined();
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/task_write_bulks",
    );
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/task_write_bulks/{bulkId}",
    );
  });

  it("accepts dry-run task pool top-level artifact fields without loosening strictness", () => {
    expect(
      contractModule.createCoordinatorProposalDryRunRequestSchema.safeParse({
        project_id: mainProjectId,
        currentBaselineCommit: "7cdc5a1",
        evaluations: [],
        taskPool: [
          {
            task_id: "task-with-artifacts",
            title: "Task with artifacts",
            worktree_path: "/repo/.worktrees/task-with-artifacts",
            pull_request_url: "https://github.com/example/repo/pull/42",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      contractModule.createCoordinatorProposalDryRunRequestSchema.safeParse({
        project_id: mainProjectId,
        currentBaselineCommit: "7cdc5a1",
        evaluations: [],
        taskPool: [
          {
            task_id: "task-with-artifacts",
            title: "Task with artifacts",
            unexpected_artifact_field: "not allowed",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("exports health schemas from the built package boundary", () => {
    expect(contractModule.healthPath).toBe("/health");
    expect(contractModule.healthStatusSchema.parse("ok")).toBe("ok");
    expect(contractModule.healthResponseSchema.parse({ status: "ok" })).toEqual(
      { status: "ok" },
    );
    expect(contractModule.healthErrorCodeSchema.parse("UNAVAILABLE")).toBe(
      "UNAVAILABLE",
    );
    expect(
      contractModule.healthErrorSchema.parse({
        code: "UNAVAILABLE",
        message: "offline",
      }),
    ).toEqual({
      code: "UNAVAILABLE",
      message: "offline",
    });
  });

  it("exports the project-scoped optimizer status contract", () => {
    expect(contractModule.projectOptimizerStatusPath).toBe(
      "/projects/{projectId}/optimizer/status",
    );
    expect(
      contractModule.projectOptimizerStatusResponseSchema.parse({
        project_id: mainProjectId,
        optimizer_enabled: true,
        runtime_active: true,
        blocker_summary: null,
        token_usage: {
          availability: "available",
          failed_root_session_count: 0,
          failure_summary: null,
          root_session_count: 1,
          totals: {
            cache: { read: 30, write: 40 },
            cost: 1.25,
            input: 10,
            messages: 1,
            output: 20,
            reasoning: 5,
            total: 105,
          },
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
            used: 105,
          },
        },
        recent_events: [
          {
            event: "failure",
            lane_name: "developer",
            summary:
              "Developer lane failed for task task-1. Fix the blocker and retry.",
            task_id: "task-1",
            timestamp: "2026-04-29T10:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      project_id: mainProjectId,
      optimizer_enabled: true,
      runtime_active: true,
      blocker_summary: null,
      token_usage: {
        availability: "available",
        failed_root_session_count: 0,
        failure_summary: null,
        root_session_count: 1,
        totals: {
          cache: { read: 30, write: 40 },
          cost: 1.25,
          input: 10,
          messages: 1,
          output: 20,
          reasoning: 5,
          total: 105,
        },
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
          used: 105,
        },
      },
      recent_events: [
        {
          event: "failure",
          lane_name: "developer",
          summary:
            "Developer lane failed for task task-1. Fix the blocker and retry.",
          task_id: "task-1",
          timestamp: "2026-04-29T10:00:00.000Z",
        },
      ],
    });
    expect(
      contractModule.projectOptimizerStatusResponseSchema.safeParse({
        project_id: mainProjectId,
        optimizer_enabled: true,
        runtime_active: true,
        enabled_triggers: ["task_resolved"],
        recent_event: {
          task_id: "task-1",
          triggered_scan: true,
          type: "task_resolved",
        },
        recent_scan_at: "2026-04-27T10:00:00.000Z",
        blocker_summary: null,
        recent_events: [],
        token_usage: {
          availability: "unknown",
          failed_root_session_count: 0,
          failure_summary: null,
          root_session_count: 0,
          totals: {
            cache: { read: 0, write: 0 },
            cost: 0,
            input: 0,
            messages: 0,
            output: 0,
            reasoning: 0,
            total: 0,
          },
        },
      }).success,
    ).toBe(false);
  });

  it("exports project token budget warning thresholds and usage warning status", () => {
    expect(
      contractModule.createProjectRequestSchema.parse({
        name: "Budgeted project",
        git_origin_url: "https://github.com/example/budgeted.git",
        global_provider_id: "anthropic",
        global_model_id: "claude-sonnet-4-5",
        token_warning_threshold: 1000,
        cost_warning_threshold: 5,
      }),
    ).toEqual({
      name: "Budgeted project",
      git_origin_url: "https://github.com/example/budgeted.git",
      global_provider_id: "anthropic",
      global_model_id: "claude-sonnet-4-5",
      token_warning_threshold: 1000,
      cost_warning_threshold: 5,
    });
    expect(
      contractModule.patchProjectRequestSchema.parse({
        token_warning_threshold: null,
        cost_warning_threshold: 7.5,
      }),
    ).toEqual({
      token_warning_threshold: null,
      cost_warning_threshold: 7.5,
    });
    expect(
      contractModule.projectSchema.parse({
        id: mainProjectId,
        name: "Budgeted project",
        git_origin_url: "https://github.com/example/budgeted.git",
        global_provider_id: "anthropic",
        global_model_id: "claude-sonnet-4-5",
        optimizer_enabled: false,
        token_budget_limit: 1200,
        token_warning_threshold: 1000,
        cost_warning_threshold: null,
        created_at: "2026-04-30T00:00:00.000Z",
        updated_at: "2026-04-30T00:00:00.000Z",
      }),
    ).toMatchObject({
      token_budget_limit: 1200,
      token_warning_threshold: 1000,
      cost_warning_threshold: null,
    });

    expect(
      contractModule.projectTokenUsageResponseSchema.parse({
        project_id: mainProjectId,
        totals: {
          cache: { read: 0, write: 0 },
          cost: 3.75,
          input: 200,
          messages: 2,
          output: 300,
          reasoning: 0,
          total: 500,
        },
        budget_warning: {
          status: "exceeded",
          token_warning_threshold: 400,
          cost_warning_threshold: null,
          message:
            "Project token usage exceeds the configured token warning threshold.",
        },
        token_budget: {
          exhausted: false,
          limit: 1000,
          remaining: 500,
          used: 500,
        },
        tasks: [],
        sessions: [],
        failures: [],
      }).budget_warning,
    ).toEqual({
      status: "exceeded",
      token_warning_threshold: 400,
      cost_warning_threshold: null,
      message:
        "Project token usage exceeds the configured token warning threshold.",
    });
  });

  it("exports the Director clarification status patch contract", () => {
    expect(contractModule.projectDirectorClarificationByIdPath).toBe(
      "/projects/{projectId}/director/clarifications/{clarificationId}",
    );
    expect(
      contractModule.patchDirectorClarificationRequestSchema.parse({
        status: "addressed",
      }),
    ).toEqual({ status: "addressed" });
    expect(
      contractModule.patchDirectorClarificationRequestSchema.parse({
        status: "dismissed",
      }),
    ).toEqual({ status: "dismissed" });
    expect(
      contractModule.patchDirectorClarificationRequestSchema.parse({
        status: "open",
      }),
    ).toEqual({ status: "open" });

    const pathItem = contractModule.openApiDocument.paths[
      contractModule.projectDirectorClarificationByIdPath
    ] as
      | {
          patch?: {
            requestBody?: {
              content?: {
                "application/json"?: {
                  schema?: Record<string, unknown>;
                };
              };
            };
            responses: Record<string, unknown>;
          };
        }
      | undefined;

    expect(
      pathItem?.patch?.requestBody?.content?.["application/json"]?.schema,
    ).toEqual({
      $ref: "#/components/schemas/PatchDirectorClarificationRequest",
    });
    expect(pathItem?.patch?.responses["200"]).toBeDefined();
    expect(pathItem?.patch?.responses["400"]).toBeDefined();
    expect(pathItem?.patch?.responses["404"]).toBeDefined();
  });

  it("exports OpenCode model schemas from the built package boundary", () => {
    expect(contractModule.opencodeModelsPath).toBe("/opencode/models");
    expect(
      contractModule.opencodeModelsResponseSchema.parse({
        items: [
          {
            model_id: "claude-sonnet-4-5",
            model_name: "Claude Sonnet 4.5",
            provider_id: "anthropic",
            provider_name: "Anthropic",
          },
        ],
      }),
    ).toEqual({
      items: [
        {
          model_id: "claude-sonnet-4-5",
          model_name: "Claude Sonnet 4.5",
          provider_id: "anthropic",
          provider_name: "Anthropic",
        },
      ],
    });
    expect(
      contractModule.taskErrorCodeSchema.parse("OPENCODE_MODELS_UNAVAILABLE"),
    ).toBe("OPENCODE_MODELS_UNAVAILABLE");
  });

  it("exports task paths and task schemas from the built package boundary", () => {
    expect(contractModule.tasksPath).toBe("/tasks");
    expect(contractModule.taskByIdPath).toBe("/tasks/{taskId}");
    expect(contractModule.taskPullRequestStatusPath).toBe(
      "/tasks/{taskId}/pull_request_status",
    );
    expect(contractModule.taskStatusSchema.parse("pending")).toBe("pending");
    expect(contractModule.taskErrorCodeSchema.parse("TASK_NOT_FOUND")).toBe(
      "TASK_NOT_FOUND",
    );
    expect(
      contractModule.createTaskRequestSchema.parse({
        project_id: mainProjectId,
        task_spec: "Ship contract",
        title: "Ship contract",
      }),
    ).toEqual({
      project_id: mainProjectId,
      task_spec: "Ship contract",
      result: "",
      title: "Ship contract",
    });
    expect(
      contractModule.createTaskRequestSchema.safeParse({
        project_path: "/repo/main",
        task_spec: "Create the required model fields",
      }).success,
    ).toBe(false);
    expect(
      contractModule.patchTaskRequestSchema.parse({
        result: "final output",
      }),
    ).toEqual({
      result: "final output",
    });
    expect(
      contractModule.taskPullRequestStatusResponseSchema.parse({
        category: "failed_checks",
        pull_request_url: "https://github.com/example/repo/pull/42",
        recovery_action: "Fix failing checks and continue PR follow-up.",
        summary: "Required checks failed: test:api.",
        task_done: false,
        task_status: "pending",
      }),
    ).toMatchObject({
      category: "failed_checks",
      task_status: "pending",
    });
    expect(
      contractModule.taskSchema.parse({
        global_model_id: "claude-sonnet-4-5",
        global_provider_id: "anthropic",
        project_id: mainProjectId,
        task_id: "task-1",
        task_spec: "Ship contract",
        title: "Ship contract",
        git_origin_url: "https://github.com/example/repo.git",
        result: "complete",
        source_metadata: {},
        source_baseline_freshness: unknownSourceBaselineFreshness,
        session_id: null,
        worktree_path: null,
        pull_request_url: null,
        dependencies: [],
        done: false,
        status: "pending",
        created_at: "2026-04-19T00:00:00.000Z",
        updated_at: "2026-04-19T00:00:00.000Z",
      }),
    ).toMatchObject({
      task_id: "task-1",
      result: "complete",
      status: "pending",
    });
    expect(
      contractModule.taskListResponseSchema.parse({
        items: [
          {
            global_model_id: "claude-sonnet-4-5",
            global_provider_id: "anthropic",
            project_id: mainProjectId,
            task_id: "task-1",
            task_spec: "Ship contract",
            title: "Ship contract",
            git_origin_url: "https://github.com/example/repo.git",
            result: "complete",
            source_metadata: {},
            source_baseline_freshness: unknownSourceBaselineFreshness,
            session_id: null,
            worktree_path: null,
            pull_request_url: null,
            dependencies: [],
            done: false,
            status: "pending",
            created_at: "2026-04-19T00:00:00.000Z",
            updated_at: "2026-04-19T00:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({
      items: [
        {
          task_id: "task-1",
        },
      ],
    });
    expect(
      contractModule.taskSchema.safeParse({
        task_id: "task-1",
        task_spec: "Ship contract",
        project_id: mainProjectId,
        git_origin_url: "https://github.com/example/repo.git",
        source_metadata: {},
        session_id: null,
        worktree_path: null,
        pull_request_url: null,
        dependencies: [],
        done: false,
        status: "pending",
        created_at: "2026-04-19T00:00:00.000Z",
        updated_at: "2026-04-19T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      contractModule.taskErrorSchema.parse({
        code: "TASK_VALIDATION_ERROR",
        message: "bad input",
      }),
    ).toEqual({
      code: "TASK_VALIDATION_ERROR",
      message: "bad input",
    });
  });

  it("limits the public task status contract to pending, resolved, and rejected", () => {
    const publicStatuses = ["pending", "resolved", "rejected"];
    const retiredStatuses = [
      "created",
      "waiting_assumptions",
      "running",
      "outbound",
      "pr_following",
      "closing",
      "succeeded",
      "failed",
    ];
    const createTaskRequestSchema = contractModule.openApiDocument.components
      .schemas.CreateTaskRequest as {
      properties: Record<string, { enum?: string[] }>;
    };

    for (const status of publicStatuses) {
      expect(contractModule.taskStatusSchema.parse(status)).toBe(status);
    }

    for (const status of retiredStatuses) {
      expect(contractModule.taskStatusSchema.safeParse(status).success).toBe(
        false,
      );
    }

    expect(createTaskRequestSchema.properties.status).toBeUndefined();
  });

  it("publishes a minimal health OpenAPI document", () => {
    const getOperation =
      contractModule.openApiDocument.paths[contractModule.healthPath]?.get;

    expect(contractModule.openApiDocument.openapi).toBe("3.1.0");
    expect(
      getOperation?.responses["200"]?.content?.["application/json"]?.schema,
    ).toEqual({
      $ref: "#/components/schemas/HealthResponse",
    });
    expect(
      (getOperation as { security?: unknown } | undefined)?.security,
    ).toBeUndefined();
    expect(
      contractModule.openApiDocument.components.schemas.HealthError,
    ).toMatchObject({
      type: "object",
      required: ["code", "message"],
    });
  });

  it("publishes task CRUD operations in the shared OpenAPI document", () => {
    const tasksPathItem = contractModule.openApiDocument.paths["/tasks"] as
      | {
          get?: {
            parameters?: Array<Record<string, unknown>>;
          };
          post?: {
            responses: Record<string, unknown>;
          };
        }
      | undefined;
    const taskByIdPathItem = contractModule.openApiDocument.paths[
      "/tasks/{taskId}"
    ] as
      | {
          delete?: {
            responses: Record<string, unknown>;
          };
          get?: {
            responses: Record<string, unknown>;
          };
          patch?: {
            requestBody?: {
              content?: {
                "application/json"?: {
                  schema?: Record<string, unknown>;
                };
              };
            };
            responses: Record<
              string,
              {
                content?: {
                  "application/json"?: {
                    schema?: Record<string, unknown>;
                  };
                };
              }
            >;
          };
        }
      | undefined;
    const taskWorktreePathItem = contractModule.openApiDocument.paths[
      "/tasks/{taskId}/worktree_path"
    ] as
      | {
          put?: {
            requestBody?: {
              content?: {
                "application/json"?: {
                  schema?: Record<string, unknown>;
                };
              };
            };
            responses: Record<string, unknown>;
          };
        }
      | undefined;
    const taskPullRequestUrlPathItem = contractModule.openApiDocument.paths[
      "/tasks/{taskId}/pull_request_url"
    ] as typeof taskWorktreePathItem;
    const taskPullRequestStatusPathItem = contractModule.openApiDocument.paths[
      "/tasks/{taskId}/pull_request_status"
    ] as
      | {
          get?: {
            responses: Record<
              string,
              {
                content?: {
                  "application/json"?: {
                    schema?: Record<string, unknown>;
                  };
                };
              }
            >;
          };
        }
      | undefined;
    const taskDependenciesPathItem = contractModule.openApiDocument.paths[
      "/tasks/{taskId}/dependencies"
    ] as typeof taskWorktreePathItem;
    const taskSpecPathItem = contractModule.openApiDocument.paths[
      contractModule.taskSpecPath
    ] as
      | {
          get?: {
            responses?: Record<
              string,
              {
                content?: {
                  "application/json"?: unknown;
                  "text/markdown"?: {
                    schema?: Record<string, unknown>;
                  };
                };
              }
            >;
          };
        }
      | undefined;
    const taskQueryParameters = (tasksPathItem?.get?.parameters ?? []).map(
      (parameter) => {
        if ("$ref" in parameter && typeof parameter.$ref === "string") {
          return parameter.$ref;
        }

        return parameter.name;
      },
    );

    expect(tasksPathItem).toBeDefined();
    expect(taskByIdPathItem).toBeDefined();
    expect(taskWorktreePathItem).toBeDefined();
    expect(taskPullRequestUrlPathItem).toBeDefined();
    expect(taskPullRequestStatusPathItem).toBeDefined();
    expect(taskDependenciesPathItem).toBeDefined();
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/tasks/{taskId}/resolve",
    );
    expect(contractModule.openApiDocument.paths).not.toHaveProperty(
      "/tasks/{taskId}/reject",
    );
    expect(contractModule.taskSpecPath).toBe("/tasks/{taskId}/spec");
    expect(taskSpecPathItem).toBeDefined();
    expect(tasksPathItem?.post?.responses["201"]).toBeDefined();
    expect(taskQueryParameters).toEqual(
      expect.arrayContaining([
        "#/components/parameters/TaskStatusQueryParameter",
        "#/components/parameters/TaskDoneQueryParameter",
        "#/components/parameters/TaskProjectIdQueryParameter",
        "#/components/parameters/TaskSessionIdQueryParameter",
      ]),
    );
    expect(
      taskByIdPathItem?.patch?.requestBody?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/PatchTaskRequest",
    });
    expect(
      taskByIdPathItem?.patch?.responses["200"]?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/Task",
    });
    expect(
      taskByIdPathItem?.patch?.responses["400"]?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/ErrorResponse",
    });
    expect(
      taskByIdPathItem?.patch?.responses["404"]?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/ErrorResponse",
    });
    expect(taskByIdPathItem?.delete?.responses["204"]).toBeDefined();
    expect(taskByIdPathItem?.get?.responses["404"]).toBeDefined();
    expect(
      taskWorktreePathItem?.put?.requestBody?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/TaskWorktreePathRequest",
    });
    expect(taskWorktreePathItem?.put?.responses["200"]).toBeDefined();
    expect(taskWorktreePathItem?.put?.responses["400"]).toBeDefined();
    expect(taskWorktreePathItem?.put?.responses["404"]).toBeDefined();
    expect(
      taskPullRequestUrlPathItem?.put?.requestBody?.content?.[
        "application/json"
      ]?.schema,
    ).toEqual({
      $ref: "#/components/schemas/TaskPullRequestUrlRequest",
    });
    expect(taskPullRequestUrlPathItem?.put?.responses["200"]).toBeDefined();
    expect(taskPullRequestUrlPathItem?.put?.responses["400"]).toBeDefined();
    expect(taskPullRequestUrlPathItem?.put?.responses["404"]).toBeDefined();
    expect(
      taskPullRequestStatusPathItem?.get?.responses["200"]?.content?.[
        "application/json"
      ]?.schema,
    ).toEqual({
      $ref: "#/components/schemas/TaskPullRequestStatusResponse",
    });
    expect(
      taskPullRequestStatusPathItem?.get?.responses["404"]?.content?.[
        "application/json"
      ]?.schema,
    ).toEqual({
      $ref: "#/components/schemas/ErrorResponse",
    });
    expect(
      taskDependenciesPathItem?.put?.requestBody?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/TaskDependenciesRequest",
    });
    expect(taskDependenciesPathItem?.put?.responses["200"]).toBeDefined();
    expect(taskDependenciesPathItem?.put?.responses["400"]).toBeDefined();
    expect(taskDependenciesPathItem?.put?.responses["404"]).toBeDefined();
    expect(
      taskSpecPathItem?.get?.responses?.["200"]?.content?.["text/markdown"]
        ?.schema,
    ).toEqual({
      type: "string",
    });
    expect(
      taskSpecPathItem?.get?.responses?.["200"]?.content?.["application/json"],
    ).toBeUndefined();
    expect(
      taskSpecPathItem?.get?.responses?.["404"]?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/ErrorResponse",
    });
  });

  it("publishes atomic task batch operations without task write bulk contracts", () => {
    const tasksBatchPathItem = contractModule.openApiDocument.paths[
      contractModule.tasksBatchPath
    ] as
      | {
          post?: {
            operationId?: string;
            requestBody?: {
              content?: {
                "application/json"?: {
                  schema?: Record<string, unknown>;
                };
              };
            };
            responses: Record<
              string,
              {
                content?: {
                  "application/json"?: {
                    schema?: Record<string, unknown>;
                  };
                };
              }
            >;
          };
        }
      | undefined;

    expect(contractModule.tasksBatchPath).toBe("/tasks/batch");
    expect(tasksBatchPathItem?.post?.operationId).toBe("createTaskBatch");
    expect(
      tasksBatchPathItem?.post?.requestBody?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/CreateTaskBatchRequest",
    });
    expect(
      tasksBatchPathItem?.post?.responses["200"]?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/TaskBatchResponse",
    });
    expect(
      contractModule.createTaskBatchRequestSchema.parse({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: "11111111-1111-4111-8111-111111111111",
              title: "Ship batch",
              spec: "Create the endpoint",
              source_metadata: { coordinator_session_id: "session-1" },
            },
          },
          {
            type: "delete",
            delete_reason:
              "Stale unfinished task has no active worktree or PR and is superseded by baseline coverage.",
            task_id: "22222222-2222-4222-8222-222222222222",
          },
        ],
      }),
    ).toMatchObject({
      project_id: mainProjectId,
      operations: [{ type: "create" }, { type: "delete" }],
    });
    expect(
      contractModule.createTaskBatchRequestSchema.safeParse({
        project_id: mainProjectId,
        operations: [
          {
            type: "create",
            task: {
              task_id: "not-a-uuid",
              title: "Ship batch",
              spec: "Create the endpoint",
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      contractModule.taskBatchResponseSchema.parse({
        results: [
          {
            task_id: "11111111-1111-4111-8111-111111111111",
            type: "create",
          },
          {
            task_id: "22222222-2222-4222-8222-222222222222",
            type: "delete",
          },
        ],
      }),
    ).toEqual({
      results: [
        {
          task_id: "11111111-1111-4111-8111-111111111111",
          type: "create",
        },
        {
          task_id: "22222222-2222-4222-8222-222222222222",
          type: "delete",
        },
      ],
    });
    expect(
      contractModule.openApiDocument.components.schemas,
    ).not.toHaveProperty("TaskWriteBulk");
    expect(
      contractModule.openApiDocument.components.schemas,
    ).not.toHaveProperty("CreateTaskWriteBulkRequest");
  });

  it("publishes OpenCode model operations in the shared OpenAPI document", () => {
    const opencodeModelsPathItem = contractModule.openApiDocument.paths[
      contractModule.opencodeModelsPath
    ] as
      | {
          get?: {
            responses: Record<
              string,
              {
                content?: {
                  "application/json"?: {
                    schema?: Record<string, unknown>;
                  };
                };
              }
            >;
          };
        }
      | undefined;

    expect(
      opencodeModelsPathItem?.get?.responses["200"]?.content?.[
        "application/json"
      ]?.schema,
    ).toEqual({
      $ref: "#/components/schemas/OpenCodeModelsResponse",
    });
    expect(
      opencodeModelsPathItem?.get?.responses["503"]?.content?.[
        "application/json"
      ]?.schema,
    ).toEqual({
      $ref: "#/components/schemas/ErrorResponse",
    });
  });

  it("exports OpenCode session schemas from the built package boundary", () => {
    expect(contractModule.openCodeSessionsPath).toBe("/opencode/sessions");
    expect(contractModule.openCodeSessionByIdPath).toBe(
      "/opencode/sessions/{sessionId}",
    );
    expect(contractModule.openCodeSessionStateSchema.parse("pending")).toBe(
      "pending",
    );
    expect(
      contractModule.openCodeSessionSchema.parse({
        session_id: "session-1",
        state: "pending",
        value: null,
        reason: null,
        continue_prompt: "Continue.",
        title: "AIM Developer: Session 1",
        project_id: "00000000-0000-4000-8000-000000000101",
        provider_id: "anthropic",
        model_id: "claude-sonnet-4-5",
        input_tokens: 10,
        cached_tokens: 30,
        cache_write_tokens: 40,
        output_tokens: 20,
        reasoning_tokens: 5,
        stale: false,
        created_at: "2026-04-27T10:00:00.000Z",
        updated_at: "2026-04-27T10:00:00.000Z",
      }),
    ).toMatchObject({
      continue_prompt: "Continue.",
      cached_tokens: 30,
      cache_write_tokens: 40,
      input_tokens: 10,
      model_id: "claude-sonnet-4-5",
      output_tokens: 20,
      project_id: "00000000-0000-4000-8000-000000000101",
      provider_id: "anthropic",
      reasoning_tokens: 5,
      session_id: "session-1",
      stale: false,
      state: "pending",
      title: "AIM Developer: Session 1",
    });
  });

  it("publishes task CRUD schemas in the shared OpenAPI document", () => {
    const createTaskRequestSchema =
      contractModule.openApiDocument.components.schemas.CreateTaskRequest;
    const taskListResponseSchema =
      contractModule.openApiDocument.components.schemas.TaskListResponse;

    expect(
      contractModule.openApiDocument.components.schemas.Task,
    ).toBeDefined();
    expect(createTaskRequestSchema).toBeDefined();
    expect(
      contractModule.openApiDocument.components.schemas.PatchTaskRequest,
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.components.schemas,
    ).not.toHaveProperty("TaskResultRequest");
    expect(taskListResponseSchema).toBeDefined();
    expect(
      contractModule.openApiDocument.components.schemas.ErrorResponse,
    ).toBeDefined();

    expect(createTaskRequestSchema).toMatchObject({
      required: ["title", "task_spec", "project_id"],
    });
    expect(
      Object.keys(
        (createTaskRequestSchema as { properties: Record<string, unknown> })
          .properties,
      ).sort(),
    ).toEqual([
      "dependencies",
      "project_id",
      "pull_request_url",
      "result",
      "session_id",
      "task_spec",
      "title",
      "worktree_path",
    ]);
    expect(
      (
        createTaskRequestSchema as {
          properties: Record<string, { type?: unknown; enum?: string[] }>;
        }
      ).properties.session_id,
    ).toMatchObject({ type: ["string", "null"] });
    expect(
      (
        createTaskRequestSchema as {
          properties: Record<string, { type?: unknown; enum?: string[] }>;
        }
      ).properties.worktree_path,
    ).toMatchObject({ type: ["string", "null"] });
    expect(
      (
        createTaskRequestSchema as {
          properties: Record<string, { type?: unknown; enum?: string[] }>;
        }
      ).properties.pull_request_url,
    ).toMatchObject({ type: ["string", "null"] });
    expect(
      contractModule.openApiDocument.components.schemas.Task,
    ).toMatchObject({
      required: expect.arrayContaining(["result"]),
    });
    expect(
      (
        contractModule.openApiDocument.components.schemas.Task as {
          properties: Record<string, unknown>;
        }
      ).properties.result,
    ).toEqual({
      type: "string",
    });
    expect(
      (
        createTaskRequestSchema as {
          properties: Record<string, unknown>;
        }
      ).properties.result,
    ).toEqual({
      default: "",
      type: "string",
    });
    expect(taskListResponseSchema).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            $ref: "#/components/schemas/Task",
          },
        },
      },
    });
  });

  it("requires project_id in task responses and create requests while retaining git_origin_url on responses", async () => {
    const taskSchema = contractModule.openApiDocument.components.schemas
      .Task as {
      properties: Record<string, unknown>;
      required: string[];
    };
    const createSchema = contractModule.openApiDocument.components.schemas
      .CreateTaskRequest as {
      properties: Record<string, unknown>;
      required: string[];
    };
    const generatedTypeDefinitions = await readFile(
      generatedTypeDefinitionsUrl,
      "utf8",
    );

    expect(taskSchema.required).toContain("git_origin_url");
    expect(taskSchema.required).toContain("project_id");
    expect(createSchema.required).toContain("project_id");
    expect(taskSchema.properties.git_origin_url).toEqual({
      minLength: 1,
      type: "string",
    });
    expect(createSchema.properties.project_id).toEqual({
      format: "uuid",
      type: "string",
    });
    expect(
      contractModule.createTaskRequestSchema.safeParse({
        task_spec: "write plan",
      }).success,
    ).toBe(false);
    expect(
      contractModule.createTaskRequestSchema.safeParse({
        project_id: "/repo/main",
        task_spec: "write plan",
        title: "Write plan",
      }).success,
    ).toBe(false);
    expect(
      contractModule.createTaskRequestSchema.safeParse({
        project_id: "00000000-0000-4000-8000-000000000000",
        task_spec: "write plan",
        title: "Write plan",
      }).success,
    ).toBe(true);
    expect(
      contractModule.taskSchema.safeParse({
        task_id: "task-1",
        task_spec: "Ship contract",
        session_id: null,
        worktree_path: null,
        pull_request_url: null,
        dependencies: [],
        done: false,
        status: "pending",
        created_at: "2026-04-19T00:00:00.000Z",
        updated_at: "2026-04-19T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(generatedTypeDefinitions).toContain("git_origin_url: string;");
    expect(generatedTypeDefinitions).toContain("project_id: string;");
    expect(generatedTypeDefinitions).toContain("result: string;");
  });

  it("publishes a public CreateTaskRequest type that allows omitting result", async () => {
    const contractTypeDefinitions = await readFile(
      contractTypeDefinitionUrl,
      "utf8",
    );

    expect(contractTypeDefinitions).toContain(
      "type CreateTaskRequest = input<typeof createTaskRequestSchema>;",
    );
    expect(contractTypeDefinitions).toContain(
      "type ParsedCreateTaskRequest = output<typeof createTaskRequestSchema>;",
    );
  });

  it("rejects project_path inside PatchTaskRequest", async () => {
    const patchSchema = contractModule.openApiDocument.components.schemas
      .PatchTaskRequest as {
      additionalProperties?: boolean;
      properties: Record<string, unknown>;
    };
    const generatedZodSource = await readFile(generatedZodUrl, "utf8");

    expect(patchSchema.additionalProperties).toBe(false);
    expect(patchSchema.properties.project_path).toBeUndefined();
    expect(patchSchema.properties.result).toEqual({ type: "string" });
    expect(
      generatedZodModule.schemas.PatchTaskRequest.safeParse({
        project_path: "/repo",
      }).success,
    ).toBe(false);
    expect(
      contractModule.patchTaskRequestSchema.safeParse({
        project_path: "/repo",
      }).success,
    ).toBe(false);
    const patchTaskRequestSource = generatedZodSource.match(
      /const PatchTaskRequest = z[\s\S]*?\.strict\(\);/,
    )?.[0];

    expect(patchTaskRequestSource).toBeDefined();
    expect(patchTaskRequestSource).not.toContain("project_path");
    expect(
      contractModule.patchTaskRequestSchema.parse({ result: "run summary" }),
    ).toEqual({ result: "run summary" });
  });

  it("moves contract package inputs to the OpenAPI generation pipeline", async () => {
    const [generatedOpenApiSource, generatedClientSdkSource] =
      await Promise.all([
        readFile(generatedOpenApiUrl, "utf8"),
        readFile(generatedClientSdkUrl, "utf8"),
      ]);

    expect(rootPackage.scripts).not.toHaveProperty("openapi:generate");
    expect(rootPackage.scripts).not.toHaveProperty("openapi:check");
    expect(contractPackage.scripts?.["openapi:check"]).toContain(
      "generate:check",
    );
    expect(contractPackage.scripts?.["openapi:check"]).toContain("tasksPath");
    expect(contractPackage.scripts?.["openapi:check"]).toContain(
      "taskByIdPath",
    );
    expect(contractPackage.scripts?.["openapi:check"]).toContain(
      "taskSpecPath",
    );
    expect(contractPackage.scripts?.["openapi:check"]).not.toContain(
      "managerReportsPath",
    );
    expect(contractPackage.scripts?.["openapi:check"]).toContain(
      "tasksBatchPath",
    );
    expect(contractPackage.scripts?.["openapi:check"]).toContain(
      "dimensionsPath",
    );
    expect(contractPackage.scripts?.["openapi:check"]).toContain(
      "projectDirectorClarificationsPath",
    );
    expect(contractPackage.scripts?.generate).toBeDefined();
    expect(contractPackage.scripts?.["build:dist"]).toContain(
      "pnpm run generate",
    );
    expect(contractPackage.scripts?.build).toBe(
      "pnpm run build:dist && pnpm run test:type && pnpm run test:lint && pnpm run test:vitest",
    );
    expect(contractPackage.scripts?.["test:vitest"]).toBe(
      skipTest(
        "pnpm --dir ../.. exec vitest run --config vitest.workspace.ts --project contract",
      ),
    );
    expect(apiPackage.scripts?.build).toBe(
      "pnpm run build:dist && pnpm run test:type && pnpm run test:lint && pnpm run test:vitest",
    );
    expect(apiPackage.scripts?.["test:vitest"]).toBe(
      skipTest(
        "pnpm --dir ../.. exec vitest run --config vitest.workspace.ts --project api",
      ),
    );
    expect(cliPackage.scripts?.build).toBe(
      "pnpm run build:dist && pnpm run test:type && pnpm run test:lint && pnpm run test:vitest && pnpm run test:smoke && pnpm run test:pack",
    );
    expect(cliPackage.scripts?.["test:vitest"]).toBe(
      skipTest(
        "pnpm --dir ../.. exec vitest run --config vitest.workspace.ts --project cli",
      ),
    );
    expect(cliPackage.scripts?.["test:smoke"]).not.toContain(
      "pnpm run build:dist",
    );
    expect(webPackage.scripts?.build).toBe(
      "pnpm run build:dist && pnpm run test:type && pnpm run test:lint && pnpm run test:web",
    );
    expect(contractPackage.dependencies?.yaml).toBeUndefined();
    expect(contractPackage.devDependencies?.yaml).toBe("^2.8.3");
    expect(contractPackage.scripts?.["generate:zod"]).not.toContain(
      "node_modules",
    );
    await expect(readFile(generatedTypesUrl, "utf8")).resolves.toContain(
      'export * from "./_types/types.gen.js";',
    );
    await expect(
      readFile(generatedTypeDefinitionsUrl, "utf8"),
    ).resolves.toContain("TaskListResponse");
    await expect(generatedClientModule.listTasks).toBeTypeOf("function");
    await expect(generatedClientModule.createTask).toBeTypeOf("function");
    await expect(generatedClientModule.createTaskBatch).toBeTypeOf("function");
    await expect(generatedClientModule.getTaskById).toBeTypeOf("function");
    await expect(generatedClientModule.patchTaskById).toBeTypeOf("function");
    await expect(generatedClientModule.deleteTaskById).toBeTypeOf("function");
    await expect(generatedClientModule).not.toHaveProperty("resolveTaskById");
    await expect(generatedClientModule).not.toHaveProperty("rejectTaskById");
    await expect(generatedClientModule.createOpenCodeSession).toBeTypeOf(
      "function",
    );
    await expect(generatedClientModule.getOpenCodeSessionById).toBeTypeOf(
      "function",
    );
    await expect(generatedClientModule).not.toHaveProperty(
      "continueOpenCodeSessionById",
    );
    await expect(generatedClientModule).not.toHaveProperty(
      "continuePendingOpenCodeSessions",
    );
    await expect(generatedClientModule.resolveOpenCodeSessionById).toBeTypeOf(
      "function",
    );
    await expect(generatedClientModule.rejectOpenCodeSessionById).toBeTypeOf(
      "function",
    );
    expect(generatedOpenApiSource).toContain('"/tasks/{taskId}/spec"');
    expect(generatedOpenApiSource).toContain(
      '"/opencode/sessions/{sessionId}"',
    );
    expect(generatedOpenApiSource).not.toContain(
      '"/opencode/sessions/continue_pending"',
    );
    expect(generatedOpenApiSource).not.toContain(
      '"/opencode/sessions/{sessionId}/continue"',
    );
    await expect(readFile(generatedClientUrl, "utf8")).resolves.toContain(
      'export * from "./_client/index.js";',
    );
    expect(generatedClientSdkSource).toContain("listTasks");
    expect(generatedClientSdkSource).toContain("createTaskBatch");
    expect(generatedClientSdkSource).toContain("getTaskSpecById");
    expect(generatedClientSdkSource).toContain("createOpenCodeSession");
    expect(generatedClientSdkSource).not.toContain(
      "continueOpenCodeSessionById",
    );
    expect(generatedClientSdkSource).not.toContain(
      "continuePendingOpenCodeSessions",
    );
    await expect(readFile(generatedZodUrl, "utf8")).resolves.toContain(
      "CreateTaskRequest",
    );
  });

  it("uses generic OpenAPI banners for generated contract entrypoints", async () => {
    const [generatedClientSource, generatedTypesSource] = await Promise.all([
      readFile(generatedClientUrl, "utf8"),
      readFile(generatedTypesUrl, "utf8"),
    ]);

    expect(generatedClientSource).toContain(
      "This file is auto-generated from the OpenAPI contract.",
    );
    expect(generatedTypesSource).toContain(
      "This file is auto-generated from the OpenAPI contract.",
    );
    expect(generatedClientSource).not.toContain("/health OpenAPI contract");
    expect(generatedTypesSource).not.toContain("/health OpenAPI contract");
  });

  it("keeps generated client runtime artifacts stable", async () => {
    await expect(
      readFile(generatedClientDefinitionUrl, "utf8"),
    ).resolves.toContain("./client/index.js");
    await expect(readFile(generatedClientSdkUrl, "utf8")).resolves.toContain(
      "./client/index.js",
    );
    await expect(
      access(generatedClientBundledAuthUrl),
    ).resolves.toBeUndefined();
    await expect(access(generatedClientRawAuthUrl)).rejects.toBeDefined();
  });

  it("keeps generated zod artifacts free of undeclared runtime imports", async () => {
    const generatedZodSource = await readFile(generatedZodUrl, "utf8");

    expect(generatedZodSource).not.toContain("@zodios/core");
  });

  it("keeps the public root boundary free of generated leaks and runtime-only OpenAPI loaders", async () => {
    const [entrySource, openApiSource] = await Promise.all([
      readFile(contractIndexSourceUrl, "utf8"),
      readFile(contractOpenApiSourceUrl, "utf8"),
    ]);

    expect(entrySource).not.toContain('export * from "../generated');
    expect(entrySource).not.toContain("GetHealthResponse");
    expect(entrySource).not.toContain("GetHealthError");
    expect(entrySource).not.toContain("ContractFetch");
    expect(openApiSource).not.toContain("node:fs");
    expect(openApiSource).not.toContain("node:url");
    expect(openApiSource).not.toContain('from "yaml"');
    expect(openApiSource).toContain("../generated/openapi");
  });

  const getRequestedPath = (input: unknown) => {
    const target =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : String(input);
    return new URL(target, "http://contract.test").pathname;
  };

  const getAcceptHeader = (input: unknown, init: unknown) => {
    if (input instanceof Request) {
      return input.headers.get("accept");
    }

    const headers =
      init && typeof init === "object" && "headers" in init
        ? init.headers
        : undefined;

    return new Headers(headers as HeadersInit | undefined).get("accept");
  };

  it("creates a typed health client helper", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = contractModule.createContractClient({
      fetch: fetcher,
    });

    await expect(client.getHealth()).resolves.toEqual({ status: "ok" });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [input, init] = fetcher.mock.calls[0] ?? [];
    const request = input instanceof Request ? input : undefined;
    const rawTarget =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : String(input);

    expect(getRequestedPath(input)).toBe(contractModule.healthPath);
    expect(rawTarget).toBe(contractModule.healthPath);
    expect(request?.method ?? "GET").toBe("GET");
    expect(getAcceptHeader(input, init)).toBe("application/json");
  });

  it("throws a typed contract error for non-ok responses through the fetch-only boundary", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: "UNAVAILABLE", message: "offline" }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const client = contractModule.createContractClient({
      fetch: fetcher,
    });

    const result = client.getHealth();

    await expect(result).rejects.toBeInstanceOf(
      contractModule.ContractClientError,
    );
    await expect(result).rejects.toMatchObject({
      status: 503,
      error: { code: "UNAVAILABLE", message: "offline" },
    });

    expect(fetcher).toHaveBeenCalledTimes(1);

    const [input] = fetcher.mock.calls[0] ?? [];
    const request = input instanceof Request ? input : undefined;

    expect(getRequestedPath(input)).toBe(contractModule.healthPath);
    expect(request?.method ?? "GET").toBe("GET");
  });

  it("creates typed task CRUD client helpers", async () => {
    const task = {
      task_id: "task-1",
      title: "Write spec",
      task_spec: "write spec",
      project_id: mainProjectId,
      git_origin_url: "https://github.com/example/repo.git",
      global_provider_id: "anthropic",
      global_model_id: "claude-sonnet-4-5",
      result: "",
      session_id: null,
      worktree_path: null,
      pull_request_url: null,
      dependencies: [],
      source_metadata: {},
      source_baseline_freshness: unknownSourceBaselineFreshness,
      done: false,
      status: "pending",
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
    };
    const requests: Array<{
      body: unknown;
      method: string;
      pathname: string;
      searchParams: Record<string, string>;
    }> = [];
    const fetcher = vi.fn(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) =>
        (async () => {
          const request =
            input instanceof Request
              ? input
              : new Request(
                  new URL(String(input), "http://contract.test"),
                  init,
                );
          const url = new URL(request.url, "http://contract.test");
          const bodyText =
            request.method === "POST" || request.method === "PATCH"
              ? await request.text()
              : undefined;

          requests.push({
            body: bodyText ? JSON.parse(bodyText) : undefined,
            method: request.method,
            pathname: url.pathname,
            searchParams: Object.fromEntries(url.searchParams.entries()),
          });

          if (request.method === "GET" && url.pathname === "/tasks") {
            return new Response(JSON.stringify({ items: [] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }

          if (
            request.method === "POST" &&
            url.pathname === "/tasks" &&
            bodyText ===
              JSON.stringify({
                title: "Write spec",
                task_spec: "write spec",
                project_id: mainProjectId,
                dependencies: [],
              })
          ) {
            return new Response(JSON.stringify(task), {
              status: 201,
              headers: { "content-type": "application/json" },
            });
          }

          if (request.method === "GET" && url.pathname === "/tasks/task-1") {
            return new Response(JSON.stringify(task), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }

          if (
            request.method === "PATCH" &&
            url.pathname === "/tasks/task-1" &&
            bodyText === JSON.stringify({ result: "run summary" })
          ) {
            return new Response(
              JSON.stringify({ ...task, result: "run summary" }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            );
          }

          if (request.method === "DELETE" && url.pathname === "/tasks/task-1") {
            return new Response(null, { status: 204 });
          }

          throw new Error(
            `unexpected request: ${request.method} ${url.pathname}${url.search}`,
          );
        })(),
    );

    const client = contractModule.createContractClient({
      fetch: fetcher,
    });

    await expect(
      client.listTasks({
        done: false,
        project_id: mainProjectId,
        session_id: "session-1",
        status: "pending",
      }),
    ).resolves.toEqual({
      items: [],
    });
    await expect(
      client.createTask({
        title: "Write spec",
        task_spec: "write spec",
        project_id: mainProjectId,
        dependencies: [],
      }),
    ).resolves.toMatchObject({
      task_id: "task-1",
      task_spec: "write spec",
      git_origin_url: "https://github.com/example/repo.git",
      result: "",
      status: "pending",
    });
    await expect(client.getTaskById("task-1")).resolves.toMatchObject({
      task_id: "task-1",
    });
    await expect(
      client.patchTaskById("task-1", { result: "run summary" }),
    ).resolves.toMatchObject({
      task_id: "task-1",
      result: "run summary",
    });
    await expect(client.deleteTaskById("task-1")).resolves.toBeUndefined();

    expect(fetcher.mock.calls).toHaveLength(5);
    expect(requests).toEqual([
      {
        body: undefined,
        method: "GET",
        pathname: contractModule.tasksPath,
        searchParams: {
          done: "false",
          project_id: mainProjectId,
          session_id: "session-1",
          status: "pending",
        },
      },
      {
        body: {
          title: "Write spec",
          task_spec: "write spec",
          project_id: mainProjectId,
          dependencies: [],
        },
        method: "POST",
        pathname: contractModule.tasksPath,
        searchParams: {},
      },
      {
        body: undefined,
        method: "GET",
        pathname: "/tasks/task-1",
        searchParams: {},
      },
      {
        body: { result: "run summary" },
        method: "PATCH",
        pathname: "/tasks/task-1",
        searchParams: {},
      },
      {
        body: undefined,
        method: "DELETE",
        pathname: "/tasks/task-1",
        searchParams: {},
      },
    ]);
  });

  it("creates typed Director clarification status client helpers", async () => {
    const clarification = {
      id: "clarification-1",
      project_id: mainProjectId,
      dimension_id: null,
      kind: "clarification",
      message: "Please clarify the acceptance criteria.",
      status: "addressed",
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:01:00.000Z",
    };
    const requests: Array<{
      body: unknown;
      method: string;
      pathname: string;
    }> = [];
    const fetcher = vi.fn(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) =>
        (async () => {
          const request =
            input instanceof Request
              ? input
              : new Request(
                  new URL(String(input), "http://contract.test"),
                  init,
                );
          const url = new URL(request.url, "http://contract.test");
          const bodyText =
            request.method === "POST" || request.method === "PATCH"
              ? await request.text()
              : undefined;

          requests.push({
            body: bodyText ? JSON.parse(bodyText) : undefined,
            method: request.method,
            pathname: url.pathname,
          });

          if (
            request.method === "PATCH" &&
            url.pathname ===
              `/projects/${mainProjectId}/director/clarifications/clarification-1` &&
            bodyText === JSON.stringify({ status: "addressed" })
          ) {
            return new Response(JSON.stringify(clarification), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }

          throw new Error(
            `unexpected request: ${request.method} ${url.pathname}`,
          );
        })(),
    );

    const client = contractModule.createContractClient({
      fetch: fetcher,
    });

    await expect(
      client.patchDirectorClarificationById(mainProjectId, "clarification-1", {
        status: "addressed",
      }),
    ).resolves.toEqual(clarification);

    expect(requests).toEqual([
      {
        body: { status: "addressed" },
        method: "PATCH",
        pathname: `/projects/${mainProjectId}/director/clarifications/clarification-1`,
      },
    ]);
  });

  it("throws ContractClientError with task error payloads", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: "TASK_NOT_FOUND", message: "missing task" }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const client = contractModule.createContractClient({
      fetch: fetcher,
    });

    const result = client.getTaskById("missing");

    await expect(result).rejects.toBeInstanceOf(
      contractModule.ContractClientError,
    );
    await expect(result).rejects.toMatchObject({
      status: 404,
      error: { code: "TASK_NOT_FOUND", message: "missing task" },
    });
  });

  it("throws ContractClientError with task error payloads for createTask validation errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "TASK_VALIDATION_ERROR",
          message: "task_spec is required",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const client = contractModule.createContractClient({
      fetch: fetcher,
    });

    const result = client.createTask({
      project_id: mainProjectId,
      task_spec: "",
    });

    await expect(result).rejects.toBeInstanceOf(
      contractModule.ContractClientError,
    );
    await expect(result).rejects.toMatchObject({
      status: 400,
      error: {
        code: "TASK_VALIDATION_ERROR",
        message: "task_spec is required",
      },
    });
  });

  it("adapts JSON generated requests to relative fetch args without losing the body downstream", async () => {
    const sourceRequestInit: RequestInitWithDuplex = {
      body: JSON.stringify({ name: "widget" }),
      duplex: "half",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    };
    const sourceRequest = new Request(
      "http://contract.internal/widgets?draft=true",
      sourceRequestInit,
    );

    const [input, init] =
      await adaptGeneratedRequestForPublicFetch(sourceRequest);
    const downstreamFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const callerFetch = (
      forwardedInput: Parameters<typeof fetch>[0],
      forwardedInit?: Parameters<typeof fetch>[1],
    ) => downstreamFetch(forwardedInput, forwardedInit);

    await callerFetch(input, init);

    const [downstreamInput, downstreamInit] =
      downstreamFetch.mock.calls[0] ?? [];
    const request = new Request(
      new URL(String(downstreamInput), "http://downstream.test"),
      downstreamInit,
    );

    expect(String(downstreamInput)).toBe("/widgets?draft=true");
    expect(init?.body).toBe('{"name":"widget"}');
    expect(request.method).toBe("POST");
    expect(downstreamInit?.duplex).toBe("half");
    await expect(request.text()).resolves.toBe('{"name":"widget"}');
  });
});
