import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { Config, PluginInput } from "@opencode-ai/plugin";
import { beforeAll, describe, expect, it } from "vitest";

const pluginPackageUrl = new URL("../package.json", import.meta.url);
const pluginEntryUrl = new URL("../dist/index.js", import.meta.url);
const pluginSourceUrl = new URL("../src/index.ts", import.meta.url);
const pluginSkillPlaceholderUrl = new URL(
  "../skills/aim-placeholder/SKILL.md",
  import.meta.url,
);
const pluginLifecycleSkillUrl = new URL(
  "../skills/aim-task-lifecycle/SKILL.md",
  import.meta.url,
);
const pluginSkillsReadmeUrl = new URL("../skills/README.md", import.meta.url);
const pluginReadmeUrl = new URL("../README.md", import.meta.url);
const pluginAgentPlaceholderUrl = new URL(
  "../agents/aim-placeholder.md",
  import.meta.url,
);

type PluginPackageManifest = {
  name: string;
  main: string;
  files: string[];
  private?: boolean;
};

type ConfigWithSkills = Config & {
  skills?: {
    paths?: string[];
  };
};

let pluginPackage: PluginPackageManifest;
let pluginModule: { default: { id?: string; server: unknown } };
let pluginSource: string;
let pluginSkillsReadme: string;
let pluginReadme: string;
let packedFilesPromise: Promise<string[]> | undefined;
const packagedSkillsPath = fileURLToPath(new URL("../skills/", pluginEntryUrl));
const artifactsDirUrl = new URL("../.artifacts/test-pack/", import.meta.url);
const execFileAsync = promisify(execFile);

async function listPackedFiles() {
  if (packedFilesPromise) {
    return packedFilesPromise;
  }

  packedFilesPromise = (async () => {
    await rm(artifactsDirUrl, { force: true, recursive: true });
    await mkdir(artifactsDirUrl, { recursive: true });

    await execFileAsync(
      "pnpm",
      ["pack", "--pack-destination", fileURLToPath(artifactsDirUrl)],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
      },
    );

    const [tarballName] = await readdir(artifactsDirUrl);

    if (!tarballName) {
      throw new Error("pnpm pack did not create a tarball");
    }

    const tarballPath = fileURLToPath(new URL(tarballName, artifactsDirUrl));
    const { stdout } = await execFileAsync("tar", ["-tf", tarballPath]);

    return stdout
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .sort();
  })();

  return packedFilesPromise;
}

async function loadPluginHooks() {
  return (
    pluginModule.default.server as (input: PluginInput) => Promise<{
      config?: (input: Config) => Promise<void>;
      event?: unknown;
      tool?: unknown;
      auth?: unknown;
      provider?: unknown;
      "chat.message"?: unknown;
      "chat.params"?: unknown;
      "chat.headers"?: unknown;
    }>
  )({} as PluginInput);
}

beforeAll(async () => {
  pluginPackage = JSON.parse(
    await readFile(pluginPackageUrl, "utf8"),
  ) as PluginPackageManifest;
  pluginSource = await readFile(pluginSourceUrl, "utf8");
  pluginSkillsReadme = await readFile(pluginSkillsReadmeUrl, "utf8");
  pluginReadme = await readFile(pluginReadmeUrl, "utf8");
  pluginModule = (await import(
    pathToFileURL(fileURLToPath(pluginEntryUrl)).href
  )) as { default: { id?: string; server: unknown } };
});

