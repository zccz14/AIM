import { execFileSync as defaultExecFileSync } from "node:child_process";
import {
  existsSync as defaultExistsSync,
  readdirSync as defaultReaddirSync,
  readFileSync as defaultReadFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

export const runChangesetCheck = ({
  cwd = process.cwd(),
  env = process.env,
  execFileSync = defaultExecFileSync,
  existsSync = defaultExistsSync,
  readFileSync = defaultReadFileSync,
  readdirSync = defaultReaddirSync,
  log = console.log,
} = {}) => {
  const baseRef = env.CHANGESET_BASE_REF ?? "origin/main";
  const modulesDir = `${cwd}/modules`;
  const packageDirs = existsSync(modulesDir)
    ? readdirSync(modulesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `modules/${entry.name}`)
        .filter((dir) => existsSync(`${cwd}/${dir}/package.json`))
        .filter((dir) => {
          const manifest = JSON.parse(
            readFileSync(`${cwd}/${dir}/package.json`, "utf8"),
          );
          return manifest.private !== true;
        })
    : [];

  const changedFiles = execFileSync(
    "git",
    ["diff", "--name-only", `${baseRef}...HEAD`],
    {
      encoding: "utf8",
    },
  )
    .split("\n")
    .filter(Boolean);

  const touchesPackageWork = packageDirs.some((dir) =>
    changedFiles.some((file) => file.startsWith(`${dir}/`)),
  );

  if (!touchesPackageWork) {
    log(
      "No releaseable module changes detected; skipping changeset enforcement.",
    );
    return;
  }

  execFileSync("pnpm", ["exec", "changeset", "status", "--since", baseRef], {
    stdio: "inherit",
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runChangesetCheck();
}
