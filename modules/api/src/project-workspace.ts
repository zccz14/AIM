import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Task } from "@aim-ai/contract";

const resolveAimHome = () => process.env.AIM_HOME ?? join(homedir(), ".aim");

export const resolveProjectWorkspacePath = (projectId: string) =>
  join(resolveAimHome(), "projects", projectId);

const cloneGitOrigin = (gitOriginUrl: string, workspacePath: string) =>
  new Promise<void>((resolve, reject) => {
    execFile("git", ["clone", gitOriginUrl, workspacePath], (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

export const ensureProjectWorkspace = async (
  task: Pick<Task, "git_origin_url" | "project_id">,
) => {
  const workspacePath = resolveProjectWorkspacePath(task.project_id);

  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  await mkdir(join(resolveAimHome(), "projects"), { recursive: true });
  await cloneGitOrigin(task.git_origin_url, workspacePath);

  return workspacePath;
};
