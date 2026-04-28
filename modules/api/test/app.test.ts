import { describe, expect, it, vi } from "vitest";

const mockRegisterHealthRoute = vi.fn();
const mockRegisterDbRoutes = vi.fn();
const mockRegisterDimensionRoutes = vi.fn();
const mockRegisterManagerReportRoutes = vi.fn();
const mockRegisterOpenCodeModelRoutes = vi.fn();
const mockRegisterOpenCodeSessionRoutes = vi.fn();
const mockRegisterProjectRoutes = vi.fn();
const mockRegisterTaskRoutes = vi.fn();

vi.mock("@aim-ai/contract", () => ({
  openApiDocument: { openapi: "3.1.0" },
}));

vi.mock("../src/routes/health.js", () => ({
  registerHealthRoute: mockRegisterHealthRoute,
}));

vi.mock("../src/routes/db.js", () => ({
  registerDbRoutes: mockRegisterDbRoutes,
}));

vi.mock("../src/routes/dimensions.js", () => ({
  registerDimensionRoutes: mockRegisterDimensionRoutes,
}));

vi.mock("../src/routes/manager-reports.js", () => ({
  registerManagerReportRoutes: mockRegisterManagerReportRoutes,
}));

vi.mock("../src/routes/opencode-models.js", () => ({
  registerOpenCodeModelRoutes: mockRegisterOpenCodeModelRoutes,
}));

vi.mock("../src/routes/opencode-sessions.js", () => ({
  registerOpenCodeSessionRoutes: mockRegisterOpenCodeSessionRoutes,
}));

vi.mock("../src/routes/projects.js", () => ({
  registerProjectRoutes: mockRegisterProjectRoutes,
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

  it("passes optimizer system presence through to project routes", async () => {
    const optimizerSystem = {
      [Symbol.asyncDispose]: vi.fn(),
    };

    const { createApp } = await import("../src/app.js");

    createApp({ optimizerSystem });

    expect(mockRegisterProjectRoutes).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ optimizerSystem }),
    );
  });
});
