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

const maxAimApiErrorDetailLength = 500;

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

const sanitizeAimApiErrorDetail = (value: string) =>
  value
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [redacted]")
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password))\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    );

const boundedAimApiErrorDetail = (value: string) => {
  const sanitized = sanitizeAimApiErrorDetail(value).trim();

  if (sanitized.length <= maxAimApiErrorDetailLength) {
    return sanitized;
  }

  return `${sanitized.slice(0, maxAimApiErrorDetailLength)}...`;
};

const getAimApiResponseErrorDetail = async (response: Response) => {
  const text = await response.text().catch(() => "");
  const parts = [
    `status: ${response.status}`,
    `statusText: ${response.statusText}`,
  ];

  if (!text.trim()) {
    return parts.join(", ");
  }

  try {
    const json = JSON.parse(text) as unknown;

    if (json && typeof json === "object") {
      const error = json as Record<string, unknown>;
      const code = error.code;
      const message = error.message;

      if (typeof code === "string" && code.trim()) {
        parts.push(`code: ${boundedAimApiErrorDetail(code)}`);
      }

      if (typeof message === "string" && message.trim()) {
        parts.push(`message: ${boundedAimApiErrorDetail(message)}`);
      }

      if (parts.length > 2) {
        return parts.join(", ");
      }
    }
  } catch {
    // Fall back to bounded response text below.
  }

  parts.push(`body: ${boundedAimApiErrorDetail(text)}`);
  return parts.join(", ");
};

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
    throw new Error(
      `AIM API failed to fetch OpenCode session (${await getAimApiResponseErrorDetail(response)})`,
    );
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
      `AIM API failed to settle OpenCode session (${await getAimApiResponseErrorDetail(response)})`,
    );
  }
};

export const AIMOpenCodePlugin: Plugin = async (ctx) => {
  const idleContinuationInFlight = new Set<string>();

  return {
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

        if (idleContinuationInFlight.has(sessionId)) {
          return;
        }

        idleContinuationInFlight.add(sessionId);

        try {
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
        } finally {
          idleContinuationInFlight.delete(sessionId);
        }

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
  };
};

const pluginModule = {
  id: "@aim-ai/opencode-plugin",
  server: AIMOpenCodePlugin,
} satisfies PluginModule;

export default pluginModule;
