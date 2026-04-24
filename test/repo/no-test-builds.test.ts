import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = new URL("../../", import.meta.url);
const ignoredDirectories = new Set([
  ".git",
  ".worktrees",
  "node_modules",
  "dist",
]);

const isTestFile = (path: string) =>
  /(^|\/)test\//.test(path) || /(?:^|[.-])test\.[cm]?[tj]sx?$/.test(path);

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) {
          return [];
        }

        return listFiles(join(directory, entry.name));
      }

      if (!entry.isFile()) {
        return [];
      }

      return [join(directory, entry.name)];
    }),
  );

  return files.flat();
}

describe("test code build isolation", () => {
  it("does not invoke package builds from tests or test helpers", async () => {
    const rootPath = fileURLToPath(repoRoot);
    const testFiles = (await listFiles(rootPath)).filter((filePath) =>
      isTestFile(relative(rootPath, filePath)),
    );
    const forbiddenPatterns = [
      /spawn\(\s*["']pnpm["'][\s\S]{0,200}["']build(?::dist)?["']/,
      /execFile(?:Async)?\(\s*["']pnpm["'][\s\S]{0,200}["']build(?::dist)?["']/,
      /exec(?:Sync)?\(\s*["'`]pnpm\s+[\s\S]{0,200}build(?::dist)?/,
    ];

    const offenders = (
      await Promise.all(
        testFiles.map(async (filePath) => {
          const source = await readFile(filePath, "utf8");

          return forbiddenPatterns.some((pattern) => pattern.test(source))
            ? relative(rootPath, filePath)
            : undefined;
        }),
      )
    ).filter((filePath): filePath is string => filePath !== undefined);

    expect(offenders).toEqual([]);
  });
});
