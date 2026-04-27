import { fileURLToPath } from "node:url";

import { type Plugin, type PluginModule, tool } from "@opencode-ai/plugin";

const packagedSkillsPath = fileURLToPath(
  new URL("../skills/", import.meta.url),
);
const defaultAimApiBaseUrl = "http://localhost:8192";
type ConfigWithSkills = {
  skills?: {
    paths?: string[];
  };
};
type OpenCodeSession = {
  continue_prompt: null | string;
  state: "pending" | "rejected" | "resolved";
};

const continuationTerminalInstructions = `

Terminal instruction: when the session objective is complete, call aim_session_resolve. When the session is unable to proceed or the objective is invalid, call aim_session_reject. If you do not call aim_session_resolve or aim_session_reject, this loop will not end.`;

const getAimApiBaseUrl = () =>
  (
    process.env.AIM_API_BASE_URL ??
    process.env.SERVER_BASE_URL ??
    defaultAimApiBaseUrl
  )
    .trim()
    .replace(/\/+$/, "");

const buildAimApiUrl = (path: string) => `${getAimApiBaseUrl()}${path}`;

const fetchOpenCodeSession = async (
  sessionId: string,
): Promise<null | OpenCodeSession> => {
  const response = await fetch(
    buildAimApiUrl(`/opencode/sessions/${encodeURIComponent(sessionId)}`),
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`AIM API returned ${response.status} for OpenCode session`);
  }

  return (await response.json()) as OpenCodeSession;
};

const settleOpenCodeSession = async (
  sessionId: string,
  action: "reject" | "resolve",
  payload: Record<string, string | undefined>,
) => {
  const response = await fetch(
    buildAimApiUrl(
      `/opencode/sessions/${encodeURIComponent(sessionId)}/${action}`,
    ),
    {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(
      `AIM API returned ${response.status} while settling OpenCode session`,
    );
  }
};

export const AIMOpenCodePlugin: Plugin = async (ctx) => ({
  config: async (config) => {
    const configWithSkills = config as typeof config & ConfigWithSkills;
    const paths = configWithSkills.skills?.paths ?? [];

    configWithSkills.skills = {
      ...configWithSkills.skills,
      paths: paths.includes(packagedSkillsPath)
        ? paths
        : [...paths, packagedSkillsPath],
    };
  },
  async event(eventCtx) {
    if (eventCtx.event.type === "session.idle") {
      const sessionId = eventCtx.event.properties.sessionID;
      console.info(new Date(), `[AIM][Event][session.idle]`, {
        sessionId,
      });

      const session = await fetchOpenCodeSession(sessionId);
      const continuePrompt = session?.continue_prompt?.trim();

      if (session?.state !== "pending" || !continuePrompt) {
        return;
      }

      await ctx.client.session.promptAsync({
        body: {
          parts: [
            {
              text: `${continuePrompt}${continuationTerminalInstructions}`,
              type: "text",
            },
          ],
        },
        path: { id: sessionId },
        throwOnError: true,
      });

      return;
    }
  },
  tool: {
    aim_session_resolve: tool({
      description:
        "if this session is controlled by AIM. call when a session is resolved according to the objective",
      args: {
        value: tool.schema
          .string()
          .optional()
          .describe("the resolution result or message"),
      },
      async execute(_args, _toolCtx) {
        console.info(new Date(), `[AIM][Tool][aim_session_resolve] called`, {
          sessionId: _toolCtx.sessionID,
          value: _args.value,
        });
        await settleOpenCodeSession(_toolCtx.sessionID, "resolve", {
          value: _args.value,
        });
        return ``;
      },
    }),
    aim_session_reject: tool({
      description:
        "if this session is controlled by AIM. call when a session is rejected according to the objective",
      args: {
        reason: tool.schema
          .string()
          .optional()
          .describe("the reason for rejecting the session"),
      },
      async execute(_args, _toolCtx) {
        console.info(new Date(), `[AIM][Tool][aim_session_reject] called`, {
          sessionId: _toolCtx.sessionID,
          reason: _args.reason,
        });
        await settleOpenCodeSession(_toolCtx.sessionID, "reject", {
          reason: _args.reason,
        });
        return ``;
      },
    }),
  },
});

const pluginModule = {
  id: "@aim-ai/opencode-plugin",
  server: AIMOpenCodePlugin,
} satisfies PluginModule;

export default pluginModule;
