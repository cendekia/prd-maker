import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * The DATABASE_URL the agent test suite runs against — a dedicated
 * `prdmaker_test` database, derived from the dev `DATABASE_URL` (or an
 * explicit `TEST_DATABASE_URL`). Never the dev `prdmaker` DB.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  let base = process.env.DATABASE_URL;
  if (!base) {
    try {
      const env = readFileSync(path.join(root, ".env"), "utf8");
      base = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
    } catch {
      /* fall through to default */
    }
  }
  base =
    base ??
    "postgresql://postgres:postgres@localhost:5432/prdmaker?schema=public";

  // Swap the database name to the test DB, leaving creds/host/params intact.
  return base.replace(/\/prdmaker(\?|$)/, "/prdmaker_test$1");
}
