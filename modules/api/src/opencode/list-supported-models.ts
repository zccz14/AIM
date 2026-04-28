import type { OpenCodeModelsResponse } from "@aim-ai/contract";
import { createOpencodeClient } from "@opencode-ai/sdk";

export type ListSupportedModelsOptions = {
  baseUrl: string;
};

export const listSupportedModels = async ({
  baseUrl,
}: ListSupportedModelsOptions): Promise<OpenCodeModelsResponse> => {
  const client = createOpencodeClient({ baseUrl });
  const response = await client.provider.list({ throwOnError: true });

  return {
    items: response.data.all.flatMap((provider) =>
      Object.values(provider.models).map((model) => ({
        model_id: model.id,
        model_name: model.name,
        provider_id: provider.id,
        provider_name: provider.name,
      })),
    ),
  };
};
