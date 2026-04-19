import type { PatchTaskRequest } from "@aim-ai/contract";
import { Command, Flags } from "@oclif/core";

import {
  assertNoConflict,
  createTaskContractClient,
  exitWithFailure,
  hasOwnPatchField,
  parseStatusFlag,
  pickLastValue,
  requireFlag,
  writeSuccess,
} from "../../lib/task-command.js";

export default class TaskUpdateCommand extends Command {
  static override description = "Update a task via the shared contract client";

  static override flags = {
    "base-url": Flags.string({ description: "API base URL" }),
    "task-id": Flags.string({ description: "Task identifier" }),
    "task-spec": Flags.string({ description: "Task spec string" }),
    "session-id": Flags.string({ description: "Task session id" }),
    "worktree-path": Flags.string({ description: "Task worktree path" }),
    "pull-request-url": Flags.string({
      description: "Pull request URL",
      multiple: true,
    }),
    dependency: Flags.string({
      description: "Task dependency id",
      multiple: true,
    }),
    status: Flags.string({ description: "Task status" }),
    "clear-session-id": Flags.boolean({ description: "Clear task session id" }),
    "clear-worktree-path": Flags.boolean({
      description: "Clear task worktree path",
    }),
    "clear-pull-request-url": Flags.boolean({
      description: "Clear pull request URL",
    }),
    "clear-dependencies": Flags.boolean({ description: "Clear dependencies" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TaskUpdateCommand);

    try {
      const client = createTaskContractClient(
        requireFlag(flags["base-url"], "base-url"),
      );
      const taskId = requireFlag(flags["task-id"], "task-id");
      const patch: PatchTaskRequest = {};

      assertNoConflict(
        flags["session-id"],
        flags["clear-session-id"] ?? false,
        "session-id",
        "clear-session-id",
      );
      assertNoConflict(
        flags["worktree-path"],
        flags["clear-worktree-path"] ?? false,
        "worktree-path",
        "clear-worktree-path",
      );
      assertNoConflict(
        flags["pull-request-url"]?.length,
        flags["clear-pull-request-url"] ?? false,
        "pull-request-url",
        "clear-pull-request-url",
      );
      assertNoConflict(
        flags.dependency?.length,
        flags["clear-dependencies"] ?? false,
        "dependency",
        "clear-dependencies",
      );

      if (flags["task-spec"] !== undefined) {
        patch.task_spec = flags["task-spec"];
      }

      if (flags.status !== undefined) {
        patch.status = parseStatusFlag(flags.status);
      }

      if (flags["session-id"] !== undefined) {
        patch.session_id = flags["session-id"];
      }

      if (flags["clear-session-id"]) {
        patch.session_id = null;
      }

      if (flags["worktree-path"] !== undefined) {
        patch.worktree_path = flags["worktree-path"];
      }

      if (flags["clear-worktree-path"]) {
        patch.worktree_path = null;
      }

      if (flags["pull-request-url"]?.length) {
        patch.pull_request_url = pickLastValue(flags["pull-request-url"]);
      }

      if (flags["clear-pull-request-url"]) {
        patch.pull_request_url = null;
      }

      if (flags.dependency?.length) {
        patch.dependencies = flags.dependency;
      }

      if (flags["clear-dependencies"]) {
        patch.dependencies = [];
      }

      if (!hasOwnPatchField(patch)) {
        throw {
          code: "CLI_USAGE_ERROR",
          message: "task update requires at least one patch flag",
        };
      }

      const task = await client.patchTaskById(taskId, patch);
      writeSuccess(this, task);
    } catch (error) {
      exitWithFailure(this, error);
    }
  }
}
