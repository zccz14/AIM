import { createOpencodeClient } from "@opencode-ai/sdk";

export type CreateBareOpenCodeSessionOptions = {
  baseUrl: string;
  directory: string;
  title: string;
};

export type SendPromptTextOptions = {
  baseUrl: string;
  prompt: string;
  session_id: string;
};

export const createBareOpenCodeSession = async ({
  baseUrl,
  directory,
  title,
}: CreateBareOpenCodeSessionOptions): Promise<string> => {
  const client = createOpencodeClient({ baseUrl });
  const session = await client.session.create({
    body: { title },
    query: { directory },
    throwOnError: true,
  });

  return session.data.id;
};

export const sendPromptText = async ({
  baseUrl,
  prompt,
  session_id,
}: SendPromptTextOptions): Promise<void> => {
  const client = createOpencodeClient({ baseUrl });

  await client.session.promptAsync({
    body: { parts: [{ text: prompt, type: "text" }] },
    path: { id: session_id },
    throwOnError: true,
  });
};
