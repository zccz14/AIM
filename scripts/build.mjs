import { spawnSync } from "node:child_process";

const fullBuildCommands = [
  ["pnpm", ["-r", "--if-present", "build"]],
  ["pnpm", ["run", "test:type:repo"]],
  ["pnpm", ["run", "test:lint:repo"]],
  ["pnpm", ["run", "test:repo"]],
  ["pnpm", ["run", "openapi:check"]],
  ["pnpm", ["run", "changeset:check"]],
];

const skipTestBuildCommands = [["pnpm", ["-r", "--if-present", "build:dist"]]];

export function getBuildCommands(env = process.env) {
  return Object.hasOwn(env, "SKIP_TEST")
    ? skipTestBuildCommands
    : fullBuildCommands;
}

export function runBuild(env = process.env) {
  for (const [command, args] of getBuildCommands(env)) {
    const result = spawnSync(command, args, { stdio: "inherit" });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBuild();
}
