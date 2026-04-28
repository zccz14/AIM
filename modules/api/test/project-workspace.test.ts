import { mkdir, rm } from "node:fs/promises";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

const tempRoot = join(process.cwd(), ".tmp", "modules-api-project-workspace");
const aimHome = join(tempRoot, "aim-home");
const sourceRepoPath = join(tempRoot, "source-repo");
const realRemoteUrl = "git@github.com:zccz14/AIM.git";
const originalCwd = process.cwd();

const mockGit = (workspaceOrigin = sourceRepoPath) => {
  execFileMock.mockImplementation(
    (
      command: string,
      args: string[],
      optionsOrCallback:
        | { cwd?: string }
        | ((error: Error | null, stdout?: string) => void),
      maybeCallback?: (error: Error | null, stdout?: string) => void,
    ) => {
      const callback =
        typeof optionsOrCallback === "function"
          ? optionsOrCallback
          : maybeCallback;
      const options =
        typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;

      if (!callback) {
        throw new Error("missing execFile callback");
      }

      if (command !== "git") {
        callback(new Error(`unexpected command: ${command}`));
        return;
      }

      if (
        options?.cwd === sourceRepoPath &&
        args[0] === "remote" &&
        args[1] === "get-url" &&
        args[2] === "origin"
      ) {
        callback(null, `${realRemoteUrl}\n`);
        return;
      }

      if (args[0] === "clone") {
        callback(null, "");
        return;
      }

      if (
        args[0] === "remote" &&
        args[1] === "get-url" &&
        args[2] === "origin"
      ) {
        callback(null, `${workspaceOrigin}\n`);
        return;
      }

      if (
        args[0] === "remote" &&
        args[1] === "set-url" &&
        args[2] === "origin"
      ) {
        callback(null, "");
        return;
      }

      callback(new Error(`unexpected git args: ${args.join(" ")}`));
    },
  );
};

describe("project workspace", () => {
  beforeEach(async () => {
    process.env.AIM_HOME = aimHome;
    await rm(tempRoot, { force: true, recursive: true });
    await mkdir(sourceRepoPath, { recursive: true });
    execFileMock.mockReset();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    delete process.env.AIM_HOME;
    await rm(tempRoot, { force: true, recursive: true });
    execFileMock.mockReset();
  });

  it("clones local repository project origins from that repository's real remote", async () => {
    const { ensureProjectWorkspace, resolveProjectWorkspacePath } =
      await import("../src/project-workspace.js");
    mockGit();

    const workspacePath = await ensureProjectWorkspace({
      git_origin_url: sourceRepoPath,
      project_id: "project-1",
    });

    expect(workspacePath).toBe(resolveProjectWorkspacePath("project-1"));
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["clone", realRemoteUrl, workspacePath],
      { cwd: originalCwd },
      expect.any(Function),
    );
  });

  it("resolves relative local origins from the stable project workspace command cwd", async () => {
    const { ensureProjectWorkspace } = await import(
      "../src/project-workspace.js"
    );
    const otherCwd = join(tempRoot, "other-cwd");
    await mkdir(otherCwd, { recursive: true });
    process.chdir(otherCwd);
    mockGit();

    const workspacePath = await ensureProjectWorkspace({
      git_origin_url: relative(originalCwd, sourceRepoPath),
      project_id: "project-1",
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["clone", realRemoteUrl, workspacePath],
      { cwd: originalCwd },
      expect.any(Function),
    );
  });

  it("repairs existing project workspaces whose origin points at a local repository", async () => {
    const { ensureProjectWorkspace, resolveProjectWorkspacePath } =
      await import("../src/project-workspace.js");
    const workspacePath = resolveProjectWorkspacePath("project-1");
    await mkdir(workspacePath, { recursive: true });
    mockGit(sourceRepoPath);

    await ensureProjectWorkspace({
      git_origin_url: sourceRepoPath,
      project_id: "project-1",
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["remote", "set-url", "origin", realRemoteUrl],
      { cwd: workspacePath },
      expect.any(Function),
    );
  });

  it("preserves configured non-local remote origins", async () => {
    const { ensureProjectWorkspace } = await import(
      "../src/project-workspace.js"
    );
    const remoteUrl = "https://github.com/example/repo.git";
    mockGit();

    const workspacePath = await ensureProjectWorkspace({
      git_origin_url: remoteUrl,
      project_id: "project-1",
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["clone", remoteUrl, workspacePath],
      { cwd: originalCwd },
      expect.any(Function),
    );
    expect(execFileMock).not.toHaveBeenCalledWith(
      "git",
      ["remote", "get-url", "origin"],
      { cwd: sourceRepoPath },
      expect.any(Function),
    );
  });
});
