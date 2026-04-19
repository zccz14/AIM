import { Command, Flags, execute, settings } from "@oclif/core";

import HealthCommand from "./commands/health.js";

const placeholderFailure = {
  ok: false,
  error: {
    code: "UNAVAILABLE",
    message: "task command not implemented",
  },
} as const;

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

class TaskCreateCommand extends Command {
  static override description = "Temporary placeholder for task create";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "task-spec": Flags.string({ description: "Task specification" }),
    dependency: Flags.string({ description: "Task dependency", multiple: true }),
    "pull-request-url": Flags.string({
      description: "Pull request URL",
      multiple: true,
    }),
  };

  public async run(): Promise<never> {
    await this.parse(TaskCreateCommand);
    writePlaceholderFailureAndExit(this);
  }
}

class TaskListCommand extends Command {
  static override description = "Temporary placeholder for task list";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    status: Flags.string({ description: "Task status" }),
    done: Flags.string({ description: "Task completion state" }),
    "session-id": Flags.string({ description: "Task session id" }),
  };

  public async run(): Promise<never> {
    await this.parse(TaskListCommand);
    writePlaceholderFailureAndExit(this);
  }
}

class TaskGetCommand extends Command {
  static override description = "Temporary placeholder for task get";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "task-id": Flags.string({ description: "Task identifier" }),
  };

  public async run(): Promise<never> {
    await this.parse(TaskGetCommand);
    writePlaceholderFailureAndExit(this);
  }
}

class TaskUpdateCommand extends Command {
  static override description = "Temporary placeholder for task update";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "task-id": Flags.string({ description: "Task identifier" }),
  };

  public async run(): Promise<never> {
    await this.parse(TaskUpdateCommand);
    writePlaceholderFailureAndExit(this);
  }
}

class TaskDeleteCommand extends Command {
  static override description = "Temporary placeholder for task delete";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "task-id": Flags.string({ description: "Task identifier" }),
  };

  public async run(): Promise<never> {
    await this.parse(TaskDeleteCommand);
    writePlaceholderFailureAndExit(this);
  }
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
