import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Task } from "@aim-ai/contract";

import { execGit } from "./exec-file.js";

const resolveAimHome = () => process.env.AIM_HOME ?? join(homedir(), ".aim");
const projectWorkspaceCommandCwd = process.cwd();

export const resolveProjectWorkspacePath = (projectId: string) =>
  join(resolveAimHome(), "projects", projectId);

const runGit = (args: string[], cwd = projectWorkspaceCommandCwd) =>
  execGit(cwd, args, { target: cwd });

const cloneGitOrigin = async (gitOriginUrl: string, workspacePath: string) => {
  await runGit(["clone", gitOriginUrl, workspacePath]);
};

const resolveLocalGitOriginPath = (gitOriginUrl: string) =>
  resolve(projectWorkspaceCommandCwd, gitOriginUrl);

const isLocalGitOrigin = (gitOriginUrl: string) => {
  try {
    const parsed = new URL(gitOriginUrl);
    return parsed.protocol === "file:";
  } catch {
    return existsSync(resolveLocalGitOriginPath(gitOriginUrl));
  }
};

const localGitOriginPath = (gitOriginUrl: string) => {
  try {
    const parsed = new URL(gitOriginUrl);
    return parsed.protocol === "file:" ? fileURLToPath(parsed) : gitOriginUrl;
  } catch {
    return resolveLocalGitOriginPath(gitOriginUrl);
  }
};

const resolveRealGitOrigin = async (gitOriginUrl: string) => {
  if (!isLocalGitOrigin(gitOriginUrl)) {
    return gitOriginUrl;
  }

  try {
    const realOrigin = await runGit(
      ["remote", "get-url", "origin"],
      localGitOriginPath(gitOriginUrl),
    );
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
      await runGit(["remote", "get-url", "origin"], workspacePath)
    ).trim();
  } catch {
    return;
  }

  if (currentOrigin !== gitOriginUrl) {
    await runGit(["remote", "set-url", "origin", gitOriginUrl], workspacePath);
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
