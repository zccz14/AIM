import { describe, expect, it, vi } from "vitest";

import { statTokensBySessionId } from "../src/stat-tokens.js";

describe("statTokensBySessionId", () => {
  it("fetches session messages, totals assistant token usage, and includes sub sessions referenced by task tool metadata", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === "http://opencode.test/session/root-session/message") {
        return Response.json([
          {
            info: {
              id: "root-user-message",
              role: "user",
              sessionID: "root-session",
            },
            parts: [{ text: "Please do the work", type: "text" }],
          },
          {
            info: {
              cost: 1.25,
              id: "root-assistant-message",
              role: "assistant",
              sessionID: "root-session",
              tokens: {
                cache: { read: 30, write: 40 },
                input: 10,
                output: 20,
                reasoning: 5,
                total: 105,
              },
            },
            parts: [
              {
                state: {
                  metadata: { sessionId: "child-session" },
                  status: "running",
                },
                tool: "task",
                type: "tool",
              },
            ],
          },
        ]);
      }

      if (url === "http://opencode.test/session/child-session/message") {
        return Response.json([
          {
            info: {
              cost: 2.5,
              id: "child-assistant-message",
              role: "assistant",
              sessionID: "child-session",
              tokens: {
                cache: { read: 300, write: 400 },
                input: 100,
                output: 200,
                reasoning: 50,
                total: 1050,
              },
            },
            parts: [],
          },
        ]);
      }

      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetch);

    const stats = await statTokensBySessionId(
      "http://opencode.test/",
      "root-session",
    );

    expect(fetch).toHaveBeenCalledWith(
      "http://opencode.test/session/root-session/message",
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://opencode.test/session/child-session/message",
    );
    expect(stats).toEqual({
      messages: [
        {
          cost: 0,
          messageId: "root-user-message",
          role: "user",
          sessionId: "root-session",
          tokens: {
            cache: { read: 0, write: 0 },
            input: 0,
            output: 0,
            reasoning: 0,
            total: 0,
          },
        },
        {
          cost: 1.25,
          messageId: "root-assistant-message",
          role: "assistant",
          sessionId: "root-session",
          tokens: {
            cache: { read: 30, write: 40 },
            input: 10,
            output: 20,
            reasoning: 5,
            total: 105,
          },
        },
        {
          cost: 2.5,
          messageId: "child-assistant-message",
          role: "assistant",
          sessionId: "child-session",
          tokens: {
            cache: { read: 300, write: 400 },
            input: 100,
            output: 200,
            reasoning: 50,
            total: 1050,
          },
        },
      ],
      totals: {
        cache: { read: 330, write: 440 },
        cost: 3.75,
        input: 110,
        messages: 3,
        output: 220,
        reasoning: 55,
        total: 1155,
      },
    });
  });

  it("passes cancellation signals to root and child OpenCode message fetches", async () => {
    const signal = AbortSignal.timeout(1000);
    const fetch = vi.fn(async () =>
      Response.json([
        {
          info: {
            id: "root-assistant-message",
            role: "assistant",
            sessionID: "root-session",
          },
          parts: [
            {
              state: { metadata: { sessionId: "child-session" } },
              tool: "task",
              type: "tool",
            },
          ],
        },
      ]),
    );
    vi.stubGlobal("fetch", fetch);

    await statTokensBySessionId("http://opencode.test/", "root-session", {
      signal,
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://opencode.test/session/root-session/message",
      { signal },
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://opencode.test/session/child-session/message",
      { signal },
    );
  });
});
