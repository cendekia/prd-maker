import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { requireEnv } from "@/env";

/**
 * Symmetric encryption for secrets stored at rest (Step 19 — optional BYO
 * Anthropic keys). AES-256-GCM gives confidentiality + integrity: a tampered
 * ciphertext fails `decryptSecret` rather than returning garbage.
 *
 * The key comes from `ENCRYPTION_KEY` (64 hex chars = 32 bytes, validated by
 * the env schema). Cipher/iv/tag are stored as hex strings.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length

export interface EncryptedSecret {
  cipher: string;
  iv: string;
  tag: string;
}

function key(): Buffer {
  return Buffer.from(
    requireEnv(
      "ENCRYPTION_KEY",
      "Generate one with: openssl rand -hex 32",
    ),
    "hex",
  );
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    cipher: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decryptSecret({ cipher, iv, tag }: EncryptedSecret): string {
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipher, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
