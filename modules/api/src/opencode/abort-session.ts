import { createOpencodeClient } from "@opencode-ai/sdk";

export type AbortOpenCodeSessionOptions = {
  baseUrl: string;
  sessionId: string;
};

export const abortOpenCodeSession = async ({
  baseUrl,
  sessionId,
}: AbortOpenCodeSessionOptions): Promise<void> => {
  const client = createOpencodeClient({ baseUrl });

  await client.session.abort({
    path: { id: sessionId },
    throwOnError: true,
  });
};
