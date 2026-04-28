import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

const apiPackageUrl = new URL("../package.json", import.meta.url);
const apiSourceUrl = new URL("../src/app.ts", import.meta.url);

type ApiPackageManifest = {
  name: string;
  exports: {
    ".": {
      import: string;
      require: string;
      types: string;
    };
  };
};

type ApiPackageModule = typeof import("../src/app.js");
type ContractPackageModule = typeof import("../../contract/src/index.js");

let apiPackage: ApiPackageManifest;
let apiModule: ApiPackageModule;
let contractModule: ContractPackageModule;

beforeAll(async () => {
  apiPackage = JSON.parse(
    await readFile(apiPackageUrl, "utf8"),
  ) as ApiPackageManifest;
  apiModule = (await import("../src/app.ts")) as ApiPackageModule;
  contractModule = (await import(
    "../../contract/src/index.ts"
  )) as ContractPackageModule;
});

describe("api package baseline", () => {
  it("publishes the expected api package boundary", () => {
    expect(apiPackage.name).toBe("@aim-ai/api");
    expect(apiPackage.exports["."]).toEqual({
      import: "./dist/app.mjs",
      require: "./dist/app.cjs",
      types: "./dist/app.d.mts",
    });
    expect(Object.keys(apiModule).sort()).toEqual([
      "createApp",
      "createOpenCodeSessionManager",
    ]);
  });

  it("returns a healthy response from the contract", async () => {
    const app = apiModule.createApp();

    const response = await app.request(contractModule.healthPath);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns permissive CORS headers for normal API responses", async () => {
    const app = apiModule.createApp();

    const response = await app.request(contractModule.healthPath, {
      headers: {
        origin: "https://frontend.example",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("answers CORS preflight requests with the same global policy", async () => {
    const app = apiModule.createApp();

    const response = await app.request(contractModule.healthPath, {
      method: "OPTIONS",
      headers: {
        origin: "https://frontend.example",
        "access-control-request-method": "GET",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "GET",
    );
  });

  it("keeps the health payload valid against the shared contract schema", async () => {
    const app = apiModule.createApp();

    const payload = await (await app.request(contractModule.healthPath)).json();

    expect(payload).toEqual({ status: "ok" });
    expect(contractModule.healthResponseSchema.safeParse(payload).success).toBe(
      true,
    );
  });

  it("exposes the shared OpenAPI document", async () => {
    const app = apiModule.createApp();

    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const payload = await response.json();
    const dbSqlitePathItem = payload.paths[contractModule.dbSqlitePath] as
      | {
          get?: {
            responses?: Record<
              string,
              {
                content?: {
                  "application/vnd.sqlite3"?: {
                    schema?: Record<string, unknown>;
                  };
                };
              }
            >;
          };
        }
      | undefined;
    const tasksPathItem = payload.paths[contractModule.tasksPath] as
      | {
          get?: {
            responses?: Record<string, unknown>;
          };
          post?: {
            responses?: Record<string, unknown>;
          };
        }
      | undefined;
    const taskByIdPathItem = payload.paths[contractModule.taskByIdPath] as
      | {
          get?: {
            responses?: Record<
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
          patch?: {
            responses?: Record<string, unknown>;
          };
          delete?: {
            responses?: Record<string, unknown>;
          };
        }
      | undefined;
    const taskSpecPathItem = payload.paths[contractModule.taskSpecPath] as
      | {
          get?: {
            responses?: Record<
              string,
              {
                content?: {
                  "text/markdown"?: {
                    schema?: Record<string, unknown>;
                  };
                };
              }
            >;
          };
        }
      | undefined;

    expect(payload.openapi).toBe(contractModule.openApiDocument.openapi);
    expect(payload.info).toEqual(contractModule.openApiDocument.info);
    expect(
      dbSqlitePathItem?.get?.responses?.["200"]?.content?.[
        "application/vnd.sqlite3"
      ]?.schema,
    ).toEqual({
      format: "binary",
      type: "string",
    });
    expect(payload.paths[contractModule.healthPath]).toBeDefined();
    expect(tasksPathItem?.get?.responses?.["200"]).toBeDefined();
    expect(tasksPathItem?.post?.responses?.["201"]).toBeDefined();
    expect(
      taskByIdPathItem?.get?.responses?.["200"]?.content?.["application/json"]
        ?.schema,
    ).toEqual({
      $ref: "#/components/schemas/Task",
    });
    expect(
      taskSpecPathItem?.get?.responses?.["200"]?.content?.["text/markdown"]
        ?.schema,
    ).toEqual({
      type: "string",
    });
    expect(taskByIdPathItem?.patch?.responses?.["200"]).toBeDefined();
    expect(taskByIdPathItem?.delete?.responses?.["204"]).toBeDefined();
  });

  it("does not expose a docs route from the api package", async () => {
    const app = apiModule.createApp();

    const response = await app.request("/docs");

    expect(response.status).toBe(404);
  });

  it("removes docs rendering logic from the api app boundary", async () => {
    const apiSource = await readFile(apiSourceUrl, "utf8");

    expect(apiSource).toContain(
      'import { openApiDocument } from "@aim-ai/contract";',
    );
    expect(apiSource).toContain(
      'app.get("/openapi.json", (context) => context.json(openApiDocument, 200));',
    );
    expect(apiSource).not.toContain('app.get("/docs"');
    expect(apiSource).not.toContain("renderDocsHtml");
    expect(apiSource).not.toContain(
      'new URL("./openapi.json", context.req.url).pathname',
    );
    expect(apiSource).not.toContain("SwaggerUIBundle");
    expect(apiSource).not.toContain("contract/generated");
  });
});
