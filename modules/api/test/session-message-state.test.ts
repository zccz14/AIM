import { describe, expect, it } from "vitest";

import { classifySessionMessageState } from "../src/session-message-state.js";

const createAssistantRecord = (overrides: Record<string, unknown> = {}) => ({
  info: {
    cost: 0,
    id: "assistant-1",
    mode: "build",
    modelID: "claude-sonnet-4-5",
    parentID: "user-1",
    path: { cwd: "/repo", root: "/repo" },
    providerID: "anthropic",
    role: "assistant",
    sessionID: "session-1",
    time: { created: 1_000, completed: 2_000 },
    tokens: {
      cache: { read: 0, write: 0 },
      input: 0,
      output: 0,
      reasoning: 0,
    },
    finish: "stop",
    ...overrides,
  },
  parts: [
    {
      id: "part-1",
      messageID: "assistant-1",
      sessionID: "session-1",
      type: "step-finish",
      reason: "stop",
      cost: 0,
      tokens: {
        cache: { read: 0, write: 0 },
        input: 0,
        output: 0,
        reasoning: 0,
      },
    },
  ],
});

describe("session message state classifier", () => {
  it("returns idle only when an assistant message is explicitly complete", () => {
    expect(classifySessionMessageState([createAssistantRecord()])).toBe("idle");
  });

  it("returns running when no assistant message exists", () => {
    expect(
      classifySessionMessageState([
        {
          info: {
            id: "user-1",
            role: "user",
            sessionID: "session-1",
            time: { created: 1_000 },
            agent: "general",
            model: { modelID: "m", providerID: "p" },
          },
          parts: [],
        },
      ]),
    ).toBe("running");
  });

  it("returns running when the assistant message has no completed timestamp", () => {
    expect(
      classifySessionMessageState([
        createAssistantRecord({ time: { created: 1_000 } }),
      ]),
    ).toBe("running");
  });

  it("returns running when the assistant message lacks finish markers", () => {
    expect(
      classifySessionMessageState([
        {
          ...createAssistantRecord({ finish: undefined }),
          parts: [],
        },
      ]),
    ).toBe("running");
  });

  it("returns running when a tool part is still running", () => {
    expect(
      classifySessionMessageState([
        {
          ...createAssistantRecord(),
          parts: [
            {
              id: "tool-1",
              callID: "call-1",
              messageID: "assistant-1",
              metadata: {},
              sessionID: "session-1",
              tool: "bash",
              type: "tool",
              state: { status: "running", input: {}, time: { start: 1_500 } },
            },
          ],
        },
      ]),
    ).toBe("running");
  });

  it("returns running for malformed records instead of throwing", () => {
    expect(classifySessionMessageState(null)).toBe("running");
    expect(
      classifySessionMessageState([
        { info: { role: "assistant" }, parts: "bad" },
      ]),
    ).toBe("running");
  });

  it("returns running when assistant info looks complete but parts is invalid", () => {
    expect(
      classifySessionMessageState([
        {
          ...createAssistantRecord(),
          parts: "bad",
        },
      ]),
    ).toBe("running");
  });

  it("uses only the last assistant message when earlier assistant output was complete", () => {
    expect(
      classifySessionMessageState([
        createAssistantRecord(),
        {
          ...createAssistantRecord({
            finish: undefined,
            id: "assistant-2",
            parentID: "assistant-1",
            time: { created: 3_000 },
          }),
          parts: [],
        },
      ]),
    ).toBe("running");
  });

  it("returns running when records are out of order and a newer assistant message is still running", () => {
    expect(
      classifySessionMessageState([
        {
          ...createAssistantRecord({
            finish: undefined,
            id: "assistant-2",
            parentID: "assistant-1",
            time: { created: 3_000 },
          }),
          parts: [],
        },
        createAssistantRecord(),
      ]),
    ).toBe("running");
  });

  it("returns idle when an older malformed assistant record exists before a clearly later completed assistant message", () => {
    expect(
      classifySessionMessageState([
        {
          info: {
            id: "user-0",
            role: "user",
            sessionID: "session-1",
            time: { created: 100 },
          },
          parts: [],
        },
        {
          info: {
            id: "assistant-0",
            role: "assistant",
            sessionID: "session-1",
          },
          parts: "bad",
        },
        createAssistantRecord({
          id: "assistant-1",
          time: { created: 1_000, completed: 2_000 },
        }),
      ]),
    ).toBe("idle");
  });

  it("does not treat equal assistant created timestamps as ambiguous when the last assistant is clear", () => {
    expect(
      classifySessionMessageState([
        {
          ...createAssistantRecord({
            finish: undefined,
            id: "assistant-1",
            time: { created: 1_000 },
          }),
          parts: [],
        },
        createAssistantRecord({
          id: "assistant-2",
          parentID: "assistant-1",
          time: { created: 1_000, completed: 2_000 },
        }),
      ]),
    ).toBe("idle");
  });

  it("ignores non-assistant ordering noise when selecting the last assistant message", () => {
    expect(
      classifySessionMessageState([
        createAssistantRecord({
          id: "assistant-1",
          time: { created: 1_000, completed: 2_000 },
        }),
        {
          info: {
            id: "tool-1",
            role: "tool",
            sessionID: "session-1",
            time: { created: 50 },
          },
          parts: [],
        },
        {
          info: {
            id: "user-2",
            role: "user",
            sessionID: "session-1",
            time: { created: 75 },
          },
          parts: [],
        },
        createAssistantRecord({
          id: "assistant-2",
          parentID: "assistant-1",
          time: { created: 3_000, completed: 4_000 },
        }),
      ]),
    ).toBe("idle");
  });
});
