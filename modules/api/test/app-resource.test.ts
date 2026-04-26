import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateTaskRepository = vi.fn();

vi.mock("@aim-ai/contract", async () => {
  return await import("../../contract/src/index.ts");
});

vi.mock("../src/task-repository.js", () => ({
  createTaskRepository: mockCreateTaskRepository,
}));

describe("app resource cleanup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("async-disposes route-owned repositories created by requests", async () => {
    const taskRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      listTasks: vi.fn().mockResolvedValue([]),
    };

    mockCreateTaskRepository.mockReturnValue(taskRepository);

    const { createApp } = await import("../src/app.js");

    await (async () => {
      await using app = createApp();

      const response = await app.request("/tasks");

      expect(response.status).toBe(200);
    })();

    expect(taskRepository[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("does not create lazy route repositories only to dispose the app", async () => {
    const { createApp } = await import("../src/app.js");

    await (async () => {
      await using _app = createApp();
    })();

    expect(mockCreateTaskRepository).not.toHaveBeenCalled();
  });

  it("shares app async disposal across repeated cleanup", async () => {
    const taskRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      listTasks: vi.fn().mockResolvedValue([]),
    };

    mockCreateTaskRepository.mockReturnValue(taskRepository);

    const { createApp } = await import("../src/app.js");

    await (async () => {
      const app = createApp();
      await using _first = app;
      await using _second = app;

      await app.request("/tasks");
    })();

    expect(taskRepository[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });
});
