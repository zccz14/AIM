import { access, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";
import { adaptGeneratedRequestForPublicFetch } from "../src/client.js";

type RequestInitWithDuplex = RequestInit & {
  duplex?: "half";
};

const contractPackageUrl = new URL("../package.json", import.meta.url);
const contractEntryUrl = new URL("../dist/index.mjs", import.meta.url);
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

type RootPackageManifest = {
  scripts: Record<string, string>;
};

type ContractPackageModule = typeof import("../src/index.js");
type ContractPackageConsumerModule = typeof import("../dist/index.mjs");
type GeneratedClientModule = typeof import("../generated/client.js");
type GeneratedTypesModule = typeof import("../generated/types.js");

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
type _generatedTypesExportTaskCrud = Assert<
  HasExport<GeneratedTypesModule, "Task"> &
    HasExport<GeneratedTypesModule, "CreateTaskRequest"> &
    HasExport<GeneratedTypesModule, "PatchTaskRequest"> &
    HasExport<GeneratedTypesModule, "TaskListResponse">
>;

let contractPackage: ContractPackageManifest;
let rootPackage: RootPackageManifest;
let contractModule: ContractPackageModule;
let generatedClientModule: GeneratedClientModule;
let playwrightConfigSource: string;
let ciWorkflowSource: string;

beforeAll(async () => {
  contractPackage = JSON.parse(
    await readFile(contractPackageUrl, "utf8"),
  ) as ContractPackageManifest;
  rootPackage = JSON.parse(
    await readFile(rootPackageUrl, "utf8"),
  ) as RootPackageManifest;
  playwrightConfigSource = await readFile(playwrightConfigUrl, "utf8");
  ciWorkflowSource = await readFile(ciWorkflowUrl, "utf8");
  contractModule = (await import(
    pathToFileURL(fileURLToPath(contractEntryUrl)).href
  )) as ContractPackageModule;
  generatedClientModule = (await import(
    "../generated/client.js"
  )) as GeneratedClientModule;
});

describe("contract package baseline", () => {
  it("publishes unified root validation entrypoints", async () => {
    await expect(access(vitestWorkspaceUrl)).resolves.toBeUndefined();
    await expect(access(playwrightConfigUrl)).resolves.toBeUndefined();
    expect(rootPackage.scripts["test:repo"]).toBe(
      "pnpm exec vitest run --config vitest.workspace.ts --project repo",
    );
    expect(rootPackage.scripts["test:type"]).toBe(
      "pnpm run typecheck && pnpm -r --if-present run test:type",
    );
    expect(rootPackage.scripts["test:lint"]).toBe(
      "pnpm run lint && pnpm -r --if-present run test:lint",
    );
    expect(rootPackage.scripts["test:smoke"]).toBe(
      "pnpm -r --if-present run test:smoke",
    );
    expect(rootPackage.scripts["test:web"]).toBe(
      "pnpm -r --if-present run test:web",
    );
    expect(rootPackage.scripts.test).toBe(
      "pnpm run test:repo && pnpm -r --workspace-concurrency=1 --if-present run test",
    );
    expect(rootPackage.scripts.smoke).toBe("pnpm run test:smoke");
    expect(rootPackage.scripts.validate).toBe(
      "pnpm run test:type && pnpm run test:lint && pnpm run test && pnpm run build && pnpm run openapi:check",
    );
    expect(rootPackage.scripts).not.toHaveProperty("test:unit");
    expect(rootPackage.scripts).not.toHaveProperty("test:integration");
    expect(rootPackage.scripts).not.toHaveProperty("test:e2e");
    expect(rootPackage.scripts).not.toHaveProperty("smoke:cli");
  });

  it("keeps a minimal browser matrix in the Playwright baseline", () => {
    expect(playwrightConfigSource).toContain('name: "chromium"');
    expect(playwrightConfigSource).toContain('name: "firefox"');
  });

  it("keeps CI wired to the package-local test entrypoints", () => {
    expect(ciWorkflowSource).toContain("run: pnpm run test:repo");
    expect(ciWorkflowSource).toContain(
      "pnpm --filter=!@aim-ai/web -r --workspace-concurrency=1 --if-present run test",
    );
    expect(ciWorkflowSource).toContain("run: pnpm smoke");
    expect(ciWorkflowSource).toContain("run: pnpm test:web");
    expect(ciWorkflowSource).not.toContain("run: pnpm test\n");
    expect(ciWorkflowSource).not.toContain(
      "pnpm test:unit && pnpm test:integration",
    );
    expect(ciWorkflowSource).not.toContain("pnpm test:e2e");
    expect(ciWorkflowSource).not.toContain("pnpm smoke:cli");
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
      "createContractClient",
      "createTaskRequestSchema",
      "healthErrorCodeSchema",
      "healthErrorSchema",
      "healthPath",
      "healthResponseSchema",
      "healthStatusSchema",
      "openApiDocument",
      "patchTaskRequestSchema",
      "taskByIdPath",
      "taskErrorCodeSchema",
      "taskErrorSchema",
      "taskListResponseSchema",
      "taskSchema",
      "taskStatusSchema",
      "tasksPath",
    ]);
    expect(
      contractModule.openApiDocument.paths[contractModule.healthPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.tasksPath],
    ).toBeDefined();
    expect(
      contractModule.openApiDocument.paths[contractModule.taskByIdPath],
    ).toBeDefined();
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

  it("exports task paths and task schemas from the built package boundary", () => {
    expect(contractModule.tasksPath).toBe("/tasks");
    expect(contractModule.taskByIdPath).toBe("/tasks/{taskId}");
    expect(contractModule.taskStatusSchema.parse("running")).toBe("running");
    expect(contractModule.taskErrorCodeSchema.parse("TASK_NOT_FOUND")).toBe(
      "TASK_NOT_FOUND",
    );
    expect(
      contractModule.createTaskRequestSchema.parse({
        task_spec: "Ship contract",
      }),
    ).toEqual({
      task_spec: "Ship contract",
    });
    expect(
      contractModule.patchTaskRequestSchema.parse({
        status: "succeeded",
      }),
    ).toEqual({
      status: "succeeded",
    });
    expect(
      contractModule.taskSchema.parse({
        task_id: "task-1",
        task_spec: "Ship contract",
        session_id: null,
        worktree_path: null,
        pull_request_url: null,
        dependencies: [],
        done: false,
        status: "running",
        created_at: "2026-04-19T00:00:00.000Z",
        updated_at: "2026-04-19T00:00:00.000Z",
      }),
    ).toMatchObject({
      task_id: "task-1",
      status: "running",
    });
    expect(
      contractModule.taskListResponseSchema.parse({
        items: [
          {
            task_id: "task-1",
            task_spec: "Ship contract",
            session_id: null,
            worktree_path: null,
            pull_request_url: null,
            dependencies: [],
            done: false,
            status: "running",
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
      contractModule.taskErrorSchema.parse({
        code: "TASK_VALIDATION_ERROR",
        message: "bad input",
      }),
    ).toEqual({
      code: "TASK_VALIDATION_ERROR",
      message: "bad input",
    });
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
    expect(tasksPathItem?.post?.responses["201"]).toBeDefined();
    expect(taskQueryParameters).toEqual(
      expect.arrayContaining([
        "#/components/parameters/TaskStatusQueryParameter",
        "#/components/parameters/TaskDoneQueryParameter",
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
    expect(taskListResponseSchema).toBeDefined();
    expect(
      contractModule.openApiDocument.components.schemas.ErrorResponse,
    ).toBeDefined();

    expect(createTaskRequestSchema).toMatchObject({
      required: ["task_spec"],
    });
    expect(
      Object.keys(
        (createTaskRequestSchema as { properties: Record<string, unknown> })
          .properties,
      ).sort(),
    ).toEqual([
      "dependencies",
      "pull_request_url",
      "session_id",
      "status",
      "task_spec",
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
      (
        createTaskRequestSchema as {
          properties: Record<string, { type?: unknown; enum?: string[] }>;
        }
      ).properties.status,
    ).toMatchObject({
      enum: [
        "created",
        "waiting_assumptions",
        "running",
        "outbound",
        "pr_following",
        "closing",
        "succeeded",
        "failed",
      ],
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

  it("moves contract package inputs to the OpenAPI generation pipeline", async () => {
    expect(rootPackage.scripts["openapi:generate"]).toBeDefined();
    expect(rootPackage.scripts["openapi:generate"]).toContain(
      "modules/contract",
    );
    expect(rootPackage.scripts["openapi:check"]).toContain("generate:check");
    expect(rootPackage.scripts["openapi:check"]).toContain("tasksPath");
    expect(rootPackage.scripts["openapi:check"]).toContain("taskByIdPath");
    expect(contractPackage.scripts?.generate).toBeDefined();
    expect(contractPackage.scripts?.build).toContain("pnpm run generate");
    expect(contractPackage.scripts?.test).toContain(
      "pnpm run build && pnpm run test:type",
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
    await expect(generatedClientModule.getTaskById).toBeTypeOf("function");
    await expect(generatedClientModule.patchTaskById).toBeTypeOf("function");
    await expect(generatedClientModule.deleteTaskById).toBeTypeOf("function");
    await expect(readFile(generatedClientUrl, "utf8")).resolves.toContain(
      'export * from "./_client/index.js";',
    );
    await expect(readFile(generatedClientSdkUrl, "utf8")).resolves.toContain(
      "listTasks",
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
      task_spec: "write spec",
      session_id: null,
      worktree_path: null,
      pull_request_url: null,
      dependencies: [],
      done: false,
      status: "created",
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
              JSON.stringify({ task_spec: "write spec", dependencies: [] })
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
            bodyText === JSON.stringify({ status: "running" })
          ) {
            return new Response(
              JSON.stringify({ ...task, status: "running" }),
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
        session_id: "session-1",
        status: "created",
      }),
    ).resolves.toEqual({
      items: [],
    });
    await expect(
      client.createTask({ task_spec: "write spec", dependencies: [] }),
    ).resolves.toMatchObject({
      task_id: "task-1",
      task_spec: "write spec",
      status: "created",
    });
    await expect(client.getTaskById("task-1")).resolves.toMatchObject({
      task_id: "task-1",
    });
    await expect(
      client.patchTaskById("task-1", { status: "running" }),
    ).resolves.toMatchObject({
      task_id: "task-1",
      status: "running",
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
          session_id: "session-1",
          status: "created",
        },
      },
      {
        body: { task_spec: "write spec", dependencies: [] },
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
        body: { status: "running" },
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

    const result = client.createTask({ task_spec: "" });

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

  it("adapts body-bearing generated requests to relative fetch args that survive downstream forwarding", async () => {
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

    const [input, init] = adaptGeneratedRequestForPublicFetch(sourceRequest);
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
    expect(request.method).toBe("POST");
    expect(downstreamInit?.duplex).toBe("half");
    await expect(request.text()).resolves.toBe('{"name":"widget"}');
  });
});
