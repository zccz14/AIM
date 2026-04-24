import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const cliPackageUrl = new URL("../package.json", import.meta.url);
const cliBinUrl = new URL("../bin/dev.js", import.meta.url);
const cliCommandSourceUrl = new URL(
  "../src/commands/health.ts",
  import.meta.url,
);

const getImportSpecifiers = (source: string) =>
  [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
    ([, specifier]) => specifier,
  );

describe("cli package baseline", () => {
  it("publishes the expected cli package manifest", async () => {
    const cliPackage = JSON.parse(await readFile(cliPackageUrl, "utf8")) as {
      name: string;
      bin: Record<string, string>;
      oclif?: {
        bin?: string;
        commands?: {
          identifier?: string;
          strategy?: string;
          target?: string;
        };
      };
    };

    expect(cliPackage.name).toBe("@aim-ai/cli");
    expect(cliPackage.bin).toEqual({
      aim: "bin/dev.js",
    });
    expect(cliPackage.oclif).toEqual({
      bin: "aim",
      commands: {
        identifier: "commands",
        strategy: "explicit",
        target: "./dist/index.mjs",
      },
    });
  });

  it("boots the published bin from built runtime instead of repo-only dev sources", async () => {
    const binSource = await readFile(cliBinUrl, "utf8");

    expect(binSource).toContain("../dist/index.mjs");
    expect(binSource).not.toContain("../src/index.ts");
    expect(binSource).not.toContain("tsx");
  });

  it("keeps the CLI on the contract root boundary", async () => {
    const commandSource = await readFile(cliCommandSourceUrl, "utf8");
    const importSpecifiers = getImportSpecifiers(commandSource);

    expect(importSpecifiers).toContain("@aim-ai/contract");
    expect(
      importSpecifiers.some((specifier) =>
        specifier.includes("contract/generated"),
      ),
    ).toBe(false);
    expect(commandSource).toContain("createContractClient({");
    expect(commandSource).not.toContain("createContractClient({ baseUrl:");
  });
});
