import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repoRoot = new URL("../../", import.meta.url);
const coreSkillNames = [
  "aim-ask-strategy",
  "aim-coordinator-guide",
  "aim-create-tasks",
  "aim-developer-guide",
  "aim-evaluate-readme",
  "aim-manager-guide",
  "aim-setup-github-repo",
  "aim-test-driven-development",
  "aim-verify-task-spec",
  "aim-writing-tests",
  "using-aim",
] as const;

const guardedReferencePaths = [
  "README.md",
  "pnpm-lock.yaml",
  "vitest.workspace.ts",
  ".github/workflows/release.yml",
  "test/repo/package-scripts.test.ts",
  "modules/contract/test/contract-package.test.ts",
] as const;
const obsoletePackageSlug = `${"opencode"}-${"plugin"}`;
const obsoletePackageName = `@aim-ai/${obsoletePackageSlug}`;
const obsoletePackagePath = `modules/${obsoletePackageSlug}`;

async function readRepoFile(path: string) {
  return await readFile(new URL(path, repoRoot), "utf8");
}

describe("skills distribution", () => {
  it("installs core AIM skills from repo-level agent skills", async () => {
    for (const skillName of coreSkillNames) {
      await expect(
        access(new URL(`.agents/skills/${skillName}/SKILL.md`, repoRoot)),
      ).resolves.toBeUndefined();
    }
  });

  it("keeps workspace, release, and package contracts free of plugin package references", async () => {
    const guardedSources = await Promise.all(
      guardedReferencePaths.map(async (path) => [
        path,
        await readRepoFile(path),
      ]),
    );

    expect(
      guardedSources.flatMap(([path, source]) =>
        source.includes(obsoletePackageName) ||
        source.includes(obsoletePackagePath)
          ? [path]
          : [],
      ),
    ).toEqual([]);
  });
});
