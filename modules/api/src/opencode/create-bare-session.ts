import { createOpencodeClient } from "@opencode-ai/sdk";

export type CreateBareOpenCodeSessionOptions = {
  baseUrl: string;
  directory: string;
  title: string;
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
