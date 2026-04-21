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
const pluginCreateTasksSkillUrl = new URL(
  "../skills/aim-create-tasks/SKILL.md",
  import.meta.url,
);
const pluginSetupGithubRepoSkillUrl = new URL(
  "../skills/aim-setup-github-repo/SKILL.md",
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
let pluginLifecycleSkillText: string;
let pluginCreateTasksSkillText: string;
let pluginSetupGithubRepoSkillText: string;
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
  pluginLifecycleSkillText = await readFile(pluginLifecycleSkillUrl, "utf8");
  pluginCreateTasksSkillText = await readFile(
    pluginCreateTasksSkillUrl,
    "utf8",
  );
  pluginSetupGithubRepoSkillText = await readFile(
    pluginSetupGithubRepoSkillUrl,
    "utf8",
  );
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
    await expect(access(pluginSkillPlaceholderUrl)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(access(pluginAgentPlaceholderUrl)).resolves.toBeUndefined();
  });

  it("ships the aim-task-lifecycle skill resource", async () => {
    await expect(access(pluginLifecycleSkillUrl)).resolves.toBeUndefined();
  });

  it("ships the aim-create-tasks skill resource", async () => {
    await expect(access(pluginCreateTasksSkillUrl)).resolves.toBeUndefined();
  });

  it("ships the aim-setup-github-repo skill resource", async () => {
    await expect(
      access(pluginSetupGithubRepoSkillUrl),
    ).resolves.toBeUndefined();
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
      "package/skills/aim-create-tasks/SKILL.md",
      "package/skills/aim-setup-github-repo/SKILL.md",
      "package/skills/aim-task-lifecycle/SKILL.md",
      "package/skills/aim-verify-task-spec/SKILL.md",
      "package/skills/using-aim/SKILL.md",
    ]);
  });

  it("packs the aim-create-tasks skill into the publishable tarball", async () => {
    await expect(listPackedFiles()).resolves.toContain(
      "package/skills/aim-create-tasks/SKILL.md",
    );
  });

  it("packs the aim-setup-github-repo skill into the publishable tarball", async () => {
    await expect(listPackedFiles()).resolves.toContain(
      "package/skills/aim-setup-github-repo/SKILL.md",
    );
  });

  it("documents lifecycle reporting as packaged documentation only", () => {
    expect(pluginSkillsReadme).not.toContain("aim-placeholder");
    expect(pluginSkillsReadme).toContain("aim-task-lifecycle");
    expect(pluginSkillsReadme).toContain("Task via HTTP PATCH");
    expect(pluginSkillsReadme).toContain("packaging and discovery boundaries");
    expect(pluginSkillsReadme).toContain("workflow automation");

    expect(pluginReadme).toContain(
      "Registers the packaged `skills/` directory",
    );
    expect(pluginReadme).toContain(
      "Ships static `skills/` and `agents/` resources",
    );
    expect(pluginReadme).toContain("aim-task-lifecycle");
    expect(pluginReadme).toContain("Does not inject bootstrap prompts");
    expect(pluginReadme).toContain("workflow automation");
  });

  it("documents aim-create-tasks as packaged documentation only", () => {
    expect(pluginSkillsReadme).toContain("aim-create-tasks");
    expect(pluginSkillsReadme).toContain("HTTP POST");
    expect(pluginSkillsReadme).toContain("packaging and discovery boundaries");

    expect(pluginReadme).toContain("aim-create-tasks");
    expect(pluginReadme).toContain("static `skills/` and `agents/` resources");
    expect(pluginReadme).toContain("Does not inject bootstrap prompts");
    expect(pluginReadme).toContain("workflow automation");
  });

  it("documents aim-setup-github-repo as packaged documentation only", () => {
    expect(pluginSkillsReadme).toContain("aim-setup-github-repo");
    expect(pluginSkillsReadme).toContain("gh");
    expect(pluginSkillsReadme).toContain("packaging and discovery boundaries");

    expect(pluginReadme).toContain("aim-setup-github-repo");
    expect(pluginReadme).toContain("static `skills/` and `agents/` resources");
    expect(pluginReadme).toContain("Does not inject bootstrap prompts");
    expect(pluginReadme).toContain("workflow automation");
  });

  it("documents lifecycle reporting rules and failure split", () => {
    expect(pluginLifecycleSkillText).toMatch(
      /`SERVER_BASE_URL` 默认为 `http:\/\/localhost:8192`。/,
    );
    expect(pluginLifecycleSkillText).toMatch(
      /PATCH \$\{SERVER_BASE_URL\}\/tasks\/\$\{task_id\}/,
    );
    expect(pluginLifecycleSkillText).toMatch(
      /只能使用 PATCH 来更新已存在 Task 的非终态事实。/,
    );
    expect(pluginLifecycleSkillText).toMatch(
      /只能使用 `POST \/resolve` 上报 `succeeded` 终态结果，且只能使用 `POST \/reject` 上报 `failed` 终态结果。/,
    );
    expect(pluginLifecycleSkillText).toMatch(
      /在非终态 PATCH 上报中，只发送受支持的 patch 字段，绝不要通过发送 `done` 来指挥 AIM。/,
    );
    expect(pluginLifecycleSkillText).toMatch(
      /终态上报的请求体必须且只能包含一个非空 `result` 字符串字段。/,
    );
    expect(pluginLifecycleSkillText).toMatch(/要把任务失败与上报失败区分开。/);
    expect(pluginLifecycleSkillText).toMatch(
      /任务失败：工作本身失败，因此应通过 `POST \/tasks\/\$\{task_id\}\/reject` 发送带非空 `result` 的终态失败上报。/,
    );
    expect(pluginLifecycleSkillText).toMatch(
      /上报失败：PATCH 请求或终态 POST 因网络、超时、连接、5xx 或意外响应等问题失败。不要把这类情况转换成任务失败。/,
    );

    for (const requiredFragment of [
      "waiting_assumptions",
      "pr_following",
      '"status": "outbound"',
      `POST /tasks/\${task_id}/resolve`,
      `POST /tasks/\${task_id}/reject`,
      "AIM 上报阻塞",
    ]) {
      expect(pluginLifecycleSkillText).toContain(requiredFragment);
    }

    expect(pluginLifecycleSkillText).not.toContain("TODO");
    expect(pluginLifecycleSkillText).not.toContain("TBD");
  });

  it("documents task creation interview, approval, and boundary rules", () => {
    expect(pluginCreateTasksSkillText).toContain(
      "起草前先做只读了解，确认最新基线、相关 AIM Task、相邻 spec 或设计文档",
    );
    expect(pluginCreateTasksSkillText).toContain(
      "每个候选都必须写完整五段式 Task Spec",
    );
    expect(pluginCreateTasksSkillText).toContain("- `Title`");
    expect(pluginCreateTasksSkillText).toContain("- `Assumptions`");
    expect(pluginCreateTasksSkillText).toContain("- `Goal vs Non-Goal`");
    expect(pluginCreateTasksSkillText).toContain("- `Core Path`");
    expect(pluginCreateTasksSkillText).toContain("- `Value Alignment`");
    expect(pluginCreateTasksSkillText).toContain("`docs/task-spec.md`");
    expect(pluginCreateTasksSkillText).toMatch(
      /POST \$\{SERVER_BASE_URL:-http:\/\/localhost:8192\}\/tasks/,
    );
    expect(pluginCreateTasksSkillText).toContain("`task_spec`");
    expect(pluginCreateTasksSkillText).toContain("`project_path`");
    expect(pluginCreateTasksSkillText).toContain("`dependencies` 只是软提示");
    expect(pluginCreateTasksSkillText).toContain(
      "只有用户明确表示批准创建，才能调用 `POST /tasks`。",
    );
    expect(pluginCreateTasksSkillText).toContain(
      "如果用户要求修改候选，回到访谈或起草步骤，重新形成候选并再次经过独立校验。",
    );
    expect(pluginCreateTasksSkillText).toContain("不要猜 `project_path`");
    expect(pluginCreateTasksSkillText).toContain(
      "不用它替代调度器决定顺序、优先级或编排。",
    );
    expect(pluginCreateTasksSkillText).toContain("`aim-verify-task-spec`");
    expect(pluginCreateTasksSkillText).toContain(
      "这道校验必须通过 SubAgent 派发完成",
    );
    expect(pluginCreateTasksSkillText).toContain(
      "`waiting_assumptions` 或 `failed` 都不得进入创建。",
    );
    expect(pluginCreateTasksSkillText).toContain(
      "应并行派发多个 SubAgent 分别校验",
    );
    expect(pluginCreateTasksSkillText).toContain("implementation plan");
    expect(pluginCreateTasksSkillText).toContain("生命周期推进");
    expect(pluginCreateTasksSkillText).not.toContain("TODO");
    expect(pluginCreateTasksSkillText).not.toContain("TBD");
  });

  it("documents GitHub repo setup workflow and blockers", () => {
    expect(pluginSetupGithubRepoSkillText).toContain(
      "gh repo view --json nameWithOwner,defaultBranchRef",
    );
    expect(pluginSetupGithubRepoSkillText).toContain("allowSquashMerge");
    expect(pluginSetupGithubRepoSkillText).toContain(
      "| `requiredLinearHistory` | `true` |",
    );
    expect(pluginSetupGithubRepoSkillText).toContain(
      "把 `pull_request` 与 `non_fast_forward` 视为默认目标 rules",
    );
    expect(pluginSetupGithubRepoSkillText).toContain("required_status_checks");
    expect(pluginSetupGithubRepoSkillText).toContain(
      "gh pr merge PR_NUMBER --auto --squash",
    );
    expect(pluginSetupGithubRepoSkillText).toContain(
      "先读 live state，再做最小修正。不要猜测仓库设置、required checks 或 PR merge 阻塞原因。",
    );
    expect(pluginSetupGithubRepoSkillText).toContain("Draft PR");
    expect(pluginSetupGithubRepoSkillText).toContain(
      "Required checks 仍在运行 / 失败",
    );
    expect(pluginSetupGithubRepoSkillText).not.toContain("TODO");
    expect(pluginSetupGithubRepoSkillText).not.toContain("TBD");
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
