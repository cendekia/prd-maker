import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";

import authConfig from "@/auth.config";
import { db } from "@/lib/db";
import { sendMagicLinkEmail } from "@/lib/email";
import { env } from "@/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  secret: env.AUTH_SECRET,
  trustHost: true,
  providers: [
    ...authConfig.providers,
    Resend({
      // Auth.js requires a non-empty apiKey here; our custom send falls back
      // to a console log when the real key is missing (see lib/email.ts).
      apiKey: env.RESEND_API_KEY ?? "noop",
      from: env.RESEND_FROM ?? "PRDMaker <onboarding@resend.dev>",
      async sendVerificationRequest({ identifier, url }) {
        const host = new URL(url).host;
        await sendMagicLinkEmail({ to: identifier, url, host });
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    session({ session, user }) {
      // Database sessions: `user` is the DB User row.
      session.user.id = user.id;
      return session;
    },
  },
});
