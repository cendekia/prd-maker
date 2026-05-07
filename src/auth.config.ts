import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { env } from "@/env";

const googleConfigured = !!(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
);

/**
 * Edge-safe Auth.js config — no Prisma adapter, no email provider.
 * Imported by middleware (which runs on the edge runtime) and extended in
 * `src/auth.ts` with the adapter + email provider for the full Node.js config.
 *
 * We use JWT sessions because the Prisma adapter can't run on the edge:
 * with database sessions the middleware would receive an opaque session-id
 * cookie it couldn't decode (-> JWEInvalid), so the session itself is signed
 * as a JWT. Email verification tokens still go through the adapter.
 */
export default {
  providers: googleConfigured
    ? [
        Google({
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/verify-request",
    error: "/error",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isSignedIn = !!auth?.user;
      const path = nextUrl.pathname;

      const isPublicPath = PUBLIC_PATHS.some((p) =>
        p === path || (p.endsWith("/*") && path.startsWith(p.slice(0, -2))),
      );

      // Auth pages — bounce signed-in users to the app root.
      if (AUTH_PATHS.includes(path)) {
        if (isSignedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      if (isPublicPath) return true;

      // Everything else requires a session.
      return isSignedIn;
    },
  },
} satisfies NextAuthConfig;

/** Routes that anyone can visit. */
export const PUBLIC_PATHS: string[] = [
  "/",
  "/pricing",
  "/privacy",
  "/terms",
  "/p/*", // public published pages (Step 23)
  "/invite/*", // invite-acceptance flow (Step 6)
  "/api/auth/*", // Auth.js internals
  "/api/cron/*", // Vercel cron — endpoints enforce CRON_SECRET themselves (Step 15+)
];

/** Auth-flow pages — public, but signed-in users get redirected away. */
export const AUTH_PATHS = ["/sign-in", "/verify-request", "/error"];
