import { type Command, execute, settings } from "@oclif/core";

import CoordinatorProposalDryRunCommand from "./commands/coordinator/proposal/dry-run.js";
import DimensionEvaluationsListCommand from "./commands/dimension/evaluations/list.js";
import DimensionListCommand from "./commands/dimension/list.js";
import DirectorClarificationsCreateCommand from "./commands/director/clarifications/create.js";
import DirectorClarificationsListCommand from "./commands/director/clarifications/list.js";
import DirectorClarificationsStatusCommand from "./commands/director/clarifications/status.js";
import HealthCommand from "./commands/health.js";
import ProjectListCommand from "./commands/project/list.js";
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
const dimensionCommandNames = new Set(["list"]);
const dimensionEvaluationsCommandNames = new Set(["list"]);
const coordinatorProposalCommandNames = new Set(["dry-run"]);
const directorClarificationsCommandNames = new Set([
  "create",
  "list",
  "status",
]);
const projectCommandNames = new Set(["list"]);

const normalizeCommandArgs = (args: string[]) => {
  if (args[0] === "server" && serverCommandNames.has(args[1] ?? "")) {
    return [`server:${args[1]}`, ...args.slice(2)];
  }

  if (args[0] === "task" && taskCommandNames.has(args[1] ?? "")) {
    return [`task:${args[1]}`, ...args.slice(2)];
  }

  if (
    args[0] === "dimension" &&
    args[1] === "evaluations" &&
    dimensionEvaluationsCommandNames.has(args[2] ?? "")
  ) {
    return [`dimension:evaluations:${args[2]}`, ...args.slice(3)];
  }

  if (args[0] === "dimension" && dimensionCommandNames.has(args[1] ?? "")) {
    return [`dimension:${args[1]}`, ...args.slice(2)];
  }

  if (
    args[0] === "coordinator" &&
    args[1] === "proposal" &&
    coordinatorProposalCommandNames.has(args[2] ?? "")
  ) {
    return [`coordinator:proposal:${args[2]}`, ...args.slice(3)];
  }

  if (
    args[0] === "director" &&
    args[1] === "clarifications" &&
    directorClarificationsCommandNames.has(args[2] ?? "")
  ) {
    return [`director:clarifications:${args[2]}`, ...args.slice(3)];
  }

  if (args[0] === "project" && projectCommandNames.has(args[1] ?? "")) {
    return [`project:${args[1]}`, ...args.slice(2)];
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
  "coordinator:proposal:dry-run": CoordinatorProposalDryRunCommand,
  "dimension:evaluations:list": DimensionEvaluationsListCommand,
  "dimension:list": DimensionListCommand,
  "director:clarifications:create": DirectorClarificationsCreateCommand,
  "director:clarifications:list": DirectorClarificationsListCommand,
  "director:clarifications:status": DirectorClarificationsStatusCommand,
  health: HealthCommand,
  "project:list": ProjectListCommand,
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
