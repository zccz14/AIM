import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

const mockGit = (commitSha: string) => {
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: null, stdout: string) => void,
    ) => {
      callback(null, `${commitSha}\n`);
    },
  );
};

describe("manager lane targets", () => {
  afterEach(() => {
    execFileMock.mockReset();
  });

  it("returns null when every dimension already has an evaluation for the current baseline commit", async () => {
    const { prepareManagerLaneScanInput } = await import(
      "../src/manager-lane-targets.js"
    );
    const dimensionRepository = {
      listUnevaluatedDimensionIds: vi.fn().mockResolvedValue([]),
    };
    mockGit("abc1234");

    await expect(
      prepareManagerLaneScanInput({
        dimensionRepository,
        input: {
          modelId: "claude-sonnet-4-5",
          projectDirectory: "/repo/project",
          prompt: "FOLLOW the aim-manager-guide SKILL.",
          providerId: "anthropic",
          title: "AIM Manager evaluation lane",
        },
        projectId: "project-1",
      }),
    ).resolves.toBeNull();

    expect(
      dimensionRepository.listUnevaluatedDimensionIds,
    ).toHaveBeenCalledWith("project-1", "abc1234");
  });

  it("injects only unevaluated dimension ids for the current baseline commit", async () => {
    const { prepareManagerLaneScanInput } = await import(
      "../src/manager-lane-targets.js"
    );
    const dimensionRepository = {
      listUnevaluatedDimensionIds: vi
        .fn()
        .mockResolvedValue(["dimension-api", "dimension-docs"]),
    };
    mockGit("def5678");

    const prepared = await prepareManagerLaneScanInput({
      dimensionRepository,
      input: {
        modelId: "claude-sonnet-4-5",
        projectDirectory: "/repo/project",
        prompt: "FOLLOW the aim-manager-guide SKILL.",
        providerId: "anthropic",
        title: "AIM Manager evaluation lane",
      },
      projectId: "project-1",
    });

    expect(prepared?.prompt).toContain('Current baseline commit: "def5678"');
    expect(prepared?.prompt).toContain(
      'Evaluate only these dimension_id values for this baseline commit: "dimension-api", "dimension-docs".',
    );
    expect(prepared?.prompt).toContain(
      "Do not evaluate dimensions outside that explicit list.",
    );
    expect(prepared?.prompt).not.toContain("dimension-security");
  });
});
