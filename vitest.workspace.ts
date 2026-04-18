import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "contract",
          include: ["modules/contract/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "api",
          include: ["modules/api/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "cli",
          include: ["modules/cli/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "repo",
          include: ["test/repo/**/*.test.ts"],
        },
      },
    ],
  },
});
