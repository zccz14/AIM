import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRootPath = fileURLToPath(new URL("../../..", import.meta.url));
const cliRootPath = fileURLToPath(new URL("../", import.meta.url));
const apiRootPath = fileURLToPath(new URL("../../api/", import.meta.url));
const contractRootPath = fileURLToPath(
  new URL("../../contract/", import.meta.url),
);

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

const runCommand = async (
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<CommandResult> => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));

  const [exitCode] = (await once(child, "close")) as [number | null];

  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
};

const expectSuccessfulCommand = async (
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) => {
  const result = await runCommand(command, args, options);

  expect(result, `${command} ${args.join(" ")}`).toMatchObject({
    exitCode: 0,
  });

  return result;
};

const packPackage = async (
  packageRootPath: string,
  packDestinationPath: string,
  env: NodeJS.ProcessEnv,
) => {
  await expectSuccessfulCommand(
    "pnpm",
    ["pack", "--pack-destination", packDestinationPath],
    { cwd: packageRootPath, env },
  );

  const tarballs = await Promise.all(
    (await readdir(packDestinationPath))
      .filter((entry) => entry.endsWith(".tgz"))
      .map(async (entry) => {
        const filePath = path.join(packDestinationPath, entry);
        return { filePath, modifiedTime: (await stat(filePath)).mtimeMs };
      }),
  );

  expect(tarballs.length).toBeGreaterThan(0);

  return tarballs.sort(
    (left, right) => right.modifiedTime - left.modifiedTime,
  )[0].filePath;
};

describe("packaged global install", () => {
  it("installs the packed CLI and runs the global aim command", async () => {
    const prefixPath = await mkdtemp(
      path.join(cliRootPath, ".pack-install-test-"),
    );
    const packDestinationPath = path.join(prefixPath, "packs");
    const env = {
      npm_config_audit: "false",
      npm_config_cache: path.join(repoRootPath, ".npm-cache"),
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
    };

    try {
      await mkdir(packDestinationPath, { recursive: true });

      const contractTarballPath = await packPackage(
        contractRootPath,
        packDestinationPath,
        env,
      );
      const apiTarballPath = await packPackage(
        apiRootPath,
        packDestinationPath,
        env,
      );
      const cliTarballPath = await packPackage(
        cliRootPath,
        packDestinationPath,
        env,
      );

      await expectSuccessfulCommand(
        "npm",
        [
          "install",
          "--global",
          "--prefix",
          prefixPath,
          "--ignore-scripts",
          contractTarballPath,
          apiTarballPath,
          cliTarballPath,
        ],
        { cwd: cliRootPath, env },
      );

      const helpResult = await expectSuccessfulCommand(
        path.join(prefixPath, "bin", "aim"),
        ["--help"],
        { cwd: cliRootPath, env },
      );

      expect(helpResult.stdout).toContain("aim");
      expect(helpResult.stdout).toContain("health");
      expect(helpResult.stdout).toContain("task");
    } finally {
      await rm(prefixPath, { force: true, recursive: true });
    }
  }, 120_000);
});
