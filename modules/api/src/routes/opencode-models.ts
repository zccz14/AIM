import {
  opencodeModelsPath,
  opencodeModelsResponseSchema,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import {
  createOpenCodeSdkAdapter,
  type OpenCodeSdkAdapter,
} from "../opencode-sdk-adapter.js";

const buildOpenCodeModelsUnavailableError = () =>
  taskErrorSchema.parse({
    code: "OPENCODE_MODELS_UNAVAILABLE",
    message: "OpenCode models are unavailable",
  });

type RegisterOpenCodeModelRoutesOptions = {
  adapter?: Pick<OpenCodeSdkAdapter, "listSupportedModels">;
};

export const registerOpenCodeModelRoutes = (
  app: Hono,
  options: RegisterOpenCodeModelRoutesOptions = {},
) => {
  let adapter = options.adapter;
  const getAdapter = () => {
    adapter ??= createOpenCodeSdkAdapter({
      baseUrl: process.env.OPENCODE_BASE_URL ?? "http://localhost:4096",
    });

    return adapter;
  };

  app.get(opencodeModelsPath, async (context) => {
    try {
      const payload = await getAdapter().listSupportedModels();

      return context.json(opencodeModelsResponseSchema.parse(payload), 200);
    } catch {
      return context.json(buildOpenCodeModelsUnavailableError(), 503);
    }
  });
};
