import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Task } from "@aim-ai/contract";

const resolveAimHome = () => process.env.AIM_HOME ?? join(homedir(), ".aim");

export const resolveProjectWorkspacePath = (projectId: string) =>
  join(resolveAimHome(), "projects", projectId);

const runGit = (args: string[]) =>
  new Promise<string>((resolve, reject) => {
    execFile("git", args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });

const cloneGitOrigin = async (gitOriginUrl: string, workspacePath: string) => {
  await runGit(["clone", gitOriginUrl, workspacePath]);
};

const isLocalGitOrigin = (gitOriginUrl: string) => {
  try {
    const parsed = new URL(gitOriginUrl);
    return parsed.protocol === "file:";
  } catch {
    return existsSync(gitOriginUrl);
  }
};

const localGitOriginPath = (gitOriginUrl: string) => {
  try {
    const parsed = new URL(gitOriginUrl);
    return parsed.protocol === "file:" ? fileURLToPath(parsed) : gitOriginUrl;
  } catch {
    return gitOriginUrl;
  }
};

const resolveRealGitOrigin = async (gitOriginUrl: string) => {
  if (!isLocalGitOrigin(gitOriginUrl)) {
    return gitOriginUrl;
  }

  try {
    const realOrigin = await runGit([
      "-C",
      localGitOriginPath(gitOriginUrl),
      "remote",
      "get-url",
      "origin",
    ]);
    return realOrigin.trim() || gitOriginUrl;
  } catch {
    return gitOriginUrl;
  }
};

const repairWorkspaceOrigin = async (
  workspacePath: string,
  gitOriginUrl: string,
) => {
  let currentOrigin: string;

  try {
    currentOrigin = (
      await runGit(["-C", workspacePath, "remote", "get-url", "origin"])
    ).trim();
  } catch {
    return;
  }

  if (currentOrigin !== gitOriginUrl) {
    await runGit([
      "-C",
      workspacePath,
      "remote",
      "set-url",
      "origin",
      gitOriginUrl,
    ]);
  }
};

export const ensureProjectWorkspace = async (
  task: Pick<Task, "git_origin_url" | "project_id">,
) => {
  const workspacePath = resolveProjectWorkspacePath(task.project_id);
  const gitOriginUrl = await resolveRealGitOrigin(task.git_origin_url);

  if (existsSync(workspacePath)) {
    await repairWorkspaceOrigin(workspacePath, gitOriginUrl);
    return workspacePath;
  }

  await mkdir(join(resolveAimHome(), "projects"), { recursive: true });
  await cloneGitOrigin(gitOriginUrl, workspacePath);

  return workspacePath;
};
