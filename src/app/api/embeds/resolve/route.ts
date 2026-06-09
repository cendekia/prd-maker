import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolveEmbed } from "@/lib/embeds";
import { parseUrl } from "@/lib/embeds/match";

// Resolution may make an outbound oEmbed request (SoundCloud) — keep this on
// the Node.js runtime where `fetch` + `AbortSignal.timeout` are available.
export const runtime = "nodejs";
// An outbound oEmbed request can be slow; cap it well under the platform max so
// a hung provider returns an error instead of a function timeout.
export const maxDuration = 15;

/**
 * POST /api/embeds/resolve  { url }  ->  EmbedData
 *
 * Auth is required (any workspace member) so this can't be used as an open
 * proxy. Resolution itself only ever contacts a fixed allowlist of provider
 * endpoints — never the user-supplied host directly — so there's no SSRF.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.url !== "string" || !parseUrl(body.url)) {
    return NextResponse.json(
      { error: "A valid http(s) url is required" },
      { status: 400 },
    );
  }

  const data = await resolveEmbed(body.url);
  if (!data) {
    return NextResponse.json({ error: "Could not resolve embed" }, { status: 422 });
  }
  return NextResponse.json(data);
}
