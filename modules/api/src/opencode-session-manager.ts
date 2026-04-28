import { createOpencodeClient } from "@opencode-ai/sdk";

type OpenCodeSessionState = "pending" | "rejected" | "resolved";

type OpenCodeSessionRepository = Partial<AsyncDisposable> & {
  createSession(input: {
    continue_prompt?: null | string;
    session_id: string;
  }): Promise<unknown> | unknown;
  listSessions(filter: { state?: OpenCodeSessionState }):
    | Array<{
        continue_prompt: null | string;
        session_id: string;
        state: OpenCodeSessionState;
      }>
    | Promise<
        Array<{
          continue_prompt: null | string;
          session_id: string;
          state: OpenCodeSessionState;
        }>
      >;
};

export type CreateOpenCodeSessionManagerOptions = {
  baseUrl: string;
  repository: OpenCodeSessionRepository;
};

export type CreateManagedOpenCodeSessionInput = {
  directory: string;
  prompt: string;
};

const staleAfterMilliseconds = 30 * 60 * 1000;
const pollSleepMilliseconds = 1000;

const sleep = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();

      return;
    }

    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

const getLatestMessageTime = async (
  client: ReturnType<typeof createOpencodeClient>,
  sessionId: string,
) => {
  const response = await client.session.messages({
    path: { id: sessionId },
    throwOnError: true,
  });
  const latestMessage = response.data.at(-1);

  return latestMessage?.info.time.created ?? 0;
};

export const createOpenCodeSessionManager = ({
  baseUrl,
  repository,
}: CreateOpenCodeSessionManagerOptions): AsyncDisposable & {
  createSession(input: CreateManagedOpenCodeSessionInput): Promise<string>;
} => {
  const stack = new AsyncDisposableStack();
  const abortController = new AbortController();
  const client = createOpencodeClient({ baseUrl });
  if (Symbol.asyncDispose in repository) {
    stack.use(repository as AsyncDisposable);
  }

  const watchPendingSessions = async () => {
    while (!abortController.signal.aborted) {
      const pendingSessions = await repository.listSessions({
        state: "pending",
      });

      for (const session of pendingSessions) {
        if (abortController.signal.aborted) {
          break;
        }

        const prompt = session.continue_prompt?.trim();
        if (prompt) {
          const latestMessageTime = await getLatestMessageTime(
            client,
            session.session_id,
          );

          if (Date.now() - latestMessageTime >= staleAfterMilliseconds) {
            await client.session.promptAsync({
              body: { parts: [{ text: prompt, type: "text" }] },
              path: { id: session.session_id },
              throwOnError: true,
            });
          }
        }

        await sleep(pollSleepMilliseconds, abortController.signal);
      }

      await sleep(pollSleepMilliseconds, abortController.signal);
    }
  };
  const watchLoop = watchPendingSessions();
  stack.defer(async () => {
    abortController.abort();
    await watchLoop;
  });

  return {
    async [Symbol.asyncDispose]() {
      await stack.disposeAsync();
    },
    async createSession({ directory, prompt }) {
      const session = await client.session.create({
        body: { title: "AIM OpenCode Session" },
        query: { directory },
        throwOnError: true,
      });

      await repository.createSession({
        continue_prompt: prompt,
        session_id: session.data.id,
      });

      return session.data.id;
    },
  };
};
