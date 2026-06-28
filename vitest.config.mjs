import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    environment: "node",
    globals: false,
    testTimeout: 30000, // live DB smoke queries on a cold Neon compute can be slow
    // DB smoke tests self-skip unless RUN_DB_TESTS=1 and a DATABASE_URL is set.
  },
});
