import { createOpencodeClient } from "@opencode-ai/sdk";

import { AIM_SESSION_SETTLEMENT_PROTOCOL } from "./aim-session-settlement-protocol.js";
import { cancelableSleep } from "./cancelable-sleep.js";

type OpenCodeSessionState = "pending" | "rejected" | "resolved";

type OpenCodeSessionRepository = AsyncDisposable & {
  createSession(input: {
    continue_prompt?: null | string;
    model_id?: null | string;
    provider_id?: null | string;
    session_id: string;
  }): Promise<unknown> | unknown;
  deleteSessionById(sessionId: string): Promise<unknown> | unknown;
  getSessionReferences(sessionId: string):
    | {
        coordinator_state_project_ids: string[];
        manager_state_project_ids: string[];
        task_ids: string[];
      }
    | Promise<{
        coordinator_state_project_ids: string[];
        manager_state_project_ids: string[];
        task_ids: string[];
      }>;
  listSessions(filter: { state?: OpenCodeSessionState }):
    | Array<{
        continue_prompt: null | string;
        created_at: string;
        model_id?: null | string;
        provider_id?: null | string;
        session_id: string;
        state: OpenCodeSessionState;
      }>
    | Promise<
        Array<{
          continue_prompt: null | string;
          created_at: string;
          model_id?: null | string;
          provider_id?: null | string;
          session_id: string;
          state: OpenCodeSessionState;
        }>
      >;
};

type PendingOpenCodeSession = Awaited<
  ReturnType<OpenCodeSessionRepository["listSessions"]>
>[number];

export type CreateOpenCodeSessionManagerOptions = {
  apiBaseUrl?: string;
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

type OpenCodeSessionMessage = {
  info: {
    time: { created: number };
  };
  parts?: Array<{
    state?: {
      metadata?: {
        sessionId?: unknown;
      };
    };
  }>;
};

export type PushOpenCodeSessionContinuationInput = {
  model?: OpenCodeSessionModel;
  prompt: string;
  sessionId: string;
};

export type OpenCodeSessionManager = AsyncDisposable & {
  createSession(
    input: CreateManagedOpenCodeSessionInput,
  ): Promise<AsyncDisposable & { sessionId: string }>;
  pushContinuationPrompt(
    input: PushOpenCodeSessionContinuationInput,
  ): Promise<void>;
};

const staleAfterMilliseconds = 5 * 60 * 1000;
const orphanCleanupGraceMilliseconds = 5 * 60 * 1000;
const pollSleepMilliseconds = 1000;
const defaultApiBaseUrl = "http://localhost:8192";
const normalizeApiBaseUrl = (apiBaseUrl: string) =>
  apiBaseUrl.replace(/\/+$/, "") || defaultApiBaseUrl;
const continuationTerminalInstructions = ({
  apiBaseUrl,
  sessionId,
}: {
  apiBaseUrl: string;
  sessionId: string;
}) => {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  const resolveUrl = `${normalizedApiBaseUrl}/opencode/sessions/${sessionId}/resolve`;
  const rejectUrl = `${normalizedApiBaseUrl}/opencode/sessions/${sessionId}/reject`;

  return `

${AIM_SESSION_SETTLEMENT_PROTOCOL}: when the session objective is complete, settle this session with curl:
curl -X POST "${resolveUrl}" -H "Content-Type: application/json" --data '{"value":"<final result>"}'
When the session is unable to proceed or the objective is invalid, settle it with curl:
curl -X POST "${rejectUrl}" -H "Content-Type: application/json" --data '{"reason":"<failure reason>"}'
If you do not settle this session through the AIM API, this loop will not end.`;
};

export const withContinuation = (
  prompt: string,
  options: { apiBaseUrl: string; sessionId: string },
) => `${prompt}${continuationTerminalInstructions(options)}`;

const summarizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const getErrorStatus = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }

  const response = "response" in error ? error.response : undefined;
  if (
    response &&
    typeof response === "object" &&
    "status" in response &&
    typeof response.status === "number"
  ) {
    return response.status;
  }

  return undefined;
};

const isOpenCodeSessionNotFoundError = (error: unknown) =>
  getErrorStatus(error) === 404 ||
  (error instanceof Error &&
    /session .*not found|not found/i.test(error.message));

const getLatestMessageTime = async (
  client: ReturnType<typeof createOpencodeClient>,
  sessionId: string,
  visited = new Set<string>(),
) => {
  if (visited.has(sessionId)) {
    return 0;
  }

  visited.add(sessionId);

  const response = await client.session.messages({
    path: { id: sessionId },
    throwOnError: true,
  });
  const messages = response.data as OpenCodeSessionMessage[];
  const latestMessage = messages.at(-1);
  let latestMessageTime = latestMessage?.info.time.created ?? 0;

  for (const childSessionId of messages.flatMap((message) =>
    (message.parts ?? [])
      .map((part) => part.state?.metadata?.sessionId)
      .filter(
        (childSessionId): childSessionId is string =>
          typeof childSessionId === "string",
      ),
  )) {
    latestMessageTime = Math.max(
      latestMessageTime,
      await getLatestMessageTime(client, childSessionId, visited),
    );
  }

  return latestMessageTime;
};

