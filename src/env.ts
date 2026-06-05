import { z } from "zod";

const HEX_32 = /^[0-9a-f]{64}$/i;

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().min(1).optional(),

  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_URL: z.string().url().optional(),

  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM: z.string().min(1).optional(),

  /**
   * Server-held Anthropic key powering the free managed AI tier (Step 19).
   * Every user gets managed Claude Haiku with no setup; absence means the
   * managed tier is disabled (BYO keys still work).
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  ENCRYPTION_KEY: z
    .string()
    .regex(
      HEX_32,
      "ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32",
    )
    .optional(),

  COLLAB_URL: z.string().min(1).optional(),
  COLLAB_SECRET: z.string().min(1).optional(),

  /**
   * Shared secret authenticating Vercel cron requests (Step 15+). Vercel
   * sends `Authorization: Bearer $CRON_SECRET` automatically when set on
   * the project. We treat absence as "cron disabled" so local dev doesn't
   * accidentally accept unauthenticated requests at the cron endpoints.
   */
  CRON_SECRET: z.string().min(1).optional(),

  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().min(1).optional(),
  STRIPE_PRICE_BUSINESS_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_BUSINESS_YEARLY: z.string().min(1).optional(),

  JACKSON_API_KEY: z.string().min(1).optional(),

  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000"),
  /**
   * WebSocket URL the browser uses to connect to the Hocuspocus collab server.
   * Distinct from the server-side COLLAB_URL because secrets/internal hostnames
   * may differ from what the browser can reach.
   */
  NEXT_PUBLIC_COLLAB_URL: z
    .string()
    .min(1)
    .default("ws://localhost:1234"),
  NEXT_PUBLIC_SENTRY_DSN: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z
    .string()
    .url()
    .default("https://us.i.posthog.com"),
});

const fullSchema = z.object({
  ...serverSchema.shape,
  ...clientSchema.shape,
});

const rawEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  COLLAB_URL: process.env.COLLAB_URL,
  COLLAB_SECRET: process.env.COLLAB_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
  STRIPE_PRICE_PRO_YEARLY: process.env.STRIPE_PRICE_PRO_YEARLY,
  STRIPE_PRICE_BUSINESS_MONTHLY: process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
  STRIPE_PRICE_BUSINESS_YEARLY: process.env.STRIPE_PRICE_BUSINESS_YEARLY,
  JACKSON_API_KEY: process.env.JACKSON_API_KEY,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_COLLAB_URL: process.env.NEXT_PUBLIC_COLLAB_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
};

const parsed = fullSchema.safeParse(rawEnv);

if (!parsed.success) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "_");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  console.error("Invalid environment variables:");
  for (const [key, messages] of Object.entries(fieldErrors)) {
    console.error(`  ${key}: ${messages.join(", ")}`);
  }
  throw new Error(
    "Invalid environment variables. Check your .env.local against .env.example.",
  );
}

export const env = parsed.data;

export type Env = typeof env;

/**
 * Read an env var that a feature requires at runtime. Use this from feature
 * code (auth, billing, AI, etc.) instead of `env.X!` so the user gets a clear
 * error message when a not-yet-configured feature is exercised.
 */
export function requireEnv<K extends keyof Env>(
  key: K,
  hint?: string,
): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    const suffix = hint ? ` ${hint}` : "";
    throw new Error(`Required environment variable ${key} is not set.${suffix}`);
  }
  return value as NonNullable<Env[K]>;
}
