import { execFileSync } from "node:child_process";

import { testDatabaseUrl } from "./test-db-url";

/**
 * Vitest global setup (Step 54): ensure a dedicated `prdmaker_test` database
 * exists in the local Postgres container and is migrated to the current
 * schema, before any DB-backed test runs. Idempotent.
 *
 * Uses execFileSync with argument arrays (no shell) — all inputs are static.
 */
export default async function setup() {
  const url = testDatabaseUrl();

  // Create the test database (idempotent). The dev DB runs in the
  // `prdmaker-postgres` container (docker-compose.yml); creating it there
  // keeps the test DB beside dev without touching dev data.
  try {
    execFileSync(
      "docker",
      [
        "exec",
        "prdmaker-postgres",
        "psql",
        "-U",
        "postgres",
        "-c",
        "CREATE DATABASE prdmaker_test",
      ],
      { stdio: "pipe" },
    );
  } catch {
    // Already exists (or the container name differs) — migrate will surface a
    // clear error if the DB truly isn't reachable.
  }

  // Apply migrations to the test DB. Passing DATABASE_URL in the child env
  // wins over the .env value (dotenv doesn't override existing env vars).
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
