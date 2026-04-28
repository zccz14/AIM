import { readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcDirectory = new URL("../src/", import.meta.url);

const listSourceFiles = async (directory: URL): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryUrl = new URL(
        `${entry.name}${entry.isDirectory() ? "/" : ""}`,
        directory,
      );

      return entry.isDirectory()
        ? listSourceFiles(entryUrl)
        : [entryUrl.pathname];
    }),
  );

  return files.flat().filter((file) => file.endsWith(".ts"));
};

describe("optimizer architecture", () => {
  it("uses heartbeat components instead of the obsolete optimizer runtime event shell", async () => {
    const sourceFiles = await listSourceFiles(srcDirectory);
    const runtimeFiles = sourceFiles.filter(
      (file) =>
        relative(srcDirectory.pathname, file) === "optimizer-runtime.ts",
    );
    const productionReferences = await Promise.all(
      sourceFiles
        .filter((file) => !runtimeFiles.includes(file))
        .map(async (file) => ({
          file,
          source: await readFile(file, "utf8"),
        })),
    );

    expect(runtimeFiles).toEqual([]);
    expect(
      productionReferences.filter(({ source }) =>
        source.includes("createOptimizerRuntime"),
      ),
    ).toEqual([]);
    expect(
      productionReferences.filter(({ source }) =>
        source.includes("onTaskResolved"),
      ),
    ).toEqual([]);
    expect(
      productionReferences.filter(({ source }) =>
        source.includes('type: "task_resolved"'),
      ),
    ).toEqual([]);
  });

  it("does not expose the obsolete shared agent session lane module", async () => {
    const sourceFiles = await listSourceFiles(srcDirectory);
    const legacyLaneFiles = sourceFiles.filter(
      (file) =>
        relative(srcDirectory.pathname, file) === "agent-session-lane.ts",
    );
    const productionReferences = await Promise.all(
      sourceFiles
        .filter((file) => !legacyLaneFiles.includes(file))
        .map(async (file) => ({
          file,
          source: await readFile(file, "utf8"),
        })),
    );

    expect(legacyLaneFiles).toEqual([]);
    expect(
      productionReferences.filter(({ source }) =>
        source.includes("agent-session-lane"),
      ),
    ).toEqual([]);
    expect(
      productionReferences.filter(({ source }) =>
        source.includes("createAgentSessionLane"),
      ),
    ).toEqual([]);
  });

  it("does not reintroduce obsolete optimizer lane state repository wiring", async () => {
    const sourceFiles = await listSourceFiles(srcDirectory);
    const obsoleteRepositoryFiles = sourceFiles.filter(
      (file) =>
        relative(srcDirectory.pathname, file) ===
        "optimizer-lane-state-repository.ts",
    );
    const productionReferences = await Promise.all(
      sourceFiles
        .filter((file) => !obsoleteRepositoryFiles.includes(file))
        .map(async (file) => ({
          file,
          source: await readFile(file, "utf8"),
        })),
    );

    expect(obsoleteRepositoryFiles).toEqual([]);
    expect(
      productionReferences.filter(({ source }) =>
        source.includes("optimizer-lane-state-repository"),
      ),
    ).toEqual([]);
    expect(
      productionReferences.filter(({ source }) =>
        source.includes("createOptimizerLaneStateRepository"),
      ),
    ).toEqual([]);
    expect(
      productionReferences.filter(({ source }) =>
        source.includes("laneStateRepository"),
      ),
    ).toEqual([]);
  });
});
