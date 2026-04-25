import { describe, expect, it, vi } from "vitest";

const mockRegisterHealthRoute = vi.fn();
const mockRegisterManagerReportRoutes = vi.fn();
const mockRegisterOpenCodeModelRoutes = vi.fn();
const mockRegisterTaskRoutes = vi.fn();

vi.mock("@aim-ai/contract", () => ({
  openApiDocument: { openapi: "3.1.0" },
}));

vi.mock("../src/routes/health.js", () => ({
  registerHealthRoute: mockRegisterHealthRoute,
}));

vi.mock("../src/routes/manager-reports.js", () => ({
  registerManagerReportRoutes: mockRegisterManagerReportRoutes,
}));

vi.mock("../src/routes/opencode-models.js", () => ({
  registerOpenCodeModelRoutes: mockRegisterOpenCodeModelRoutes,
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

  it("passes the OpenCode models adapter through to model routes", async () => {
    const openCodeModelsAdapter = {
      listSupportedModels: vi.fn(),
    };

    const { createApp } = await import("../src/app.js");

    createApp({ openCodeModelsAdapter });

    expect(mockRegisterOpenCodeModelRoutes).toHaveBeenCalledWith(
      expect.anything(),
      { adapter: openCodeModelsAdapter },
    );
  });
});
