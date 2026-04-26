import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("removed manager report resource routes", () => {
  it("does not expose manager_reports as a first-class API resource", async () => {
    const app = createApp();

    const listResponse = await app.request(
      `/manager_reports?project_path=${encodeURIComponent("/repo/main")}`,
    );
    const createResponse = await app.request("/manager_reports", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_path: "/repo/main",
        report_id: "baseline-1",
        content_markdown: "# Manager Evaluation Signal",
      }),
    });
    const readResponse = await app.request(
      `/manager_reports/baseline-1?project_path=${encodeURIComponent("/repo/main")}`,
    );

    expect(listResponse.status).toBe(404);
    expect(createResponse.status).toBe(404);
    expect(readResponse.status).toBe(404);
  });
});
