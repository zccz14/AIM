import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const packageJsonPaths = [
  "package.json",
  "modules/api/package.json",
  "modules/cli/package.json",
  "modules/contract/package.json",
  "modules/web/package.json",
];

async function readPackageJson(path: string) {
  return JSON.parse(
    await readFile(new URL(`../../${path}`, import.meta.url), "utf8"),
  ) as {
    scripts?: Record<string, string>;
  };
}

describe("package scripts", () => {
  it("keeps root build orchestration on the normal validation path", async () => {
    const packageJson = await readPackageJson("package.json");

    expect(packageJson.scripts?.build).toBe(
      "pnpm -r --if-present build && pnpm run test:type:repo && pnpm run test:lint:repo && pnpm run test:repo && pnpm --filter ./modules/contract run openapi:check && pnpm run test:changeset",
    );
  });

  it("keeps pruned root validation aliases out of the public script contract", async () => {
    const packageJson = await readPackageJson("package.json");
    const contractPackageJson = await readPackageJson(
      "modules/contract/package.json",
    );

    expect(packageJson.scripts).not.toHaveProperty("openapi:generate");
    expect(packageJson.scripts).not.toHaveProperty("openapi:check");
    expect(packageJson.scripts).not.toHaveProperty("release:check");
    expect(packageJson.scripts).not.toHaveProperty("smoke");
    expect(packageJson.scripts).not.toHaveProperty("validate");
    expect(contractPackageJson.scripts?.["openapi:check"]).toContain(
      "generate:check",
    );
  });

  it("publishes the changeset check as a skippable test script", async () => {
    const packageJson = await readPackageJson("package.json");

    expect(packageJson.scripts).not.toHaveProperty("changeset:check");
    expect(packageJson.scripts?.["test:changeset"]).toBe(
      '[ -n "$SKIP_TEST" ] || node ./scripts/changeset-check.mjs',
    );
  });

  it("makes every test script skip successfully when SKIP_TEST is non-empty", async () => {
    const unguardedTestScripts: string[] = [];

    for (const packageJsonPath of packageJsonPaths) {
      const packageJson = await readPackageJson(packageJsonPath);

      for (const [scriptName, scriptCommand] of Object.entries(
        packageJson.scripts ?? {},
      )) {
        if (
          scriptName.startsWith("test:") &&
          !scriptCommand.startsWith('[ -n "$SKIP_TEST" ] || ')
        ) {
          unguardedTestScripts.push(`${packageJsonPath} ${scriptName}`);
        }
      }
    }

    expect(unguardedTestScripts).toEqual([]);
  });
});
