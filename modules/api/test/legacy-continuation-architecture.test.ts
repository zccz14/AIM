import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = new URL("../src", import.meta.url);

const readSourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return readSourceFiles(path);
    }

    return path.endsWith(".ts") ? [path] : [];
  });

describe("legacy continuation architecture", () => {
  it("keeps API schedulers out of OpenCode message-state idle polling", () => {
    const files = readSourceFiles(srcRoot.pathname);
    const importingFiles = files.filter((file) =>
      readFileSync(file, "utf8").includes("classifySessionMessageState"),
    );

    expect(importingFiles).toEqual([]);
    expect(
      existsSync(new URL("../src/session-message-state.ts", import.meta.url)),
    ).toBe(false);
  });

  it("keeps task session binding owned by developer instead of the legacy scheduler", () => {
    const files = readSourceFiles(srcRoot.pathname);
    const productionReferences = files
      .filter(
        (file) =>
          !file.endsWith("/developer.ts") &&
          !file.endsWith("/optimizer-runtime.ts"),
      )
      .filter((file) => readFileSync(file, "utf8").includes("task-scheduler"));

    expect(
      existsSync(new URL("../src/task-scheduler.ts", import.meta.url)),
    ).toBe(false);
    expect(productionReferences).toEqual([]);
  });
});
