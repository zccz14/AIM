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
const pluginDeveloperGuideSkillUrl = new URL(
  "../skills/aim-developer-guide/SKILL.md",
  import.meta.url,
);
const pluginCreateTasksSkillUrl = new URL(
  "../skills/aim-create-tasks/SKILL.md",
  import.meta.url,
);
const pluginCoordinatorGuideSkillUrl = new URL(
  "../skills/aim-coordinator-guide/SKILL.md",
  import.meta.url,
);
const managerEvaluationSignalDocUrl = new URL(
  "../../../docs/manager-evaluation-signal.md",
  import.meta.url,
);
const pluginSetupGithubRepoSkillUrl = new URL(
  "../skills/aim-setup-github-repo/SKILL.md",
  import.meta.url,
);
const pluginEvaluateReadmeSkillUrl = new URL(
  "../skills/aim-evaluate-readme/SKILL.md",
  import.meta.url,
);
const pluginManagerGuideSkillUrl = new URL(
  "../skills/aim-manager-guide/SKILL.md",
  import.meta.url,
);
const pluginAskStrategySkillUrl = new URL(
  "../skills/aim-ask-strategy/SKILL.md",
  import.meta.url,
);
const pluginWritingTestsSkillUrl = new URL(
  "../skills/aim-writing-tests/SKILL.md",
  import.meta.url,
);
const pluginTestDrivenDevelopmentSkillUrl = new URL(
  "../skills/aim-test-driven-development/SKILL.md",
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
let pluginModule: { default: { id?: string; server: unknown } } | undefined;
let pluginSource: string;
let pluginDeveloperGuideSkillText: string;
let pluginCreateTasksSkillText: string;
let pluginCoordinatorGuideSkillText: string;
let managerEvaluationSignalDocText: string;
let pluginSetupGithubRepoSkillText: string;
let pluginEvaluateReadmeSkillText: string;
let pluginManagerGuideSkillText: string;
let pluginAskStrategySkillText: string;
let pluginWritingTestsSkillText: string;
let pluginTestDrivenDevelopmentSkillText: string;
let pluginSkillsReadme: string;
let pluginReadme: string;
let packedFilesPromise: Promise<string[]> | undefined;
const packagedSkillsPath = fileURLToPath(new URL("../skills/", pluginEntryUrl));
const artifactsDirUrl = new URL("../.artifacts/test-pack/", import.meta.url);
const execFileAsync = promisify(execFile);
const shouldRunPackTests = process.env.AIM_RUN_PACK_TESTS === "1";
const itPack = shouldRunPackTests ? it : it.skip;

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
  if (!pluginModule) {
    throw new Error("Expected built plugin module to be loaded");
  }

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
  pluginDeveloperGuideSkillText = await readFile(
    pluginDeveloperGuideSkillUrl,
    "utf8",
  );
  pluginCreateTasksSkillText = await readFile(
    pluginCreateTasksSkillUrl,
    "utf8",
  );
  pluginCoordinatorGuideSkillText = await readFile(
    pluginCoordinatorGuideSkillUrl,
    "utf8",
  );
  managerEvaluationSignalDocText = await readFile(
    managerEvaluationSignalDocUrl,
    "utf8",
  );
  pluginSetupGithubRepoSkillText = await readFile(
    pluginSetupGithubRepoSkillUrl,
    "utf8",
  );
  pluginEvaluateReadmeSkillText = await readFile(
    pluginEvaluateReadmeSkillUrl,
    "utf8",
  ).catch(() => "");
  pluginManagerGuideSkillText = await readFile(
    pluginManagerGuideSkillUrl,
    "utf8",
  ).catch(() => "");
  pluginAskStrategySkillText = await readFile(
    pluginAskStrategySkillUrl,
    "utf8",
  ).catch(() => "");
  pluginWritingTestsSkillText = await readFile(
    pluginWritingTestsSkillUrl,
    "utf8",
  ).catch(() => "");
  pluginTestDrivenDevelopmentSkillText = await readFile(
    pluginTestDrivenDevelopmentSkillUrl,
    "utf8",
  );
  pluginSkillsReadme = await readFile(pluginSkillsReadmeUrl, "utf8");
  pluginReadme = await readFile(pluginReadmeUrl, "utf8");

  if (shouldRunPackTests) {
    try {
      await access(pluginEntryUrl);
    } catch {
      throw new Error(
        "Expected modules/opencode-plugin/dist/index.js to exist before running plugin pack tests. Run pnpm --filter ./modules/opencode-plugin run build:dist first.",
      );
    }

    pluginModule = (await import(
      pathToFileURL(fileURLToPath(pluginEntryUrl)).href
    )) as { default: { id?: string; server: unknown } };
  }
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

  it("ships the aim-developer-guide skill resource", async () => {
    await expect(access(pluginDeveloperGuideSkillUrl)).resolves.toBeUndefined();
  });

  it("ships the aim-create-tasks skill resource", async () => {
    await expect(access(pluginCreateTasksSkillUrl)).resolves.toBeUndefined();
  });

  it("ships the aim-coordinator-guide skill resource", async () => {
    await expect(
      access(pluginCoordinatorGuideSkillUrl),
    ).resolves.toBeUndefined();
  });

  it("ships the aim-setup-github-repo skill resource", async () => {
    await expect(
      access(pluginSetupGithubRepoSkillUrl),
    ).resolves.toBeUndefined();
  });

  it("ships the aim-evaluate-readme skill resource", async () => {
    await expect(access(pluginEvaluateReadmeSkillUrl)).resolves.toBeUndefined();
  });

  it("ships the aim-manager-guide skill resource", async () => {
    await expect(access(pluginManagerGuideSkillUrl)).resolves.toBeUndefined();
  });

  it("ships the aim-ask-strategy skill resource", async () => {
    await expect(access(pluginAskStrategySkillUrl)).resolves.toBeUndefined();
  });

  it("ships the aim-writing-tests skill resource", async () => {
    await expect(access(pluginWritingTestsSkillUrl)).resolves.toBeUndefined();
  });

  itPack("packs the expected publishable tarball contents", async () => {
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
      "package/skills/aim-ask-strategy/SKILL.md",
      "package/skills/aim-coordinator-guide/SKILL.md",
      "package/skills/aim-create-tasks/SKILL.md",
      "package/skills/aim-developer-guide/SKILL.md",
      "package/skills/aim-evaluate-readme/SKILL.md",
      "package/skills/aim-manager-guide/SKILL.md",
      "package/skills/aim-setup-github-repo/SKILL.md",
      "package/skills/aim-test-driven-development/SKILL.md",
      "package/skills/aim-verify-task-spec/SKILL.md",
      "package/skills/aim-writing-tests/SKILL.md",
      "package/skills/using-aim/SKILL.md",
    ]);
  });

  itPack(
    "packs the aim-create-tasks skill into the publishable tarball",
    async () => {
      await expect(listPackedFiles()).resolves.toContain(
        "package/skills/aim-create-tasks/SKILL.md",
      );
    },
  );

  itPack(
    "packs the aim-coordinator-guide skill into the publishable tarball",
    async () => {
      await expect(listPackedFiles()).resolves.toContain(
        "package/skills/aim-coordinator-guide/SKILL.md",
      );
    },
  );

  itPack(
    "packs the aim-setup-github-repo skill into the publishable tarball",
    async () => {
      await expect(listPackedFiles()).resolves.toContain(
        "package/skills/aim-setup-github-repo/SKILL.md",
      );
    },
  );

  itPack(
    "packs the aim-evaluate-readme skill into the publishable tarball",
    async () => {
      await expect(listPackedFiles()).resolves.toContain(
        "package/skills/aim-evaluate-readme/SKILL.md",
      );
    },
  );

  itPack(
    "packs the aim-manager-guide skill into the publishable tarball",
    async () => {
      await expect(listPackedFiles()).resolves.toContain(
        "package/skills/aim-manager-guide/SKILL.md",
      );
    },
  );

  itPack(
    "packs the aim-ask-strategy skill into the publishable tarball",
    async () => {
      await expect(listPackedFiles()).resolves.toContain(
        "package/skills/aim-ask-strategy/SKILL.md",
      );
    },
  );

  itPack(
    "packs the aim-writing-tests skill into the publishable tarball",
    async () => {
      await expect(listPackedFiles()).resolves.toContain(
        "package/skills/aim-writing-tests/SKILL.md",
      );
    },
  );

  it("documents lifecycle reporting as packaged documentation only", () => {
    expect(pluginSkillsReadme).not.toContain("aim-placeholder");
    expect(pluginSkillsReadme).toContain("aim-developer-guide");
    expect(pluginSkillsReadme).toContain("required worktree/PR flow");
    expect(pluginSkillsReadme).toContain("packaging and discovery boundaries");
    expect(pluginSkillsReadme).toContain("workflow automation");

    expect(pluginDeveloperGuideSkillText).toContain(
      "name: aim-developer-guide",
    );
    expect(pluginDeveloperGuideSkillText).toContain("AIM developer guide");
    expect(pluginReadme).toContain(
      "Registers the packaged `skills/` directory",
    );
    expect(pluginReadme).toContain(
      "Ships static `skills/` and `agents/` resources",
    );
    expect(pluginReadme).toContain("aim-developer-guide");
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

  it("documents aim-coordinator-guide as packaged documentation only", () => {
    expect(pluginSkillsReadme).toContain("aim-coordinator-guide");
    expect(pluginSkillsReadme).toContain("POST /tasks/batch");
    expect(pluginSkillsReadme).toContain("Coordinator decision entry");

    expect(pluginReadme).toContain("aim-coordinator-guide");
    expect(pluginReadme).toContain("Coordinator Task Pool decisions");
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

  it("documents aim-evaluate-readme as packaged documentation only", () => {
    expect(pluginSkillsReadme).toContain("aim-evaluate-readme");
    expect(pluginSkillsReadme).toContain("README-to-baseline gap evaluation");
    expect(pluginSkillsReadme).toContain("packaging and discovery boundaries");

    expect(pluginReadme).toContain("aim-evaluate-readme");
    expect(pluginReadme).toContain("static `skills/` and `agents/` resources");
    expect(pluginReadme).toContain("Does not inject bootstrap prompts");
    expect(pluginReadme).toContain("workflow automation");
  });

  it("documents aim-manager-guide as packaged documentation only", () => {
    expect(pluginSkillsReadme).toContain("aim-manager-guide");
    expect(pluginSkillsReadme).toContain("evaluation signals");
    expect(pluginSkillsReadme).toContain("dimension evaluations");

    expect(pluginReadme).toContain("aim-manager-guide");
    expect(pluginReadme).toContain("Manager evaluation signals");
    expect(pluginReadme).toContain("static `skills/` and `agents/` resources");
    expect(pluginReadme).toContain("Does not inject bootstrap prompts");
    expect(pluginReadme).toContain("workflow automation");
  });

  it("documents aim-ask-strategy as packaged documentation only", () => {
    expect(pluginSkillsReadme).toContain("aim-ask-strategy");
    expect(pluginSkillsReadme).toContain(
      "Broad AIM pre-execution strategy entry",
    );
    expect(pluginSkillsReadme).toContain("creative/design work");
    expect(pluginSkillsReadme).toContain("packaging and discovery boundaries");

    expect(pluginReadme).toContain("aim-ask-strategy");
    expect(pluginReadme).toContain("broad pre-execution discovery entry");
    expect(pluginReadme).toContain("direct workflow guides");
    expect(pluginReadme).toContain("static `skills/` and `agents/` resources");
    expect(pluginReadme).toContain("Does not inject bootstrap prompts");
    expect(pluginReadme).toContain("workflow automation");
  });

  it("documents aim-writing-tests as packaged documentation only", () => {
    expect(pluginSkillsReadme).toContain("aim-writing-tests");
    expect(pluginSkillsReadme).toContain("behavior-oriented tests");
    expect(pluginSkillsReadme).toContain("artifact prerequisites");

    expect(pluginReadme).toContain("aim-writing-tests");
    expect(pluginReadme).toContain("test writing");
    expect(pluginReadme).toContain("static `skills/` and `agents/` resources");
    expect(pluginReadme).toContain("Does not inject bootstrap prompts");
    expect(pluginReadme).toContain("workflow automation");
  });

  it("documents using-aim discovery for aim-evaluate-readme", async () => {
    const usingAimSkillText = await readFile(
      new URL("../skills/using-aim/SKILL.md", import.meta.url),
      "utf8",
    );

    expect(usingAimSkillText).toContain("README 与最新 `origin/main` 的差距");
    expect(usingAimSkillText).toContain("aim-evaluate-readme");
    expect(usingAimSkillText).toContain("方向信号");
  });

  it("documents using-aim discovery for aim-ask-strategy", async () => {
    const usingAimSkillText = await readFile(
      new URL("../skills/using-aim/SKILL.md", import.meta.url),
      "utf8",
    );

    expect(usingAimSkillText).toContain("front-door routing step");
    expect(usingAimSkillText).toContain("creative or design exploration");
    expect(usingAimSkillText).toContain("上中下三策");
    expect(usingAimSkillText).toContain("aim-ask-strategy");
    expect(usingAimSkillText).toContain("broader front-door router");
    expect(usingAimSkillText).toContain("creative/design exploration");
    expect(usingAimSkillText).toContain(
      "If the missing detail would not change direction, priority, or next action, continue with the more direct workflow instead.",
    );
    expect(usingAimSkillText).toContain(
      "direct entry when the user wants to turn stabilized, approved intent into candidate five-part AIM Task Specs",
    );
    expect(usingAimSkillText).toContain(
      "direct entry when the user wants to evaluate README 与最新 `origin/main` 的差距",
    );
    expect(usingAimSkillText).toContain(
      "direct entry when the user wants to validate whether a candidate or existing AIM Task Spec still holds against the latest baseline.",
    );
    expect(usingAimSkillText).toContain(
      "direct entry when the user needs execution guidance for an existing AIM Task through worktree, PR, follow-up, and closing stages",
    );
    expect(usingAimSkillText).toContain(
      "direct entry when the user wants to verify or standardize GitHub merge settings",
    );
  });

  it("documents using-aim discovery for aim-coordinator-guide", async () => {
    const usingAimSkillText = await readFile(
      new URL("../skills/using-aim/SKILL.md", import.meta.url),
      "utf8",
    );

    expect(usingAimSkillText).toContain("aim-coordinator-guide");
    expect(usingAimSkillText).toContain("Coordinator Task Pool maintenance");
    expect(usingAimSkillText).toContain("POST /tasks/batch");
    expect(usingAimSkillText).toContain("rejected Task feedback");
  });

  it("documents using-aim discovery for aim-manager-guide", async () => {
    const usingAimSkillText = await readFile(
      new URL("../skills/using-aim/SKILL.md", import.meta.url),
      "utf8",
    );

    expect(usingAimSkillText).toContain("aim-manager-guide");
    expect(usingAimSkillText).toContain("evaluation signals");
    expect(usingAimSkillText).toContain("Coordinator handoff");
    expect(usingAimSkillText).toContain(
      "without creating Tasks or executing work",
    );
  });

  it("documents using-aim discovery for aim-writing-tests", async () => {
    const usingAimSkillText = await readFile(
      new URL("../skills/using-aim/SKILL.md", import.meta.url),
      "utf8",
    );

    expect(usingAimSkillText).toContain(
      "write, modify, migrate, or review tests",
    );
    expect(usingAimSkillText).toContain("aim-writing-tests");
    expect(usingAimSkillText).toContain("before writing RED tests");
    expect(usingAimSkillText).toContain("implementation shape");
  });

  it("documents aim-writing-tests behavior-first testing rules", () => {
    for (const requiredFragment of [
      "优先写面向接口和行为的测试",
      "old-style implementation-coupled test",
      "policy / architecture / generated artifact guard",
      "ensure build dist",
      "TDD RED",
      "mock 外部边界",
    ]) {
      expect(pluginWritingTestsSkillText).toContain(requiredFragment);
    }

    expect(pluginWritingTestsSkillText).toContain("name: aim-writing-tests");
    expect(pluginWritingTestsSkillText).toContain(
      "产品 / API / CLI / UI / contract / persistence",
    );
    expect(pluginWritingTestsSkillText).not.toContain("TODO");
    expect(pluginWritingTestsSkillText).not.toContain("TBD");
  });

  it("requires aim-writing-tests before TDD red tests", () => {
    expect(pluginTestDrivenDevelopmentSkillText).toContain("aim-writing-tests");
    expect(pluginTestDrivenDevelopmentSkillText).toContain("写任何 RED 测试前");
    expect(pluginTestDrivenDevelopmentSkillText).toContain(
      "RED 所需前置状态必须由被调用的验证命令显式提供",
    );
  });

  it("documents aim-ask-strategy README-first recursive strategy workflow", () => {
    for (const requiredFragment of [
      "开始问策前必须先读 README",
      "第一次输出必须直接给出上中下三策",
      "默认推荐通常是中策",
      "用户选中一策后，递归细化这一策",
      "下一步动作已经清楚时停止",
      "提问只服务于改变策略排序",
      "开放式问题、方向选择题",
      "创意、交互、产品、文档结构等设计工作",
      "只有在答案会改变路线、推荐或排序时才值得问",
      "aim-verify-task-spec",
    ]) {
      expect(pluginAskStrategySkillText).toContain(requiredFragment);
    }

    expect(pluginAskStrategySkillText).toContain("问策 / 定策");
    expect(pluginAskStrategySkillText).toContain("README");
    expect(pluginAskStrategySkillText).toContain("方向选择");
    expect(pluginAskStrategySkillText).toContain("开放问题");
    expect(pluginAskStrategySkillText).toContain("design or orienting work");
    expect(pluginAskStrategySkillText).toContain("key clarifications");
    expect(pluginAskStrategySkillText).toContain("上策");
    expect(pluginAskStrategySkillText).toContain("中策");
    expect(pluginAskStrategySkillText).toContain("下策");
    expect(pluginAskStrategySkillText).not.toContain("TODO");
    expect(pluginAskStrategySkillText).not.toContain("TBD");
  });

  it("documents aim-evaluate-readme content boundaries and output semantics", () => {
    for (const requiredFragment of [
      "最新 origin/main",
      "claim_checks",
      "conclusion_category",
      "iteration_signal",
      "git fetch origin",
    ]) {
      expect(pluginEvaluateReadmeSkillText).toContain(requiredFragment);
    }

    const conclusionCategorySection = pluginEvaluateReadmeSkillText.match(
      /## `conclusion_category` 允许值\n\n([\s\S]*?)\n## 总体结论聚合规则/,
    );

    expect(conclusionCategorySection).not.toBeNull();

    if (!conclusionCategorySection) {
      throw new Error("Expected conclusion_category section in skill text");
    }

    const conclusionCategorySectionText = conclusionCategorySection[1];

    expect(conclusionCategorySectionText).toBeDefined();

    if (conclusionCategorySectionText === undefined) {
      throw new Error("Expected conclusion_category capture in skill text");
    }

    expect(conclusionCategorySectionText.match(/- `([^`]+)`：/g)).toEqual([
      "- `aligned`：",
      "- `readme_ahead`：",
      "- `baseline_ahead`：",
      "- `ambiguous`：",
      "- `conflicted`：",
    ]);

    const iterationSignalSection = pluginEvaluateReadmeSkillText.match(
      /## `iteration_signal` 固定映射\n\n([\s\S]*?)\n\n不得混用映射/,
    );

    expect(iterationSignalSection).not.toBeNull();

    if (!iterationSignalSection) {
      throw new Error("Expected iteration_signal section in skill text");
    }

    const iterationSignalSectionText = iterationSignalSection[1];

    expect(iterationSignalSectionText).toBeDefined();

    if (iterationSignalSectionText === undefined) {
      throw new Error("Expected iteration_signal capture in skill text");
    }

    expect(
      Array.from(
        iterationSignalSectionText.matchAll(
          /^\| `(aligned|readme_ahead|baseline_ahead|ambiguous|conflicted)` \| `([^`]+)` \|/gm,
        ),
        ([, conclusionCategory, iterationSignal]) => ({
          conclusionCategory,
          iterationSignal,
        }),
      ),
    ).toEqual([
      {
        conclusionCategory: "aligned",
        iterationSignal: "hold_alignment",
      },
      {
        conclusionCategory: "readme_ahead",
        iterationSignal: "continue_toward_readme",
      },
      {
        conclusionCategory: "baseline_ahead",
        iterationSignal: "consolidate_readme",
      },
      {
        conclusionCategory: "ambiguous",
        iterationSignal: "clarify_readme",
      },
      {
        conclusionCategory: "conflicted",
        iterationSignal: "resolve_readme_conflict",
      },
    ]);

    expect(pluginEvaluateReadmeSkillText).not.toContain("TODO");
    expect(pluginEvaluateReadmeSkillText).not.toContain("TBD");
  });

  it("documents manager guide report structure and boundaries", () => {
    for (const requiredFragment of [
      "name: aim-manager-guide",
      "Manager 评估信号",
      "baseline_ref",
      "readme_target_summary",
      "dimensions",
      "dimension_evaluations",
      "project_id",
      "baseline_facts",
      "差距分析",
      "iteration_direction",
      "coordinator_handoff",
      "open_questions",
      "confidence_and_limits",
      "持久化事实源仍是 `dimensions` 与 `dimension_evaluations`",
      "默认不需要用户输入",
      "Rejected Task",
      "aim-evaluate-readme",
      "aim-coordinator-guide",
      "aim-ask-strategy",
      "using-aim",
      "docs/manager-evaluation-signal.md",
    ]) {
      expect(pluginManagerGuideSkillText).toContain(requiredFragment);
    }

    expect(pluginManagerGuideSkillText).not.toContain("TODO");
    expect(pluginManagerGuideSkillText).not.toContain("TBD");
  });

  it("documents manager evaluation signals without a standalone report resource", () => {
    for (const requiredFragment of [
      "# Manager 评估信号",
      "不是一等持久化资源",
      "`dimensions` 保存评估维度定义",
      "`dimension_evaluations` 保存每次针对维度的评分",
      "GET /dimensions?project_id=...",
      "不是读取、创建或引用独立的 `manager_reports` 资源",
      "baseline_ref",
      "dimensions",
      "dimension_evaluations",
      "差距分析",
      "POST /tasks/batch",
      "不能替代 Coordinator 审批或 Task 写入流程",
      "作为独立 `manager_reports` API、SQLite 表、CLI 命令或 Web 资源存在",
      "POST /tasks",
    ]) {
      expect(managerEvaluationSignalDocText).toContain(requiredFragment);
    }

    expect(managerEvaluationSignalDocText).not.toContain("TODO");
    expect(managerEvaluationSignalDocText).not.toContain("TBD");
  });

  it("documents developer guide reporting rules and failure split", () => {
    expect(pluginDeveloperGuideSkillText).toMatch(
      /`SERVER_BASE_URL` 默认为 `http:\/\/localhost:8192`。/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /PUT \$\{SERVER_BASE_URL\}\/tasks\/\$\{task_id\}\/worktree_path/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /PUT \$\{SERVER_BASE_URL\}\/tasks\/\$\{task_id\}\/pull_request_url/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /PUT \$\{SERVER_BASE_URL\}\/tasks\/\$\{task_id\}\/dependencies/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /字段级事实必须使用对应的 PUT 端点单独上报。/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /只能使用 `POST \/resolve` 上报 `resolved` 终态结果，且只能使用 `POST \/reject` 上报 `rejected` 终态结果。/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /在非终态 PATCH 上报中，只发送受支持的 patch 字段，绝不要通过发送 `done`、`worktree_path`、`pull_request_url` 或 `dependencies` 来指挥 AIM。/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /终态上报的请求体必须且只能包含一个非空 `result` 字符串字段。/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /要把任务失败与上报失败区分开。/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /任务失败：工作本身失败，因此应通过 `POST \/tasks\/\$\{task_id\}\/reject` 发送带非空 `result` 的终态失败上报。/,
    );
    expect(pluginDeveloperGuideSkillText).toMatch(
      /上报失败：PATCH 请求或终态 POST 因网络、超时、连接、5xx 或意外响应等问题失败。不要把这类情况转换成任务失败。/,
    );

    for (const requiredFragment of [
      '"status": "processing"',
      "resolved",
      "rejected",
      `POST /tasks/\${task_id}/resolve`,
      `POST /tasks/\${task_id}/reject`,
      `PUT /tasks/\${task_id}/worktree_path`,
      `PUT /tasks/\${task_id}/pull_request_url`,
      `PUT /tasks/\${task_id}/dependencies`,
      "AIM 上报阻塞",
    ]) {
      expect(pluginDeveloperGuideSkillText).toContain(requiredFragment);
    }

    expect(pluginDeveloperGuideSkillText).not.toContain("TODO");
    expect(pluginDeveloperGuideSkillText).not.toContain("TBD");
  });

  it("documents coordinator guide task batch rules", () => {
    for (const requiredFragment of [
      "name: aim-coordinator-guide",
      "Coordinator decision entry",
      "POST /tasks/batch",
      "project_id",
      "Create",
      "Delete",
      "rejected Task",
      "aim-verify-task-spec",
      "aim-create-tasks",
      "Director",
      "不得直接调用 `POST /tasks` 逐条写入",
      "不得创建澄清类 Developer Task",
      "未完成 Task 执行产物分类门禁",
      "`worktree_path = null` 且 `pull_request_url = null`",
      "允许用更准确的 `create` + `delete` batch 替换",
      "不得把泛化 optimizer-loop placeholder",
      "`worktree_path` 已记录且 `pull_request_url = null`",
      "`pull_request_url` 已记录",
      "PR-backed 在途工作",
      "默认保留并进入 `evaluate_existing_tasks` / follow-up 路径",
      "不得只因新 baseline、Manager 新分数或更优描述就删除、重复创建或替换",
    ]) {
      expect(pluginCoordinatorGuideSkillText).toContain(requiredFragment);
    }

    expect(pluginCoordinatorGuideSkillText).not.toContain("TODO");
    expect(pluginCoordinatorGuideSkillText).not.toContain("TBD");
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
    expect(pluginCreateTasksSkillText).toContain("`project_id`");
    expect(pluginCreateTasksSkillText).toContain("`title`");
    expect(pluginCreateTasksSkillText).toContain("`developer_provider_id`");
    expect(pluginCreateTasksSkillText).toContain("`developer_model_id`");
    expect(pluginCreateTasksSkillText).toContain(
      "`title`、`task_spec`、`project_id`、`developer_provider_id` 和 `developer_model_id` 是创建必需字段。",
    );
    expect(pluginCreateTasksSkillText).toContain("`dependencies` 只是软提示");
    expect(pluginCreateTasksSkillText).toContain(
      "只有用户明确表示批准创建，才能调用 `POST /tasks`。",
    );
    expect(pluginCreateTasksSkillText).toContain(
      "如果用户要求修改候选，回到访谈或起草步骤，重新形成候选并再次经过独立校验。",
    );
    expect(pluginCreateTasksSkillText).toContain("不要猜 `project_id`");
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

  itPack("exports a default plugin module from the built entry", () => {
    const builtPluginModule = pluginModule;

    expect(builtPluginModule).toBeDefined();

    if (!builtPluginModule) {
      throw new Error("expected plugin module to be loaded");
    }

    expect(builtPluginModule.default.id).toBe("@aim-ai/opencode-plugin");
    expect(typeof builtPluginModule.default.server).toBe("function");
  });

  itPack(
    "appends the packaged skills path without overwriting existing entries",
    async () => {
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
    },
  );

  itPack("creates skills config when it is initially missing", async () => {
    const hooks = await loadPluginHooks();
    const config: ConfigWithSkills = {};

    await hooks.config?.(config);

    expect(config.skills?.paths).toEqual([packagedSkillsPath]);
  });

  itPack(
    "dedupes the packaged skills path when it is already configured",
    async () => {
      const hooks = await loadPluginHooks();
      const config: ConfigWithSkills = {
        skills: {
          paths: [packagedSkillsPath],
        },
      };

      await hooks.config?.(config);

      expect(config.skills?.paths).toEqual([packagedSkillsPath]);
    },
  );

  itPack(
    "keeps the packaged skills path deduped across repeated config hook calls",
    async () => {
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
    },
  );

  itPack("only registers the config hook for packaged skills", async () => {
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
