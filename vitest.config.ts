import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Minimal Vitest harness bootstrapped for the agent test suite
 * (ai_development_plan.md Step 54). Step 35 (`development_plan.md`) can absorb
 * and extend this when the broader unit/integration suite lands.
 *
 * DB-backed tests run against a dedicated `prdmaker_test` database in the same
 * local Postgres container as dev — never the dev DB (see tests/test-db-url.ts
 * and tests/global-setup.ts). `server-only`/`client-only` are aliased to a
 * no-op so server modules import cleanly under the node test environment.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "tests/stubs/empty.ts"),
      "client-only": path.resolve(root, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Shared test DB → run files sequentially to avoid cross-file races.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
