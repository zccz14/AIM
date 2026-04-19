import { Command, Flags } from "@oclif/core";

import {
  createTaskContractClient,
  exitWithFailure,
  parseBooleanFlag,
  parseStatusFlag,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class TaskListCommand extends Command {
  static override description = "List tasks via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    status: Flags.string({ description: "Task status" }),
    done: Flags.string({ description: "Task completion state" }),
    "session-id": Flags.string({ description: "Task session id" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskListCommand);

    try {
      const client = createTaskContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const tasks = await client.listTasks({
        status: parseStatusFlag(flags.status),
        done: parseBooleanFlag(flags.done),
        session_id: flags["session-id"],
      });

      writeSuccess(this, tasks);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
