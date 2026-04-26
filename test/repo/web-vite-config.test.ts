import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import createWebViteConfig from "../../modules/web/vite.config";

describe("web Vite config", () => {
  it("resolves the workspace contract package from source", () => {
    const config = createWebViteConfig({ mode: "test" } as never);

    expect(config.resolve?.alias).toMatchObject({
      "@aim-ai/contract": fileURLToPath(
        new URL("../../modules/contract/src/index.ts", import.meta.url),
      ),
    });
  });
});
