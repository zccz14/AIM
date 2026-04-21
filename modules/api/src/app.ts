import { openApiDocument } from "@aim-ai/contract";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { registerHealthRoute } from "./routes/health.js";
import { registerTaskRoutes } from "./routes/tasks.js";

export const createApp = () => {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));

  registerHealthRoute(app);
  registerTaskRoutes(app);

  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