describe("opencode plugin package baseline", () => {
  it("publishes the expected package manifest", () => {
    expect(pluginPackage.name).toBe("@aim-ai/opencode-plugin");
    expect(pluginPackage.main).toBe("./dist/index.js");
    expect(pluginPackage.private).not.toBe(true);
    expect(pluginPackage.files).toEqual([
      "dist",
      "skills",
      "agents",
      "README.md",
    ]);
  });

  it("ships placeholder skills and agents resources", async () => {
    await expect(access(pluginSkillPlaceholderUrl)).resolves.toBeUndefined();
    await expect(access(pluginAgentPlaceholderUrl)).resolves.toBeUndefined();
  });

  it("ships the aim-task-lifecycle skill resource", async () => {
    await expect(access(pluginLifecycleSkillUrl)).resolves.toBeUndefined();
  });

  it("packs the expected publishable tarball contents", async () => {
    await expect(listPackedFiles()).resolves.toEqual([
      "package/LICENSE",
      "package/README.md",
      "package/agents/README.md",
      "package/agents/aim-placeholder.md",
      "package/dist/index.d.ts",
      "package/dist/index.d.ts.map",
      "package/dist/index.js",
      "package/dist/index.js.map",
      "package/package.json",
      "package/skills/README.md",
      "package/skills/aim-placeholder/SKILL.md",
      "package/skills/aim-task-lifecycle/SKILL.md",
    ]);
  });

  it("documents lifecycle reporting as packaged documentation only", () => {
    expect(pluginSkillsReadme).toContain("aim-task-lifecycle");
    expect(pluginSkillsReadme).toContain("Task via HTTP PATCH");
    expect(pluginSkillsReadme).toContain("packaging and discovery boundaries");
    expect(pluginSkillsReadme).toContain("workflow automation");

    expect(pluginReadme).toContain("Registers the packaged `skills/` directory");
    expect(pluginReadme).toContain("Ships static `skills/` and `agents/` resources");
    expect(pluginReadme).toContain("aim-task-lifecycle");
    expect(pluginReadme).toContain("Does not inject bootstrap prompts");
    expect(pluginReadme).toContain("workflow automation");
  });

  it("exports a default plugin module from the built entry", () => {
    expect(pluginModule.default.id).toBe("@aim-ai/opencode-plugin");
    expect(typeof pluginModule.default.server).toBe("function");
  });

  it("appends the packaged skills path without overwriting existing entries", async () => {
    const hooks = await loadPluginHooks();
    const config: ConfigWithSkills = {
      skills: {
        paths: ["/tmp/existing-skills"],
      },
    };

    await hooks.config?.(config);

    expect(config.skills?.paths).toEqual([
      "/tmp/existing-skills",
      packagedSkillsPath,
    ]);
  });

  it("creates skills config when it is initially missing", async () => {
    const hooks = await loadPluginHooks();
    const config: ConfigWithSkills = {};

    await hooks.config?.(config);

    expect(config.skills?.paths).toEqual([packagedSkillsPath]);
  });

  it("dedupes the packaged skills path when it is already configured", async () => {
    const hooks = await loadPluginHooks();
    const config: ConfigWithSkills = {
      skills: {
        paths: [packagedSkillsPath],
      },
    };

    await hooks.config?.(config);

    expect(config.skills?.paths).toEqual([packagedSkillsPath]);
  });

  it("keeps the packaged skills path deduped across repeated config hook calls", async () => {
    const hooks = await loadPluginHooks();
    const config: ConfigWithSkills = {
      skills: {
        paths: ["/tmp/existing-skills"],
      },
    };

    await hooks.config?.(config);
    await hooks.config?.(config);

    expect(config.skills?.paths).toEqual([
      "/tmp/existing-skills",
      packagedSkillsPath,
    ]);
  });

  it("only registers the config hook for packaged skills", async () => {
    const hooks = await loadPluginHooks();

    expect(typeof hooks.config).toBe("function");
    expect(hooks.event).toBeUndefined();
    expect(hooks.tool).toBeUndefined();
    expect(hooks.auth).toBeUndefined();
    expect(hooks.provider).toBeUndefined();
    expect(hooks["chat.message"]).toBeUndefined();
    expect(hooks["chat.params"]).toBeUndefined();
    expect(hooks["chat.headers"]).toBeUndefined();
  });

  it("does not introduce source-level non-goal hooks", () => {
    expect(pluginSource).not.toContain("experimental.chat.system.transform");
    expect(pluginSource).not.toContain("experimental.session.compacting");
    expect(pluginSource).not.toContain("chat.message");
  });
});
