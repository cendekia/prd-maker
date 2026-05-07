import pg from "pg";

const { Pool } = pg;

/**
 * Postgres pool shared across fetch/store calls. We open one pool per process;
 * Hocuspocus's database extension calls fetch/store frequently so a pool is
 * required (a single client would serialize all I/O).
 */
let pool: pg.Pool | null = null;

export function getPool(connectionString: string): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (err) => {
      console.error("[collab] postgres pool error:", err);
    });
  }
  return pool;
}

/**
 * Read the persisted Yjs state for a page. Returns null if the page has no
 * yDocState yet — the caller should treat that as a brand-new doc.
 */
export async function loadYDocState(
  connectionString: string,
  pageId: string,
): Promise<Uint8Array | null> {
  const p = getPool(connectionString);
  const result = await p.query<{ yDocState: Buffer | null }>(
    'SELECT "yDocState" FROM "Page" WHERE "id" = $1 LIMIT 1',
    [pageId],
  );
  const row = result.rows[0];
  if (!row || !row.yDocState) return null;
  return new Uint8Array(row.yDocState);
}

/**
 * Persist the encoded Yjs state for a page. Called by Hocuspocus on idle and
 * on the last client disconnect (debounced upstream).
 */
export async function storeYDocState(
  connectionString: string,
  pageId: string,
  state: Uint8Array,
): Promise<void> {
  const p = getPool(connectionString);
  await p.query(
    'UPDATE "Page" SET "yDocState" = $1, "updatedAt" = NOW() WHERE "id" = $2',
    [Buffer.from(state), pageId],
  );
}

/**
 * Confirm the Page row exists. Used during auth so we fail fast on a bad JWT
 * pageId before opening the doc.
 */
export async function pageExists(
  connectionString: string,
  pageId: string,
): Promise<boolean> {
  const p = getPool(connectionString);
  const result = await p.query<{ id: string }>(
    'SELECT "id" FROM "Page" WHERE "id" = $1 AND "archivedAt" IS NULL LIMIT 1',
    [pageId],
  );
  return result.rows.length > 0;
}
