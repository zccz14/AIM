import { fileURLToPath } from "node:url";

import { type Plugin, type PluginModule, tool } from "@opencode-ai/plugin";

const packagedSkillsPath = fileURLToPath(
  new URL("../skills/", import.meta.url),
);
type ConfigWithSkills = {
  skills?: {
    paths?: string[];
  };
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
      console.info(new Date(), `[AIM][Event][session.idle]`, {
        sessionId: eventCtx.event.properties.sessionID,
      });
      // ISSUE: the API of opencode to get the session state is very limited.
      // TODO:
      // if this session is controlled by AIM, we can find the continue prompt by calling AIM API.
      // so we can continue the session with the continue prompt.
      // until it is resolved or rejected by calling the tools below.
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
        // TODO: call AIM API to mark the session as resolved.
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
        // TODO: call AIM API to mark the session as rejected.
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
