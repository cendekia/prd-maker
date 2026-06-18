import { testDatabaseUrl } from "./test-db-url";

/**
 * Per-worker setup (Step 54). Point every module under test at the test DB
 * BEFORE any of them (notably `@/lib/db`, which reads `DATABASE_URL` from
 * process.env at instantiation) is imported by a test file. Setup files run
 * before the test module graph is evaluated, so this binds the Prisma client
 * to `prdmaker_test`.
 */
// Vitest already sets NODE_ENV=test; we only need to redirect the DB.
process.env.DATABASE_URL = testDatabaseUrl();
