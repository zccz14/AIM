type OpenCodeMessage = {
  info: {
    cost?: number;
    id: string;
    role: string;
    sessionID?: string;
    tokens?: Partial<TokenUsage> & {
      cache?: Partial<TokenUsage["cache"]>;
    };
  };
  parts?: Array<{
    state?: {
      metadata?: {
        sessionId?: unknown;
      };
    };
    type?: string;
  }>;
};

export type TokenUsage = {
  cache: {
    read: number;
    write: number;
  };
  input: number;
  output: number;
  reasoning: number;
  total: number;
};

export type MessageTokenStat = {
  cost: number;
  messageId: string;
  role: string;
  sessionId: string;
  tokens: TokenUsage;
};

export type TokenStats = {
  messages: MessageTokenStat[];
  totals: TokenUsage & {
    cost: number;
    messages: number;
  };
};

const zeroTokens = (): TokenUsage => ({
  cache: { read: 0, write: 0 },
  input: 0,
  output: 0,
  reasoning: 0,
  total: 0,
});

const normalizeTokens = (tokens: OpenCodeMessage["info"]["tokens"] = {}) => {
  const normalized = {
    cache: {
      read: tokens.cache?.read ?? 0,
      write: tokens.cache?.write ?? 0,
    },
    input: tokens.input ?? 0,
    output: tokens.output ?? 0,
    reasoning: tokens.reasoning ?? 0,
    total: tokens.total ?? 0,
  };

  if (normalized.total === 0) {
    normalized.total =
      normalized.input +
      normalized.output +
      normalized.reasoning +
      normalized.cache.read +
      normalized.cache.write;
  }

  return normalized;
};

export const statTokens = (
  messages: OpenCodeMessage[],
  fallbackSessionId = "",
): TokenStats => {
  const messageStats = messages.map<MessageTokenStat>((message) => ({
    cost: message.info.cost ?? 0,
    messageId: message.info.id,
    role: message.info.role,
    sessionId: message.info.sessionID ?? fallbackSessionId,
    tokens: normalizeTokens(message.info.tokens),
  }));

  return totalMessageStats(messageStats);
};

const totalMessageStats = (messages: MessageTokenStat[]): TokenStats => {
  const totals = messages.reduce(
    (sum, message) => {
      sum.cache.read += message.tokens.cache.read;
      sum.cache.write += message.tokens.cache.write;
      sum.cost += message.cost;
      sum.input += message.tokens.input;
      sum.messages += 1;
      sum.output += message.tokens.output;
      sum.reasoning += message.tokens.reasoning;
      sum.total += message.tokens.total;

      return sum;
    },
    { ...zeroTokens(), cost: 0, messages: 0 },
  );

  return { messages, totals };
};

const findSubSessionIds = (messages: OpenCodeMessage[]) =>
  messages.flatMap((message) =>
    (message.parts ?? [])
      .map((part) => part.state?.metadata?.sessionId)
      .filter(
        (sessionId): sessionId is string => typeof sessionId === "string",
      ),
  );

const fetchSessionMessages = async (baseUrl: string, sessionId: string) => {
  const url = `${baseUrl.replace(/\/+$/, "")}/session/${encodeURIComponent(
    sessionId,
  )}/message`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `OpenCode API returned ${response.status} while fetching session messages`,
    );
  }

  return (await response.json()) as OpenCodeMessage[];
};

export const statTokensBySessionId = async (
  baseUrl: string,
  sessionId: string,
): Promise<TokenStats> => {
  const visited = new Set<string>();
  const collect = async (
    currentSessionId: string,
  ): Promise<MessageTokenStat[]> => {
    if (visited.has(currentSessionId)) {
      return [];
    }

    visited.add(currentSessionId);

    const messages = await fetchSessionMessages(baseUrl, currentSessionId);
    const currentStats = statTokens(messages, currentSessionId).messages;
    const childStats = await Promise.all(
      findSubSessionIds(messages).map((childSessionId) =>
        collect(childSessionId),
      ),
    );

    return [...currentStats, ...childStats.flat()];
  };

  return totalMessageStats(await collect(sessionId));
};
