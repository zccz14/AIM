import { type Command, execute, settings } from "@oclif/core";

import HealthCommand from "./commands/health.js";
import TaskCreateCommand from "./commands/task/create.js";
import TaskDeleteCommand from "./commands/task/delete.js";
import TaskGetCommand from "./commands/task/get.js";
import TaskListCommand from "./commands/task/list.js";
import TaskUpdateCommand from "./commands/task/update.js";

export const commands = {
  health: HealthCommand,
  "task:create": TaskCreateCommand,
  "task:list": TaskListCommand,
  "task:get": TaskGetCommand,
  "task:update": TaskUpdateCommand,
  "task:delete": TaskDeleteCommand,
} satisfies Record<string, Command.Class>;

export const run = async (args = process.argv.slice(2)) => {
  settings.enableAutoTranspile = false;

  return execute({
    args,
    dir: import.meta.url,
  });
};
