import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const componentsRoot = new URL(
  "../../modules/web/src/features/task-dashboard/components/",
  import.meta.url,
);

const allowedLiterals = new Set(["Enter"]);

const stringLiteralPattern =
  /(?<quote>["'`])(?<value>[A-Z][^"'`]*[a-z][^"'`]*)\k<quote>/g;

async function listTsxFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryUrl = new URL(entry.name, `${directory.href}/`);

      if (entry.isDirectory()) {
        return listTsxFiles(entryUrl);
      }

      return Promise.resolve(entry.name.endsWith(".tsx") ? [entryUrl] : []);
    }),
  );

  return files.flat();
}

describe("task dashboard i18n", () => {
  it("keeps obvious static English string literals out of dashboard components", async () => {
    const files = await listTsxFiles(componentsRoot);
    const hardCodedLiterals: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      for (const match of source.matchAll(stringLiteralPattern)) {
        const value = match.groups?.value;

        if (value && !allowedLiterals.has(value)) {
          hardCodedLiterals.push(`${file.pathname}: ${value}`);
        }
      }
    }

    expect(hardCodedLiterals).toEqual([]);
  });
});