const hasSessionReferences = ({
  coordinator_state_project_ids,
  manager_state_project_ids,
  task_ids,
}: Awaited<ReturnType<OpenCodeSessionRepository["getSessionReferences"]>>) =>
  task_ids.length > 0 ||
  manager_state_project_ids.length > 0 ||
  coordinator_state_project_ids.length > 0;

const isOlderThanOrphanGrace = (createdAt: string) => {
  const createdAtTime = Date.parse(createdAt);

  return (
    !Number.isNaN(createdAtTime) &&
    Date.now() - createdAtTime >= orphanCleanupGraceMilliseconds
  );
};

export const createOpenCodeSessionManager = ({
  apiBaseUrl = defaultApiBaseUrl,
  baseUrl,
  repository,
}: CreateOpenCodeSessionManagerOptions): OpenCodeSessionManager => {
  const stack = new AsyncDisposableStack();
  const abortController = new AbortController();
  const client = createOpencodeClient({ baseUrl });
  stack.use(repository);

  const handleOrphanSession = async (session: PendingOpenCodeSession) => {
    if (!isOlderThanOrphanGrace(session.created_at)) {
      return;
    }

    try {
      await client.session.delete({
        path: { id: session.session_id },
        throwOnError: true,
      });
    } catch (error) {
      if (isOpenCodeSessionNotFoundError(error)) {
        await repository.deleteSessionById(session.session_id);
        return;
      }

      console.warn("OpenCode orphan runtime cleanup failed", {
        error: summarizeError(error),
        session_id: session.session_id,
      });

      return;
    }

    await repository.deleteSessionById(session.session_id);
  };

  const getLatestMessageTimeOrDeleteDangling = async (sessionId: string) => {
    try {
      return await getLatestMessageTime(client, sessionId);
    } catch (error) {
      if (!isOpenCodeSessionNotFoundError(error)) {
        throw error;
      }

      try {
        await repository.deleteSessionById(sessionId);
      } catch (deleteError) {
        console.warn("OpenCode dangling session cleanup failed", {
          error: summarizeError(deleteError),
          session_id: sessionId,
        });
      }

      return undefined;
    }
  };

  const pushContinuation = async (
    session: PendingOpenCodeSession,
    prompt: string,
  ) => {
    const model =
      session.provider_id && session.model_id
        ? {
            modelID: session.model_id,
            providerID: session.provider_id,
          }
        : undefined;

    await client.session.promptAsync({
      body: {
        model,
        parts: [
          {
            text: withContinuation(prompt, {
              apiBaseUrl,
              sessionId: session.session_id,
            }),
            type: "text",
          },
        ],
      },
      path: { id: session.session_id },
      throwOnError: true,
    });
  };

  const handlePendingSession = async (session: PendingOpenCodeSession) => {
    const sessionReferences = await repository.getSessionReferences(
      session.session_id,
    );
    if (!hasSessionReferences(sessionReferences)) {
      await handleOrphanSession(session);
      return;
    }

    const latestMessageTime = await getLatestMessageTimeOrDeleteDangling(
      session.session_id,
    );
    if (latestMessageTime === undefined) {
      return;
    }

    const prompt = session.continue_prompt?.trim();
    if (!prompt) {
      return;
    }

    if (Date.now() - latestMessageTime < staleAfterMilliseconds) {
      return;
    }

    await pushContinuation(session, prompt);
  };

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
        await cancelableSleep(pollSleepMilliseconds, {
          signal: abortController.signal,
        }).catch(() => undefined);

        continue;
      }

      for (const session of pendingSessions) {
        if (abortController.signal.aborted) {
          break;
        }

        try {
          await handlePendingSession(session);
        } catch (error) {
          console.warn("OpenCode pending session recovery failed", {
            error,
            session_id: session.session_id,
          });
        } finally {
          await cancelableSleep(pollSleepMilliseconds, {
            signal: abortController.signal,
          }).catch(() => undefined);
        }
      }

      await cancelableSleep(pollSleepMilliseconds, {
        signal: abortController.signal,
      }).catch(() => undefined);
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
        body: {
          model,
          parts: [
            {
              text: withContinuation(prompt, { apiBaseUrl, sessionId }),
              type: "text",
            },
          ],
        },
        path: { id: sessionId },
        throwOnError: true,
      });
    },
  };
};
