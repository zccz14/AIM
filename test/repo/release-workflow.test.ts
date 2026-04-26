import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readReleaseWorkflow() {
  return await readFile(
    new URL("../../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
}

describe("release workflow", () => {
  it("deploys the Pages artifact produced by release readiness", async () => {
    const workflow = await readReleaseWorkflow();

    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("name: github-pages-dist");
    expect(workflow).toContain("path: modules/web/dist");
    expect(workflow).toContain("actions/download-artifact@v4");
    expect(workflow).toContain("path: ./pages-dist");
    expect(workflow).not.toContain("Build Pages artifact");
    expect(workflow).not.toContain("pnpm --filter @aim-ai/web run build:dist");
  });

  it("keeps Pages deployment independent from changesets release prep", async () => {
    const workflow = await readReleaseWorkflow();

    const deployPagesJob = workflow.slice(workflow.indexOf("  deploy-pages:"));

    expect(deployPagesJob).toContain("      - release-check");
    expect(deployPagesJob).not.toContain("version-or-prepare-release");
  });
});
