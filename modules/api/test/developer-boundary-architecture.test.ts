import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const developerSource = () =>
  readFileSync(new URL("../src/developer.ts", import.meta.url), "utf8");

describe("Developer responsibility boundary architecture", () => {
  it("does not own GitHub pull request follow-up or settlement categorization", () => {
    const source = developerSource();

    expect(source).not.toContain("execGh");
    expect(source).not.toContain("PullRequestStatusProvider");
    expect(source).not.toContain("pullRequestStatusProvider");
    expect(source).not.toContain("AIM_SESSION_SETTLEMENT_PROTOCOL");
    expect(source).not.toContain("merged_but_not_resolved");
    expect(source).not.toContain("failed_checks");
    expect(source).not.toContain("review_blocked");
    expect(source).not.toContain("ready_to_merge");
  });

  it("does not gate session binding on task dependency progression", () => {
    const source = developerSource();

    expect(source).not.toContain("getTaskById");
    expect(source).not.toContain("getUnmetDependencyIds");
    expect(source).not.toContain("unresolved dependencies");
  });
});
