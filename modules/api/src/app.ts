import { openApiDocument } from "@cz-stack/contract";
import { Hono } from "hono";

import { registerHealthRoute } from "./routes/health.js";

export const createApp = () => {
  const app = new Hono();

  registerHealthRoute(app);

  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
