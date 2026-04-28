import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

describe("exec file helper", () => {
  afterEach(() => {
    execFileMock.mockReset();
  });

  it("returns stdout and applies cwd, timeout, and signal boundaries", async () => {
    const signal = new AbortController().signal;
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => callback(null, "abc123\n", ""),
    );
    const { execGit } = await import("../src/exec-file.js");

    await expect(
      execGit("/repo/project", ["rev-parse", "origin/main"], {
        signal,
        timeoutMs: 1234,
      }),
    ).resolves.toBe("abc123\n");

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "origin/main"],
      {
        cwd: "/repo/project",
        encoding: "utf8",
        signal,
        timeout: 1234,
      },
      expect.any(Function),
    );
  });

  it("returns actionable non-zero exit errors without leaking secrets", async () => {
    const error = Object.assign(new Error("remote token=secret123"), {
      code: 128,
    });
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error, stdout: string, stderr: string) => void,
      ) =>
        callback(
          error,
          "",
          "fatal: https://user:pass@example.test/repo.git ghp_1234567890abcdefghijklmnopqrstuvwxyz",
        ),
    );
    const { execGit } = await import("../src/exec-file.js");

    await expect(
      execGit(
        "/repo/project",
        ["clone", "https://user:pass@example.test/repo.git", "/repo/project"],
        {
          target: "/repo/project",
        },
      ),
    ).rejects.toThrow(
      "External command failed: git clone https://[REDACTED]@example.test/repo.git /repo/project in /repo/project.",
    );
    await expect(
      execGit(
        "/repo/project",
        ["clone", "https://user:pass@example.test/repo.git", "/repo/project"],
        {
          target: "/repo/project",
        },
      ),
    ).rejects.not.toThrow(/secret123|user:pass|ghp_1234567890/);
  });

  it("returns actionable timeout errors", async () => {
    const error = Object.assign(new Error("spawn timed out"), {
      killed: true,
      signal: "SIGTERM",
    });
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error, stdout: string, stderr: string) => void,
      ) => callback(error, "", ""),
    );
    const { execGh } = await import("../src/exec-file.js");

    await expect(
      execGh(["pr", "view", "https://github.com/example/repo/pull/42"], {
        target: "https://github.com/example/repo/pull/42",
        timeoutMs: 50,
      }),
    ).rejects.toThrow(
      "External command timed out after 50ms: gh pr view https://github.com/example/repo/pull/42.",
    );
  });
});
