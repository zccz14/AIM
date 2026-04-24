import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

describe("opencode model routes", () => {
  it("exposes OpenCode provider and model combinations", async () => {
    const listSupportedModels = vi.fn().mockResolvedValue({
      items: [
        {
          model_id: "claude-sonnet-4-5",
          model_name: "Claude Sonnet 4.5",
          provider_id: "anthropic",
          provider_name: "Anthropic",
        },
      ],
    });

    const app = createApp({
      openCodeModelsAdapter: { listSupportedModels },
    });

    const response = await app.request("/opencode/models");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          model_id: "claude-sonnet-4-5",
          model_name: "Claude Sonnet 4.5",
          provider_id: "anthropic",
          provider_name: "Anthropic",
        },
      ],
    });
  });

  it("returns a clear error when OpenCode models are unavailable", async () => {
    const app = createApp({
      openCodeModelsAdapter: {
        listSupportedModels: vi
          .fn()
          .mockRejectedValue(new Error("opencode unavailable")),
      },
    });

    const response = await app.request("/opencode/models");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "OPENCODE_MODELS_UNAVAILABLE",
      message: "OpenCode models are unavailable",
    });
  });
});
