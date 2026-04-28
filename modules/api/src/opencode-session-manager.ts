import { createOpencodeClient } from "@opencode-ai/sdk";

type OpenCodeSessionState = "pending" | "rejected" | "resolved";

type OpenCodeSessionRepository = Partial<AsyncDisposable> & {
  createSession(input: {
    continue_prompt?: null | string;
    model_id?: null | string;
    provider_id?: null | string;
    session_id: string;
  }): Promise<unknown> | unknown;
  listSessions(filter: { state?: OpenCodeSessionState }):
    | Array<{
        continue_prompt: null | string;
        model_id?: null | string;
        provider_id?: null | string;
        session_id: string;
        state: OpenCodeSessionState;
      }>
    | Promise<
        Array<{
          continue_prompt: null | string;
          model_id?: null | string;
          provider_id?: null | string;
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
  model?: OpenCodeSessionModel;
  prompt: string;
  title: string;
};

type OpenCodeSessionModel = {
  modelID: string;
  providerID: string;
};

export type PushOpenCodeSessionContinuationInput = {
  model?: OpenCodeSessionModel;
  prompt: string;
  sessionId: string;
};

const staleAfterMilliseconds = 30 * 60 * 1000;
const pollSleepMilliseconds = 1000;
const continuationRetryThrottleMilliseconds = staleAfterMilliseconds;

const summarizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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
  createSession(
    input: CreateManagedOpenCodeSessionInput,
  ): Promise<AsyncDisposable & { sessionId: string }>;
  pushContinuationPrompt(
    input: PushOpenCodeSessionContinuationInput,
  ): Promise<void>;
} => {
  const stack = new AsyncDisposableStack();
  const abortController = new AbortController();
  const client = createOpencodeClient({ baseUrl });
  const lastContinuationAttemptBySessionId = new Map<
    string,
    { attemptedAt: number; latestMessageTime: number }
  >();
  if (Symbol.asyncDispose in repository) {
    stack.use(repository as AsyncDisposable);
  }

  const watchPendingSessions = async () => {
    while (!abortController.signal.aborted) {
      let pendingSessions: Awaited<ReturnType<typeof repository.listSessions>>;

      try {
        pendingSessions = await repository.listSessions({
          state: "pending",
        });
      } catch (error) {
        console.warn("OpenCode pending session scan failed", {
          error: summarizeError(error),
        });
        await sleep(pollSleepMilliseconds, abortController.signal);

        continue;
      }

      for (const session of pendingSessions) {
        if (abortController.signal.aborted) {
          break;
        }

        try {
          const prompt = session.continue_prompt?.trim();
          if (prompt) {
            const latestMessageTime = await getLatestMessageTime(
              client,
              session.session_id,
            );

            if (Date.now() - latestMessageTime >= staleAfterMilliseconds) {
              const lastAttempt = lastContinuationAttemptBySessionId.get(
                session.session_id,
              );
              if (
                lastAttempt?.latestMessageTime === latestMessageTime &&
                Date.now() - lastAttempt.attemptedAt <
                  continuationRetryThrottleMilliseconds
              ) {
                await sleep(pollSleepMilliseconds, abortController.signal);

                continue;
              }

              const model =
                session.provider_id && session.model_id
                  ? {
                      modelID: session.model_id,
                      providerID: session.provider_id,
                    }
                  : undefined;

              lastContinuationAttemptBySessionId.set(session.session_id, {
                attemptedAt: Date.now(),
                latestMessageTime,
              });
              await client.session.promptAsync({
                body: { model, parts: [{ text: prompt, type: "text" }] },
                path: { id: session.session_id },
                throwOnError: true,
              });
            } else {
              lastContinuationAttemptBySessionId.delete(session.session_id);
            }
          }
        } catch (error) {
          console.warn("OpenCode pending session recovery failed", {
            error: summarizeError(error),
            session_id: session.session_id,
          });
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
    async createSession({ directory, model, prompt, title }) {
      const session = await client.session.create({
        body: { title },
        query: { directory },
        throwOnError: true,
      });

      await repository.createSession({
        continue_prompt: prompt,
        model_id: model?.modelID ?? null,
        provider_id: model?.providerID ?? null,
        session_id: session.data.id,
      });

      return {
        async [Symbol.asyncDispose]() {
          await client.session.abort({
            path: { id: session.data.id },
            query: { directory },
            throwOnError: true,
          });
        },
        sessionId: session.data.id,
      };
    },
    async pushContinuationPrompt({ model, prompt, sessionId }) {
      await client.session.promptAsync({
        body: { model, parts: [{ text: prompt, type: "text" }] },
        path: { id: sessionId },
        throwOnError: true,
      });
    },
  };
};
