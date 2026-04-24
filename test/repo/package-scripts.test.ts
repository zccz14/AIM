import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const packageJsonPaths = [
  "package.json",
  "modules/api/package.json",
  "modules/cli/package.json",
  "modules/contract/package.json",
  "modules/opencode-plugin/package.json",
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
      "pnpm -r --if-present build && pnpm run test:type:repo && pnpm run test:lint:repo && pnpm run test:repo && pnpm run openapi:check && pnpm run changeset:check",
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
