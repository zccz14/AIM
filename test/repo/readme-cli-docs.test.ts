import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readmeUrl = new URL("../../README.md", import.meta.url);

describe("README CLI usage docs", () => {
  it("documents existing read-only AIM query commands", async () => {
    const readme = await readFile(readmeUrl, "utf8");

    expect(readme).toContain(
      "aim dimension list --base-url http://localhost:8192 --project-id <project-id>",
    );
    expect(readme).toContain(
      "aim dimension evaluations list --base-url http://localhost:8192 --dimension-id <dimension-id>",
    );
    expect(readme).toContain(
      "aim coordinator proposal dry-run --base-url http://localhost:8192 --stdin < proposal.json",
    );
    expect(readme).toContain(
      "aim project optimizer status --base-url http://localhost:8192 --project-id <project-id>",
    );
  });
});
