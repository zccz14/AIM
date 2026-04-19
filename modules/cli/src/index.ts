import { Command, Flags, execute, settings } from "@oclif/core";

import HealthCommand from "./commands/health.js";
import TaskCreateCommand from "./commands/task/create.js";
import TaskGetCommand from "./commands/task/get.js";
import TaskListCommand from "./commands/task/list.js";

const placeholderFailure = {
  ok: false,
  error: {
    code: "UNAVAILABLE",
    message: "task command not implemented",
  },
} as const;

const baseUrlFlag = Flags.string({ description: "API base URL" });

const taskIdFlag = Flags.string({ description: "Task identifier" });

const taskCommandNames = new Set([
  "create",
  "list",
  "get",
  "update",
  "delete",
]);

const normalizeCommandArgs = (args: string[]) => {
  if (args[0] === "task" && taskCommandNames.has(args[1] ?? "")) {
    return [`task:${args[1]}`, ...args.slice(2)];
  }

  return args;
};

const writePlaceholderFailureAndExit = (command: Command) => {
  process.stderr.write(`${JSON.stringify(placeholderFailure)}\n`);
  command.exit(1);
};

class TaskPlaceholderCommand extends Command {
  public async run(): Promise<void> {
    writePlaceholderFailureAndExit(this);
  }
}

class TaskUpdateCommand extends TaskPlaceholderCommand {
  static override description = "Temporary placeholder for task update";

  static override flags = {
    "base-url": baseUrlFlag,
    "task-id": taskIdFlag,
  };
}

class TaskDeleteCommand extends TaskPlaceholderCommand {
  static override description = "Temporary placeholder for task delete";

  static override flags = {
    "base-url": baseUrlFlag,
    "task-id": taskIdFlag,
  };
}

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
    args: normalizeCommandArgs(args),
    dir: import.meta.url,
  });
};
