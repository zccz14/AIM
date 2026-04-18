import type { TaskRecord } from "./database.js";

const buildCodeFence = (value: string) => {
  const backtickRuns = value.match(/`+/g) ?? [];
  const longestRun = backtickRuns.reduce(
    (max, run) => Math.max(max, run.length),
    0,
  );

  return "`".repeat(Math.max(3, longestRun + 1));
};

const formatTaskSnapshot = (task: TaskRecord) =>
  [
    `task_id: ${task.task_id}`,
    "task_spec:",
    `${buildCodeFence(task.task_spec)}text`,
    task.task_spec,
    buildCodeFence(task.task_spec),
    `status: ${task.status ?? "unknown"}`,
    `worktree_path: ${task.worktree_path ?? "not set"}`,
    `pull_request_url: ${task.pull_request_url ?? "not set"}`,
  ].join("\n");

export const buildInitialTaskPrompt = (task: TaskRecord) =>
  [
    "你正在处理一条已绑定的 Task。",
    "请根据下面的任务快照开始推进当前任务：",
    formatTaskSnapshot(task),
  ].join("\n\n");

export const buildFollowUpTaskPrompt = (task: TaskRecord) =>
  [
    "继续推进当前 Task。",
    "以下是当前任务快照：",
    formatTaskSnapshot(task),
  ].join("\n\n");

export type PromptBuilder = {
  buildInitialTaskPrompt(task: TaskRecord): string;
  buildFollowUpTaskPrompt(task: TaskRecord): string;
};

export const createPromptBuilder = (): PromptBuilder => ({
  buildInitialTaskPrompt,
  buildFollowUpTaskPrompt,
});
