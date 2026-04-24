import { describe, expect, it, vi } from "vitest";

const mockCreateOpencodeClient = vi.fn();

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

describe("opencode models", () => {
  it("wraps the OpenCode provider list as provider and model combinations", async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        all: [
          {
            id: "anthropic",
            name: "Anthropic",
            models: {
              "claude-sonnet-4-5": {
                id: "claude-sonnet-4-5",
                name: "Claude Sonnet 4.5",
                providerID: "anthropic",
              },
            },
          },
        ],
      },
    });

    mockCreateOpencodeClient.mockReturnValue({
      provider: { list },
    });

    const { createOpenCodeSdkAdapter } = await import(
      "../src/opencode-sdk-adapter.js"
    );
    const adapter = createOpenCodeSdkAdapter({
      baseUrl: "http://127.0.0.1:54321",
      modelId: "claude-sonnet-4-5",
      providerId: "anthropic",
    });

    await expect(adapter.listSupportedModels()).resolves.toEqual({
      items: [
        {
          model_id: "claude-sonnet-4-5",
          model_name: "Claude Sonnet 4.5",
          provider_id: "anthropic",
          provider_name: "Anthropic",
        },
      ],
    });
    expect(list).toHaveBeenCalledWith({ throwOnError: true });
  });
});
