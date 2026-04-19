import { Command, Flags, execute, settings } from "@oclif/core";

import HealthCommand from "./commands/health.js";

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

class TaskCreateCommand extends TaskPlaceholderCommand {
  static override description = "Temporary placeholder for task create";

  static override flags = {
    "base-url": baseUrlFlag,
    "task-spec": Flags.string({ description: "Task specification" }),
    dependency: Flags.string({ description: "Task dependency", multiple: true }),
    "pull-request-url": Flags.string({
      description: "Pull request URL",
      multiple: true,
    }),
  };
}

class TaskListCommand extends TaskPlaceholderCommand {
  static override description = "Temporary placeholder for task list";

  static override flags = {
    "base-url": baseUrlFlag,
    status: Flags.string({ description: "Task status" }),
    done: Flags.string({ description: "Task completion state" }),
    "session-id": Flags.string({ description: "Task session id" }),
  };
}

class TaskGetCommand extends TaskPlaceholderCommand {
  static override description = "Temporary placeholder for task get";

  static override flags = {
    "base-url": baseUrlFlag,
    "task-id": taskIdFlag,
  };
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
