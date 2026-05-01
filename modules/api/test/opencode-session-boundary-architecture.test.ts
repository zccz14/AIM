import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = new URL("../src", import.meta.url);

const allowedSessionLifecycleBoundaries = new Set([
  "opencode-session-manager.ts",
]);

const sessionLifecycleCallPattern =
  /\.session\.(create|promptAsync|abort|delete|remove)\b/g;

const readSourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return readSourceFiles(path);
    }

    return path.endsWith(".ts") ? [path] : [];
  });

describe("OpenCode session lifecycle architecture", () => {
  it("does not keep the legacy bare OpenCode session helper", () => {
    const sourceFiles = readSourceFiles(srcRoot.pathname).map((file) =>
      relative(srcRoot.pathname, file),
    );

    expect(sourceFiles).not.toContain("opencode/create-bare-session.ts");
  });

  it("keeps direct OpenCode session lifecycle API calls inside the manager boundary", () => {
    const violations = readSourceFiles(srcRoot.pathname)
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const relativePath = relative(srcRoot.pathname, file);

        if (allowedSessionLifecycleBoundaries.has(relativePath)) {
          return [];
        }

        return [...source.matchAll(sessionLifecycleCallPattern)].map(
          (match) => `${relativePath}: .session.${match[1]}`,
        );
      })
      .sort();

    expect(violations).toEqual([]);
  });
});
