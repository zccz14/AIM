import { type Command, execute, settings } from "@oclif/core";

import HealthCommand from "./commands/health.js";
import ServerStartCommand from "./commands/server/start.js";
import TaskCreateCommand from "./commands/task/create.js";
import TaskDeleteCommand from "./commands/task/delete.js";
import TaskGetCommand from "./commands/task/get.js";
import TaskListCommand from "./commands/task/list.js";
import TaskUpdateCommand from "./commands/task/update.js";

const taskCommandNames = new Set(["create", "list", "get", "update", "delete"]);
const serverCommandNames = new Set(["start"]);

const normalizeCommandArgs = (args: string[]) => {
  if (args[0] === "server" && serverCommandNames.has(args[1] ?? "")) {
    return [`server:${args[1]}`, ...args.slice(2)];
  }

  if (args[0] === "task" && taskCommandNames.has(args[1] ?? "")) {
    return [`task:${args[1]}`, ...args.slice(2)];
  }

  return args;
};

export const commands = {
  health: HealthCommand,
  "server:start": ServerStartCommand,
  "task:create": TaskCreateCommand,
  "task:list": TaskListCommand,
  "task:get": TaskGetCommand,
  "task:update": TaskUpdateCommand,
  "task:delete": TaskDeleteCommand,
} satisfies Record<string, Command.Class>;

export const run = async (args = process.argv.slice(2)) => {
  settings.enableAutoTranspile = false;

  return execute({
    args: normalizeCommandArgs(args),
    dir: import.meta.url,
  });
};
