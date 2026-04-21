import { describe, expect, it, vi } from "vitest";

const mockRegisterHealthRoute = vi.fn();
const mockRegisterTaskRoutes = vi.fn();

vi.mock("@aim-ai/contract", () => ({
  openApiDocument: { openapi: "3.1.0" },
}));

vi.mock("../src/routes/health.js", () => ({
  registerHealthRoute: mockRegisterHealthRoute,
}));

vi.mock("../src/routes/tasks.js", () => ({
  registerTaskRoutes: mockRegisterTaskRoutes,
}));

describe("app wiring", () => {
  it("passes the shared logger through to task routes", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    const { createApp } = await import("../src/app.js");

    createApp({ logger });

    expect(mockRegisterTaskRoutes).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ logger }),
    );
  });
});
