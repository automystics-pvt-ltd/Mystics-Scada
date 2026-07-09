import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // SESSION_SECRET must be present before app.ts is imported (it throws
    // at module load time when absent). Setting it here ensures vitest
    // injects it into process.env before any test file's static imports run.
    env: {
      SESSION_SECRET: "test-secret-do-not-use-in-production",
    },
  },
});
