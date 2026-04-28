import { openApiDocument } from "@aim-ai/contract";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { ApiLogger } from "./api-logger.js";
import type { listSupportedModels } from "./opencode/list-supported-models.js";
import type { OptimizerSystem } from "./optimizer-system.js";
import { registerCoordinatorProposalRoutes } from "./routes/coordinator-proposals.js";
import { registerDbRoutes } from "./routes/db.js";
import { registerDimensionRoutes } from "./routes/dimensions.js";
import { registerDirectorClarificationRoutes } from "./routes/director-clarifications.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerOpenCodeModelRoutes } from "./routes/opencode-models.js";
import { registerOpenCodeSessionRoutes } from "./routes/opencode-sessions.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerTaskRoutes } from "./routes/tasks.js";

export type {
  CreateManagedOpenCodeSessionInput,
  CreateOpenCodeSessionManagerOptions,
  OpenCodeSessionManager,
} from "./opencode-session-manager.js";
export { createOpenCodeSessionManager } from "./opencode-session-manager.js";
export type {
  MessageTokenStat,
  TokenStats,
  TokenUsage,
} from "./stat-tokens.js";
export { statTokens, statTokensBySessionId } from "./stat-tokens.js";

type OpenCodeSessionPromptSender = {
  sendPrompt(sessionId: string, prompt: string): Promise<void>;
};

type OpenCodeModelsAdapter = {
  listSupportedModels(): ReturnType<typeof listSupportedModels>;
};

type CurrentBaselineFactsProvider = () => Promise<{ commit: null | string }>;

type CreateAppOptions = {
  currentBaselineFactsProvider?: CurrentBaselineFactsProvider;
  logger?: ApiLogger;
  openCodeModelsAdapter?: OpenCodeModelsAdapter;
  openCodeSessionsAdapter?: OpenCodeSessionPromptSender;
  optimizerSystem?: OptimizerSystem;
};

type AppResource = Hono & AsyncDisposable;

export const createApp = (_options: CreateAppOptions = {}): AppResource => {
  const app = new Hono() as AppResource;
  const resourceScope = new AsyncDisposableStack();

  app[Symbol.asyncDispose] = async () => {
    await resourceScope.disposeAsync();
  };

  app.use("*", cors({ origin: "*" }));

  registerHealthRoute(app);
  registerDbRoutes(app);
  registerOpenCodeModelRoutes(app, {
    adapter: _options.openCodeModelsAdapter,
  });
  registerOpenCodeSessionRoutes(app, {
    adapter: _options.openCodeSessionsAdapter,
    resourceScope,
  });
  registerProjectRoutes(app, {
    optimizerSystem: _options.optimizerSystem,
    resourceScope,
  });
  registerCoordinatorProposalRoutes(app, { resourceScope });
  registerDimensionRoutes(app, { resourceScope });
  registerDirectorClarificationRoutes(app, { resourceScope });
  registerTaskRoutes(app, {
    currentBaselineFactsProvider: _options.currentBaselineFactsProvider,
    logger: _options.logger,
    openCodeModelsAdapter: _options.openCodeModelsAdapter,
    resourceScope,
  });

  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
