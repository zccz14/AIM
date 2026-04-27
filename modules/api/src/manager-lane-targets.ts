import { execFile } from "node:child_process";

import type { AgentSessionLaneInput } from "./agent-session-lane.js";

type DimensionTargetRepository = {
  listUnevaluatedDimensionIds(
    projectId: string,
    commitSha: string,
  ): Promise<string[]>;
};

const git = (projectDirectory: string, args: string[]) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd: projectDirectory },
      (error, stdout: string) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout.trim());
      },
    );
  });

const quoteDimensionIds = (dimensionIds: string[]) =>
  dimensionIds.map((dimensionId) => `"${dimensionId}"`).join(", ");

export const prepareManagerLaneScanInput = async ({
  dimensionRepository,
  input,
  projectId,
}: {
  dimensionRepository: DimensionTargetRepository;
  input: AgentSessionLaneInput;
  projectId: string;
}) => {
  await git(input.projectDirectory, ["fetch", "origin", "main"]);
  const commitSha = await git(input.projectDirectory, [
    "rev-parse",
    "origin/main",
  ]);
  const dimensionIds = await dimensionRepository.listUnevaluatedDimensionIds(
    projectId,
    commitSha,
  );

  if (dimensionIds.length === 0) {
    return null;
  }

  return {
    ...input,
    prompt: `${input.prompt}

Current baseline commit: "${commitSha}".
Evaluate only these dimension_id values for this baseline commit: ${quoteDimensionIds(dimensionIds)}.
Do not evaluate dimensions outside that explicit list.`,
  };
};
