import "dotenv/config";

import { Hocuspocus, type onAuthenticatePayload } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";

import { verifyCollabToken } from "./auth.js";
import { loadYDocState, pageExists, storeYDocState } from "./persistence.js";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(`[collab] required env var ${key} is not set`);
  }
  return value;
}

const DATABASE_URL = requireEnv("DATABASE_URL");
const COLLAB_SECRET = requireEnv("COLLAB_SECRET");
const PORT = Number(process.env.PORT ?? 1234);

const server = new Hocuspocus({
  port: PORT,

  /**
   * Authenticate every WS connection. The Next.js app mints a short-lived
   * HS256 JWT scoped to a single (pageId, userId) — we verify it here, then
   * stash the claims on `context` so later hooks can authorize.
   */
  async onAuthenticate({ token, documentName, connection }: onAuthenticatePayload) {
    if (!token) throw new Error("missing token");
    const claims = verifyCollabToken(token, COLLAB_SECRET);
    if (claims.pageId !== documentName) {
      throw new Error("token pageId does not match document");
    }
    const ok = await pageExists(DATABASE_URL, claims.pageId);
    if (!ok) throw new Error("page not found or archived");

    // VIEWER role gets a read-only connection. Hocuspocus enforces this by
    // dropping any incoming Y.Doc updates from the client.
    if (claims.role === "VIEWER") {
      connection.readOnly = true;
    }
    return claims;
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        const state = await loadYDocState(DATABASE_URL, documentName);
        return state;
      },
      async store({ documentName, state }) {
        await storeYDocState(DATABASE_URL, documentName, state);
      },
    }),
  ],
});

server
  .listen()
  .then(() => {
    console.log(`[collab] hocuspocus listening on :${PORT}`);
  })
  .catch((err: unknown) => {
    console.error("[collab] failed to start:", err);
    process.exit(1);
  });
