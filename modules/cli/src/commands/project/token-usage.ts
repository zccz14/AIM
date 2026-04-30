import type { ProjectTokenUsageResponse } from "@aim-ai/contract";
import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

type ProjectTokenUsageFailure = ProjectTokenUsageResponse["failures"][number];

const sanitizeFailure = (failure: ProjectTokenUsageFailure) => ({
  code: failure.code,
  root_session_id: failure.root_session_id,
  task_id: failure.task_id,
});

const toAvailability = (usage: ProjectTokenUsageResponse) => {
  if (usage.failures.length > 0) {
    return "partial";
  }

  if (usage.tasks.length === 0 && usage.sessions.length === 0) {
    return "no_usage";
  }

  return "available";
};

const toProjectTokenUsageView = (usage: ProjectTokenUsageResponse) => ({
  project_id: usage.project_id,
  availability: toAvailability(usage),
  totals: usage.totals,
  task_totals: usage.tasks.map((task) => ({
    task_id: task.task_id,
    title: task.title,
    session_id: task.session_id,
    totals: task.totals,
    failure_count: task.failures.length,
  })),
  sessions: usage.sessions.map((session) => ({
    root_session_id: session.root_session_id,
    task_id: session.task_id,
    title: session.title,
    totals: session.totals,
    failure: session.failure ? sanitizeFailure(session.failure) : null,
  })),
  failures: usage.failures.map(sanitizeFailure),
});

export default class ProjectTokenUsageCommand extends Command {
  static override description = "Get project token and cost usage";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-id": Flags.string({ description: "Project identifier" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ProjectTokenUsageCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const usage = await client.getProjectTokenUsage(
        requireFlag(flags["project-id"], "project-id"),
      );

      writeSuccess(this, toProjectTokenUsageView(usage));
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
