import { describe, expect, it } from "vitest";

import { getBuildCommands } from "../../scripts/build.mjs";

describe("build script", () => {
  it("runs the full validation build by default", () => {
    expect(getBuildCommands({})).toEqual([
      ["pnpm", ["-r", "--if-present", "build"]],
      ["pnpm", ["run", "test:type:repo"]],
      ["pnpm", ["run", "test:lint:repo"]],
      ["pnpm", ["run", "test:repo"]],
      ["pnpm", ["run", "openapi:check"]],
      ["pnpm", ["run", "changeset:check"]],
    ]);
  });

  it("runs only distributable builds when SKIP_TEST is present", () => {
    expect(getBuildCommands({ SKIP_TEST: "" })).toEqual([
      ["pnpm", ["-r", "--if-present", "build:dist"]],
    ]);
  });

  it("does not skip tests for unrelated deployment variables", () => {
    expect(getBuildCommands({ VERCEL: "1", AIM_SKIP_TESTS: "1" })).toEqual([
      ["pnpm", ["-r", "--if-present", "build"]],
      ["pnpm", ["run", "test:type:repo"]],
      ["pnpm", ["run", "test:lint:repo"]],
      ["pnpm", ["run", "test:repo"]],
      ["pnpm", ["run", "openapi:check"]],
      ["pnpm", ["run", "changeset:check"]],
    ]);
  });
});
