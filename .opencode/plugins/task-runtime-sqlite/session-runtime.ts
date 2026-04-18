export type SessionRecord = {
  id: string;
  busy?: boolean;
};

export type SessionRuntimeHost = {
  getSession?(
    sessionID: string,
  ): Promise<SessionRecord | null> | SessionRecord | null;
  createSession(): Promise<SessionRecord> | SessionRecord;
  sendPrompt(sessionID: string, prompt: string): Promise<void> | void;
};

export type SessionRuntime = {
  getSession(sessionID: string): Promise<SessionRecord | null>;
  createSession(): Promise<SessionRecord>;
  sendPrompt(sessionID: string, prompt: string): Promise<void>;
};

export const createSessionRuntime = (
  host?: SessionRuntimeHost,
): SessionRuntime => ({
  async getSession(sessionID) {
    return (await host?.getSession?.(sessionID)) ?? null;
  },

  async createSession() {
    if (!host) {
      throw new Error("Session host does not support createSession()");
    }

    return host.createSession();
  },

  async sendPrompt(sessionID, prompt) {
    if (!host) {
      throw new Error("Session host does not support sendPrompt()");
    }

    await host.sendPrompt(sessionID, prompt);
  },
});
