import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/env";
import { AI_MODELS } from "@/lib/config";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";

export { AI_MODELS };

/** Thrown when neither a personal key nor the server managed key is available. */
export class AiUnavailableError extends Error {
  constructor(
    message = "AI is not configured. Add a personal Anthropic key in Account → API keys, or ask an admin to set the server key.",
  ) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export interface ResolvedAiClient {
  client: Anthropic;
  /** Model id to request (BYO → Sonnet, managed → Haiku). */
  model: string;
  /** True when using the user's own key (bypasses managed quotas). */
  byo: boolean;
}

/**
 * Resolve the Anthropic client for a request (Step 19).
 *
 * - If the user stored a personal key, decrypt it and use the stronger model
 *   (Sonnet). BYO requests bypass managed quotas — they bill the user's key.
 * - Otherwise fall back to the server-held managed key with Haiku.
 *
 * `workspaceId` is part of the signature so callers (Step 20) can thread the
 * quota context through one call; the resolver itself keys off the user.
 */
export async function resolveAiClient(opts: {
  workspaceId: string;
  userId: string;
}): Promise<ResolvedAiClient> {
  const user = await db.user.findUnique({
    where: { id: opts.userId },
    select: {
      anthropicKeyCipher: true,
      anthropicKeyIv: true,
      anthropicKeyTag: true,
    },
  });

  if (
    user?.anthropicKeyCipher &&
    user.anthropicKeyIv &&
    user.anthropicKeyTag
  ) {
    const apiKey = decryptSecret({
      cipher: user.anthropicKeyCipher,
      iv: user.anthropicKeyIv,
      tag: user.anthropicKeyTag,
    });
    return { client: new Anthropic({ apiKey }), model: AI_MODELS.byo, byo: true };
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new AiUnavailableError();
  }
  return {
    client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
    model: AI_MODELS.managed,
    byo: false,
  };
}

/**
 * Verify an Anthropic key by hitting `GET /v1/models`. Shared by the
 * "Test connection" route and the save action so a bad key is never stored.
 * Never logs or echoes the key.
 */
export async function verifyAnthropicKey(
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = apiKey.trim();
  if (!trimmed.startsWith("sk-ant-") || trimmed.length < 20) {
    return {
      ok: false,
      error: "That doesn't look like an Anthropic API key (expected sk-ant-…).",
    };
  }
  try {
    const client = new Anthropic({ apiKey: trimmed });
    await client.models.list({ limit: 1 });
    return { ok: true };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Anthropic rejected this key (invalid or revoked)." };
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, error: "This key lacks permission to access the Models API." };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `Couldn't reach Anthropic (${err.status ?? "network"}). Try again.` };
    }
    return { ok: false, error: "Couldn't verify the key. Try again." };
  }
}
