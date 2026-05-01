import type { ProjectOptimizerStatusResponse } from "@aim-ai/contract";
import { Command, Flags } from "@oclif/core";

import {
  createAimContractClient,
  exitWithFailure,
  requireFlag,
  writeSuccess,
} from "../../../lib/task-command.js";

type OptimizerEventLevel = "info" | "warning" | "error";

const eventLevelByEvent: Record<
  ProjectOptimizerStatusResponse["recent_events"][number]["event"],
  OptimizerEventLevel
> = {
  failure: "error",
  idle: "warning",
  noop: "info",
  start: "info",
  success: "info",
};

const laneNames = ["manager", "coordinator", "developer"] as const;

const toTokenUsageView = (status: ProjectOptimizerStatusResponse) => ({
  availability: status.token_usage.availability,
  failed_root_session_count: status.token_usage.failed_root_session_count,
  failure_summary: status.token_usage.failure_summary,
  root_session_count: status.token_usage.root_session_count,
  totals: status.token_usage.totals,
});

const toOptimizerStatusView = (status: ProjectOptimizerStatusResponse) => ({
  project_id: status.project_id,
  optimizer_enabled: status.optimizer_enabled,
  runtime_status: status.runtime_active ? "active" : "inactive",
  blocker_summary: status.blocker_summary,
  token_usage: toTokenUsageView(status),
  lane_summaries: laneNames.map((laneName) => {
    const event = status.recent_events.find(
      (recentEvent) => recentEvent.lane_name === laneName,
    );

    return {
      lane_name: laneName,
      status: event?.event ?? "unknown",
      summary: event?.summary ?? "No recent events",
      timestamp: event?.timestamp,
    };
  }),
  recent_events: status.recent_events.map((event) => ({
    lane_name: event.lane_name,
    event: event.event,
    timestamp: event.timestamp,
    level: eventLevelByEvent[event.event],
    summary: event.summary,
    task_id: event.task_id,
    session_id: event.session_id,
  })),
});

export default class ProjectOptimizerStatusCommand extends Command {
  static override description = "Get project optimizer runtime status";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "project-id": Flags.string({ description: "Project identifier" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ProjectOptimizerStatusCommand);

    try {
      const client = createAimContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const status = await client.getProjectOptimizerStatus(
        requireFlag(flags["project-id"], "project-id"),
      );

      writeSuccess(this, toOptimizerStatusView(status));
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
