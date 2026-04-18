import { describe, expect, it, vi } from "vitest";

import { runChangesetCheck } from "../../scripts/changeset-check.mjs";

describe("changeset check", () => {
  it("passes the configured base ref through to changeset status", () => {
    const execFileSync = vi.fn((command: string, args: string[]) => {
      if (command === "git") {
        expect(args).toEqual(["diff", "--name-only", "origin/main...HEAD"]);
        return "modules/api/src/app.ts\n";
      }

      return "";
    });

    runChangesetCheck({
      cwd: "/repo",
      env: { CHANGESET_BASE_REF: "origin/main" },
      execFileSync: execFileSync as never,
      existsSync: ((path: any) =>
        path === "/repo/modules" ||
        path === "/repo/modules/api/package.json") as never,
      readFileSync: ((path: any) => {
        expect(path).toBe("/repo/modules/api/package.json");
        return JSON.stringify({ private: false });
      }) as never,
      readdirSync: (() => [{ isDirectory: () => true, name: "api" }]) as never,
      log: vi.fn(),
    });

    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      "pnpm",
      ["exec", "changeset", "status", "--since", "origin/main"],
      { stdio: "inherit" },
    );
  });

  it("skips changeset enforcement for private modules", () => {
    const execFileSync = vi.fn((command: string, args: string[]) => {
      if (command === "git") {
        expect(args).toEqual(["diff", "--name-only", "origin/main...HEAD"]);
        return "modules/web/src/main.tsx\n";
      }

      return "";
    });
    const log = vi.fn();

    runChangesetCheck({
      cwd: "/repo",
      env: { CHANGESET_BASE_REF: "origin/main" },
      execFileSync: execFileSync as never,
      existsSync: ((path: any) =>
        path === "/repo/modules" ||
        path === "/repo/modules/web/package.json") as never,
      readdirSync: (() => [{ isDirectory: () => true, name: "web" }]) as never,
      readFileSync: ((path: any) => {
        expect(path).toBe("/repo/modules/web/package.json");
        return JSON.stringify({ private: true });
      }) as never,
      log,
    });

    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "No releaseable module changes detected; skipping changeset enforcement.",
    );
  });
});
