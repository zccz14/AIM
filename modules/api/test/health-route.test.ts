import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const apiPackageUrl = new URL("../package.json", import.meta.url);
const apiEntryUrl = new URL("../dist/app.mjs", import.meta.url);
const contractEntryUrl = new URL(
  "../../contract/dist/index.mjs",
  import.meta.url,
);
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
  apiModule = (await import(
    pathToFileURL(fileURLToPath(apiEntryUrl)).href
  )) as ApiPackageModule;
  contractModule = (await import(
    pathToFileURL(fileURLToPath(contractEntryUrl)).href
  )) as ContractPackageModule;
});

describe("api package baseline", () => {
  it("publishes the expected api package boundary", () => {
    expect(apiPackage.name).toBe("@cz-stack/api");
    expect(apiPackage.exports["."]).toEqual({
      import: "./dist/app.mjs",
      require: "./dist/app.cjs",
      types: "./dist/app.d.mts",
    });
    expect(Object.keys(apiModule).sort()).toEqual(["createApp"]);
  });

  it("returns a healthy response from the contract", async () => {
    const app = apiModule.createApp();

    const response = await app.request(contractModule.healthPath);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
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

    const payload = await response.json();

    expect(payload).toEqual(contractModule.openApiDocument);
    expect(payload.paths[contractModule.healthPath]).toEqual(
      contractModule.openApiDocument.paths[contractModule.healthPath],
    );
  });

  it("does not expose a docs route from the api package", async () => {
    const app = apiModule.createApp();

    const response = await app.request("/docs");

    expect(response.status).toBe(404);
  });

  it("removes docs rendering logic from the api app boundary", async () => {
    const apiSource = await readFile(apiSourceUrl, "utf8");

    expect(apiSource).toContain(
      'import { openApiDocument } from "@cz-stack/contract";',
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
