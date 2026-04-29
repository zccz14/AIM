import { type Command, execute, settings } from "@oclif/core";

import DirectorClarificationsCreateCommand from "./commands/director/clarifications/create.js";
import DirectorClarificationsListCommand from "./commands/director/clarifications/list.js";
import HealthCommand from "./commands/health.js";
import ProjectOptimizerStatusCommand from "./commands/project/optimizer/status.js";
import ServerStartCommand from "./commands/server/start.js";
import TaskCreateCommand from "./commands/task/create.js";
import TaskDeleteCommand from "./commands/task/delete.js";
import TaskGetCommand from "./commands/task/get.js";
import TaskListCommand from "./commands/task/list.js";
import TaskPrStatusCommand from "./commands/task/pr-status.js";
import TaskUpdateCommand from "./commands/task/update.js";

const taskCommandNames = new Set([
  "create",
  "list",
  "get",
  "update",
  "delete",
  "pr-status",
]);
const serverCommandNames = new Set(["start"]);
const directorClarificationsCommandNames = new Set(["create", "list"]);

const normalizeCommandArgs = (args: string[]) => {
  if (args[0] === "server" && serverCommandNames.has(args[1] ?? "")) {
    return [`server:${args[1]}`, ...args.slice(2)];
  }

  if (args[0] === "task" && taskCommandNames.has(args[1] ?? "")) {
    return [`task:${args[1]}`, ...args.slice(2)];
  }

  if (
    args[0] === "director" &&
    args[1] === "clarifications" &&
    directorClarificationsCommandNames.has(args[2] ?? "")
  ) {
    return [`director:clarifications:${args[2]}`, ...args.slice(3)];
  }

  if (
    args[0] === "project" &&
    args[1] === "optimizer" &&
    args[2] === "status"
  ) {
    return ["project:optimizer:status", ...args.slice(3)];
  }

  return args;
};

export const commands = {
  "director:clarifications:create": DirectorClarificationsCreateCommand,
  "director:clarifications:list": DirectorClarificationsListCommand,
  health: HealthCommand,
  "project:optimizer:status": ProjectOptimizerStatusCommand,
  "server:start": ServerStartCommand,
  "task:create": TaskCreateCommand,
  "task:list": TaskListCommand,
  "task:get": TaskGetCommand,
  "task:update": TaskUpdateCommand,
  "task:delete": TaskDeleteCommand,
  "task:pr-status": TaskPrStatusCommand,
} satisfies Record<string, Command.Class>;

export const run = async (args = process.argv.slice(2)) => {
  settings.enableAutoTranspile = false;

  return execute({
    args: normalizeCommandArgs(args),
    dir: import.meta.url,
  });
};
