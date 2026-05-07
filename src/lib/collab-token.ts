import "server-only";

import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

import { requireEnv } from "@/env";

const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour — clients reconnect on expiry.

const PRESENCE_PALETTE = [
  "var(--presence-1)",
  "var(--presence-2)",
  "var(--presence-3)",
  "var(--presence-4)",
  "var(--presence-5)",
  "var(--presence-6)",
] as const;

export interface IssuedCollabToken {
  token: string;
  expiresAt: number;
  /** Mirrors the JWT body so the client can use it for awareness without decoding. */
  presence: { name: string; color: string; userId: string };
}

interface IssueArgs {
  pageId: string;
  userId: string;
  role: Role;
  name: string;
  /** Optional — if omitted, a deterministic palette color is chosen from userId. */
  color?: string;
}

export function issueCollabToken({
  pageId,
  userId,
  role,
  name,
  color,
}: IssueArgs): IssuedCollabToken {
  const secret = requireEnv("COLLAB_SECRET");
  const resolvedColor = color ?? colorFromUserId(userId);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_SECONDS;

  const token = jwt.sign(
    {
      pageId,
      userId,
      role,
      name,
      color: resolvedColor,
      iat: now,
      exp: expiresAt,
    },
    secret,
    { algorithm: "HS256" },
  );

  return {
    token,
    expiresAt,
    presence: { name, color: resolvedColor, userId },
  };
}

/** Stable per-user color picked from the design system's presence palette. */
function colorFromUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PRESENCE_PALETTE.length;
  return PRESENCE_PALETTE[idx];
}
