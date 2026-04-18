import { type Command, execute, settings } from "@oclif/core";

import HealthCommand from "./commands/health.js";

export const commands = {
  health: HealthCommand,
} satisfies Record<string, Command.Class>;

export const run = async (args = process.argv.slice(2)) => {
  settings.enableAutoTranspile = false;

  return execute({
    args,
    dir: import.meta.url,
  });
};
