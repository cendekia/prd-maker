"use server";

import { revalidatePath } from "next/cache";

import { verifyAnthropicKey } from "@/lib/ai";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/workspace";

/**
 * Store an optional personal Anthropic key (Step 19). The key is verified
 * against Anthropic before storage, encrypted at rest (AES-256-GCM), and never
 * returned afterwards — only the last 4 chars are kept for display.
 */
export async function saveAnthropicKeyAction(
  rawKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const key = (rawKey ?? "").trim();

  const verdict = await verifyAnthropicKey(key);
  if (!verdict.ok) return { ok: false, error: verdict.error };

  let encrypted: ReturnType<typeof encryptSecret>;
  try {
    encrypted = encryptSecret(key);
  } catch {
    return {
      ok: false,
      error:
        "Keys can't be stored yet — the server's ENCRYPTION_KEY isn't configured. Contact your admin.",
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      anthropicKeyCipher: encrypted.cipher,
      anthropicKeyIv: encrypted.iv,
      anthropicKeyTag: encrypted.tag,
      anthropicKeyLast4: key.slice(-4),
    },
  });
  revalidatePath("/account/api-keys");
  return { ok: true };
}

/** Remove the stored personal key — reverts the user to the managed tier. */
export async function removeAnthropicKeyAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db.user.update({
    where: { id: user.id },
    data: {
      anthropicKeyCipher: null,
      anthropicKeyIv: null,
      anthropicKeyTag: null,
      anthropicKeyLast4: null,
    },
  });
  revalidatePath("/account/api-keys");
  return { ok: true };
}
