import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { verifyAnthropicKey } from "@/lib/ai";

/**
 * "Test connection" for an optional personal Anthropic key (Step 19). Verifies
 * the pasted key against Anthropic `GET /v1/models` without storing it. The key
 * is never logged or echoed back.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { key?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  if (typeof body.key !== "string" || body.key.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "Provide a key to test." },
      { status: 400 },
    );
  }

  const result = await verifyAnthropicKey(body.key);
  return NextResponse.json(result);
}
